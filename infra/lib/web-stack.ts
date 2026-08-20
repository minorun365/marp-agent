import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import type { AgentStack } from './agent-stack.js';
import type { AuthStack } from './auth-stack.js';
import type { FoundationStack } from './foundation-stack.js';
import type { WorkloadAccessStack } from './workload-access-stack.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export interface WebStackProps extends cdk.StackProps {
  readonly appDomain: string;
  readonly previewDomain?: string;
  readonly cutoverWildcardDomain?: string;
  readonly auth: AuthStack;
  readonly agent: AgentStack;
  readonly foundation: FoundationStack;
  readonly workloadAccess: WorkloadAccessStack;
}

export class WebStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    const sharedSlidesBucket = new s3.Bucket(this, 'SharedSlidesBucket', {
      bucketName: `pawapo-shared-slides-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      versioned: true,
      lifecycleRules: [{
        noncurrentVersionExpiration: cdk.Duration.days(30),
      }],
    });

    const localAgentEndpoint = this.node.tryGetContext('localAgentEndpoint') as string | undefined;
    const runtimeConfig = cdk.Fn.toJsonString({
      auth: {
        region: this.region,
        userPoolId: props.auth.userPool.userPoolId,
        userPoolClientId: props.auth.userPoolClient.userPoolClientId,
        cognitoDomain: props.auth.cognitoDomain
          ? `${props.auth.cognitoDomain.domainName}.auth.${this.region}.amazoncognito.com`
          : '',
      },
      agent: {
        runtimeArn: props.agent.runtime.attrAgentRuntimeArn,
        protocol: 'HTTP',
        ...(localAgentEndpoint ? { endpoint: localAgentEndpoint } : {}),
      },
      sharing: {
        baseUrl: `https://${props.appDomain}/slides`,
      },
      environment: 'production',
    });

    const webFunction = new lambda.DockerImageFunction(this, 'WebFunction', {
      functionName: 'pawapo-web',
      code: lambda.DockerImageCode.fromImageAsset(path.join(currentDir, '../..'), {
        file: 'infra/web/Dockerfile',
        platform: cdk.aws_ecr_assets.Platform.LINUX_ARM64,
        exclude: [
          '.git',
          '.github',
          '.agents',
          '.claude',
          '.codex',
          'node_modules',
          'cdk.out',
          'dist',
          'docs',
          'infra/scripts',
          'tests',
          'agent',
          '**/__pycache__',
        ],
        ignoreMode: cdk.IgnoreMode.GLOB,
      }),
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      role: props.workloadAccess.webRole,
      logGroup: props.workloadAccess.webLogGroup,
      environment: {
        AWS_LWA_PORT: '8080',
        RUNTIME_CONFIG_JSON: runtimeConfig,
      },
    });

    const functionUrl = webFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: lambda.InvokeMode.BUFFERED,
    });
    const webOrigin = origins.FunctionUrlOrigin.withOriginAccessControl(functionUrl);
    const slidesOrigin = origins.S3BucketOrigin.withOriginAccessControl(
      sharedSlidesBucket,
    );

    const originAwareCache = new cloudfront.CachePolicy(this, 'OriginAwareCachePolicy', {
      cachePolicyName: 'pawapo-origin-cache-control',
      minTtl: cdk.Duration.seconds(0),
      defaultTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.days(365),
      enableAcceptEncodingBrotli: true,
      enableAcceptEncodingGzip: true,
    });
    const cleanSlideUrls = new cloudfront.Function(this, 'CleanSlideUrls', {
      functionName: 'pawapo-clean-slide-urls',
      code: cloudfront.FunctionCode.fromInline(`function handler(event) {
  var request = event.request;
  if (request.uri.indexOf('/slides/') === 0 && request.uri.endsWith('/')) {
    request.uri += 'index.html';
  }
  return request;
}`),
    });

    const domainReady = this.node.tryGetContext('domainReady') === true
      || this.node.tryGetContext('domainReady') === 'true';
    // 別アカウントの旧CloudFrontが本番ドメインを保持したままでも、親ドメインの
    // ワイルドカードは共存できる。DNS変更後も旧側の完全一致が優先され、旧設定を
    // 外した瞬間に新側へ移るため、切替中の空白時間を作らない。
    const distributionDomains = domainReady
      ? [props.appDomain, ...(props.previewDomain ? [props.previewDomain] : [])]
      : [
          ...(props.previewDomain ? [props.previewDomain] : []),
          ...(props.cutoverWildcardDomain ? [props.cutoverWildcardDomain] : []),
        ];
    const certificate = distributionDomains.length > 0 ? props.foundation.certificate : undefined;

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'パワポ作るマン Web・共有スライド統合配信',
      defaultBehavior: {
        origin: webOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: originAwareCache,
        compress: true,
      },
      additionalBehaviors: {
        'runtime-config.json': {
          origin: webOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        },
        'slides/*': {
          origin: slidesOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: originAwareCache,
          compress: true,
          functionAssociations: [{
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            function: cleanSlideUrls,
          }],
        },
      },
      domainNames: distributionDomains.length > 0 ? distributionDomains : undefined,
      certificate,
      enableIpv6: true,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
    });

    // Since October 2025, Lambda Function URLs protected by AWS_IAM require
    // both InvokeFunctionUrl and InvokeFunction. FunctionUrlOrigin creates the
    // URL permission; add the second, distribution-scoped permission here.
    webFunction.addPermission('CloudFrontInvokeFunction', {
      principal: new iam.ServicePrincipal('cloudfront.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: cdk.Stack.of(this).formatArn({
        service: 'cloudfront',
        region: '',
        resource: 'distribution',
        resourceName: distribution.distributionId,
      }),
      invokedViaFunctionUrl: true,
    });

    if (domainReady) {
      new route53.ARecord(this, 'AliasA', {
        zone: props.foundation.hostedZone,
        target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(distribution)),
      });
      new route53.AaaaRecord(this, 'AliasAaaa', {
        zone: props.foundation.hostedZone,
        target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(distribution)),
      });
    }

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
    });
    new cdk.CfnOutput(this, 'SharedSlidesBucketName', {
      value: sharedSlidesBucket.bucketName,
    });
    new cdk.CfnOutput(this, 'ApplicationUrl', {
      value: certificate
        ? `https://${domainReady ? props.appDomain : props.previewDomain}`
        : `https://${distribution.distributionDomainName}`,
    });
  }
}
