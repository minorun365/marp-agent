import * as path from 'path';
import * as url from 'url';
import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import { ContainerImageBuild } from 'deploy-time-build';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import type { IUserPool, IUserPoolClient } from 'aws-cdk-lib/aws-cognito';

// ESモジュールで__dirnameを取得
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MarpAgentProps {
  stack: cdk.Stack;
  userPool?: IUserPool;
  userPoolClient?: IUserPoolClient;
  nameSuffix?: string;
  sharedSlidesBucket?: s3.IBucket;
  sharedSlidesDistributionDomain?: string;
}

export function createMarpAgent({ stack, userPool, userPoolClient, nameSuffix, sharedSlidesBucket, sharedSlidesDistributionDomain }: MarpAgentProps) {
  // 環境判定: sandbox（ローカル）vs 本番（Amplify Console）
  const isSandbox = !process.env.AWS_BRANCH;

  let agentRuntimeArtifact: agentcore.AgentRuntimeArtifact;
  let containerImageBuild: ContainerImageBuild | undefined;

  if (isSandbox) {
    // sandbox: ローカルでARM64ビルド
    agentRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromAsset(
      path.join(__dirname, 'runtime')
    );
  } else {
    // 本番: CodeBuildでARM64ビルド（deploy-time-build）
    // tag省略でassetHashベースのタグを使用（CloudFormationが変更を検知できるように）
    containerImageBuild = new ContainerImageBuild(stack, 'MarpAgentImageBuild', {
      directory: path.join(__dirname, 'runtime'),
      platform: Platform.LINUX_ARM64,
    });
    // 古いイメージを自動削除（直近5件を保持）
    // Note: deploy-time-buildのrepositoryはIRepository型だが、実体はRepositoryなので型アサーションで対応
    (containerImageBuild.repository as ecr.Repository).addLifecycleRule({
      description: 'Keep last 5 images',
      maxImageCount: 5,
      rulePriority: 1,
    });
    agentRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromEcrRepository(
      containerImageBuild.repository,
      containerImageBuild.imageTag,
    );
  }

  // 認証設定（JWT認証）
  const discoveryUrl = userPool
    ? `https://cognito-idp.${stack.region}.amazonaws.com/${userPool.userPoolId}/.well-known/openid-configuration`
    : undefined;

  const authConfig = discoveryUrl && userPoolClient
    ? agentcore.RuntimeAuthorizerConfiguration.usingJWT(
        discoveryUrl,
        [userPoolClient.userPoolClientId],
      )
    : undefined;

  // 環境ごとのランタイム名（例: marp_agent_dev, marp_agent_main）
  const runtimeName = nameSuffix ? `marp_agent_${nameSuffix}` : 'marp_agent';

  // AgentCore Runtime作成
  const runtime = new agentcore.Runtime(stack, 'MarpAgentRuntime', {
    runtimeName,
    agentRuntimeArtifact,
    authorizerConfiguration: authConfig,
    environmentVariables: {
      TAVILY_API_KEY: process.env.TAVILY_API_KEY || '',
      TAVILY_API_KEY2: process.env.TAVILY_API_KEY2 || '',
      TAVILY_API_KEY3: process.env.TAVILY_API_KEY3 || '',
      // 共有スライド用S3/CloudFront設定
      SHARED_SLIDES_BUCKET: sharedSlidesBucket?.bucketName || '',
      CLOUDFRONT_DOMAIN: sharedSlidesDistributionDomain || '',
      // Observability（OTEL）設定
      AGENT_OBSERVABILITY_ENABLED: 'true',
      OTEL_PYTHON_DISTRO: 'aws_distro',
      OTEL_PYTHON_CONFIGURATOR: 'aws_configurator',
      OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
    },
  });

  // 本番環境: ContainerImageBuild完了後にRuntimeを作成するよう依存関係を設定
  if (containerImageBuild) {
    runtime.node.addDependency(containerImageBuild);
  }

  // Bedrockモデル呼び出し権限を付与
  runtime.addToRolePolicy(new iam.PolicyStatement({
    actions: [
      'bedrock:InvokeModel',
      'bedrock:InvokeModelWithResponseStream',
    ],
    resources: [
      'arn:aws:bedrock:*::foundation-model/*',
      'arn:aws:bedrock:*:*:inference-profile/*',
    ],
  }));

  // 共有スライド用S3への書き込み権限を付与
  if (sharedSlidesBucket) {
    runtime.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject'],
      resources: [`${sharedSlidesBucket.bucketArn}/*`],
    }));
  }

  // エンドポイントはDEFAULTを使用（runtime.addEndpoint不要）

  // 出力
  new cdk.CfnOutput(stack, 'MarpAgentRuntimeArn', {
    value: runtime.agentRuntimeArn,
    description: 'Marp Agent Runtime ARN',
  });

  return { runtime };
}
