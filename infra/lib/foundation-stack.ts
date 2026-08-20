import * as cdk from 'aws-cdk-lib';
import * as agentcore from 'aws-cdk-lib/aws-bedrockagentcore';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

export interface FoundationStackProps extends cdk.StackProps {
  readonly appDomain: string;
  readonly previewDomain?: string;
  readonly cutoverWildcardDomain?: string;
}

export class FoundationStack extends cdk.Stack {
  readonly tavilySecret: secretsmanager.Secret;
  readonly googleOAuthClientSecret: secretsmanager.Secret;
  readonly hostedZone: route53.PublicHostedZone;
  readonly certificate: acm.Certificate;
  readonly webSearchGateway: agentcore.CfnGateway;
  readonly webSearchToolName: string;

  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);

    this.tavilySecret = new secretsmanager.Secret(this, 'TavilyApiKeys', {
      secretName: 'pawapo/tavily-api-keys',
      description: 'パワポ作るマンのWeb検索APIキー',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.googleOAuthClientSecret = new secretsmanager.Secret(this, 'GoogleOAuthClientSecret', {
      secretName: 'pawapo/google-oauth-client-secret',
      description: 'パワポ作るマンのGoogle OAuthクライアントシークレット',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.hostedZone = new route53.PublicHostedZone(this, 'AppHostedZone', {
      zoneName: props.appDomain,
      comment: 'minoruonda.comから委任するパワポ作るマン専用ゾーン',
    });

    // 親ゾーンは別AWSアカウントで管理しているため、証明書を先に申請し、
    // ACMが提示するCNAMEだけを親ゾーンへ登録して切替前に検証を完了する。
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.appDomain,
      subjectAlternativeNames: [
        ...(props.previewDomain ? [props.previewDomain] : []),
        ...(props.cutoverWildcardDomain ? [props.cutoverWildcardDomain] : []),
      ],
      validation: acm.CertificateValidation.fromDns(),
    });

    // ── AgentCore Web Search（Tavilyの代替を試すための検索基盤） ──────────────
    // コネクタを直接呼ぶ公開APIが無いため、Gatewayを1つ立ててMCPのツールとして呼ぶ。
    // 実行時に参照するのはAgentStackとWorkloadAccessStackの両方なので、
    // 依存が一方向で済むこのスタックへ置く。
    const webSearchGatewayRole = new iam.Role(this, 'WebSearchGatewayRole', {
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      // IAMロールのdescriptionはASCIIしか通らない（CloudFormationの検証で落ちる）
      description: 'Lets the AgentCore Gateway call the built-in Web Search connector',
    });
    webSearchGatewayRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock-agentcore:InvokeWebSearch'],
      resources: [`arn:${this.partition}:bedrock-agentcore:${this.region}:aws:tool/web-search.v1`],
    }));

    this.webSearchGateway = new agentcore.CfnGateway(this, 'WebSearchGateway', {
      name: 'pawapo-web-search',
      description: 'パワポ作るマンのWeb検索（AgentCore Web Searchコネクタ）',
      protocolType: 'MCP',
      // 呼ぶのはRuntimeのIAMロールだけなので、JWTではなくSigV4で通す。
      authorizerType: 'AWS_IAM',
      roleArn: webSearchGatewayRole.roleArn,
    });

    // MCPのツール名は「ターゲット名___ツール名」になる。Runtimeへはこの名前で渡す。
    const webSearchTargetName = 'web-search-tool';
    this.webSearchToolName = `${webSearchTargetName}___WebSearch`;

    // L1のCfnGatewayTargetは connector の parameterValues を持たないうえ、
    // 空オブジェクトの上書きはCDKに刈り取られてしまう（{} は「そのキーを消す」の意味になる）。
    // AgentCoreは parameterValues が無いと「Connector configurations must not be empty」で
    // 作成を拒否するため、ここだけ生のCfnResourceで組み立てる（2026-08-20に実測して確定）。
    const webSearchTarget = new cdk.CfnResource(this, 'WebSearchTarget', {
      type: 'AWS::BedrockAgentCore::GatewayTarget',
      properties: {
        GatewayIdentifier: this.webSearchGateway.attrGatewayIdentifier,
        Name: webSearchTargetName,
        Description: 'Amazon運用のWeb索引を引くビルトインコネクタ',
        TargetConfiguration: {
          Mcp: {
            Connector: {
              Source: { ConnectorId: 'web-search' },
              Configurations: [{ Name: 'WebSearch', ParameterValues: {} }],
            },
          },
        },
        CredentialProviderConfigurations: [{ CredentialProviderType: 'GATEWAY_IAM_ROLE' }],
      },
    });
    webSearchTarget.node.addDependency(this.webSearchGateway);

    new cdk.CfnOutput(this, 'WebSearchGatewayUrl', {
      value: this.webSearchGateway.attrGatewayUrl,
    });

    const budgetEmail = this.node.tryGetContext('budgetEmail') as string | undefined;
    const monthlyBudgetUsd = Number(this.node.tryGetContext('monthlyBudgetUsd') ?? 100);
    if (budgetEmail) {
      new budgets.CfnBudget(this, 'MonthlyBudget', {
        budget: {
          budgetName: 'pawapo-monthly',
          budgetType: 'COST',
          timeUnit: 'MONTHLY',
          budgetLimit: { amount: monthlyBudgetUsd, unit: 'USD' },
        },
        notificationsWithSubscribers: [{
          notification: {
            comparisonOperator: 'GREATER_THAN',
            notificationType: 'FORECASTED',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: budgetEmail }],
        }],
      });
    }

    new cdk.CfnOutput(this, 'DelegatedZoneId', {
      value: this.hostedZone.hostedZoneId,
    });
    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
    });
  }
}
