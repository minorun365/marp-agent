import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import * as agentcore from 'aws-cdk-lib/aws-bedrockagentcore';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import type { AuthStack } from './auth-stack.js';
import type { FoundationStack } from './foundation-stack.js';
import type { WorkloadAccessStack } from './workload-access-stack.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export interface AgentStackProps extends cdk.StackProps {
  readonly appDomain: string;
  readonly auth: AuthStack;
  readonly foundation: FoundationStack;
  readonly workloadAccess: WorkloadAccessStack;
}

export class AgentStack extends cdk.Stack {
  readonly runtime: agentcore.CfnRuntime;

  constructor(scope: Construct, id: string, props: AgentStackProps) {
    super(scope, id, props);

    const runtimeImage = new ecrAssets.DockerImageAsset(this, 'RuntimeImage', {
      directory: path.join(currentDir, '../../amplify/agent/runtime'),
      platform: ecrAssets.Platform.LINUX_ARM64,
      exclude: ['.venv', '**/__pycache__', '**/*.pyc', '.pytest_cache', '.ruff_cache'],
      ignoreMode: cdk.IgnoreMode.GLOB,
    });

    const sharedSlidesBucketName = `pawapo-shared-slides-${this.account}-${this.region}`;

    const discoveryUrl = `https://cognito-idp.${this.region}.amazonaws.com/${props.auth.userPool.userPoolId}/.well-known/openid-configuration`;
    this.runtime = new agentcore.CfnRuntime(this, 'Runtime', {
      agentRuntimeName: 'pawapo_agent',
      description: 'パワポ作るマンのスライド生成エージェント',
      agentRuntimeArtifact: {
        containerConfiguration: { containerUri: runtimeImage.imageUri },
      },
      authorizerConfiguration: {
        customJwtAuthorizer: {
          discoveryUrl,
          allowedClients: [props.auth.userPoolClient.userPoolClientId],
        },
      },
      networkConfiguration: { networkMode: 'PUBLIC' },
      protocolConfiguration: 'HTTP',
      // AgentCoreは既定でリクエストヘッダーをコンテナへ渡さない。許可リストへ入れて初めて届く。
      // Authorizationが無いと、検証済みJWTから利用者を識別できず利用統計が取れない
      // （エージェント側では署名を再検証せず、subのハッシュだけを使う。詳細は identity.py）。
      requestHeaderConfiguration: {
        requestHeaderAllowlist: ['Authorization'],
      },
      roleArn: props.workloadAccess.runtimeRole.roleArn,
      environmentVariables: {
        AGENT_OBSERVABILITY_ENABLED: 'true',
        OTEL_PYTHON_DISTRO: 'aws_distro',
        OTEL_PYTHON_CONFIGURATOR: 'aws_configurator',
        OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
        BYPASS_TOOL_CONSENT: 'true',
        BEDROCK_GROK_MODEL_ID: 'xai.grok-4.6',
        // Grok 4.6はMantleのus-west-2でだけ提供される（2026-08-19実測）。
        BEDROCK_GROK_REGION: 'us-west-2',
        // 推論の深さ。lowでもmediumと品質が変わらず、所要時間が3分の1になる。
        GROK_REASONING_EFFORT: 'low',
        BEDROCK_KIMI_MODEL_ID: 'moonshotai.kimi-k2.5',
        TAVILY_SECRET_ARN: props.foundation.tavilySecret.secretArn,
        SHARED_SLIDES_BUCKET: sharedSlidesBucketName,
        SHARED_SLIDES_PUBLIC_DOMAIN: props.appDomain,
      },
      tags: { Project: 'pawapo' },
    });

    // AgentCoreが自動生成するロググループは既定30日で消える。
    // 利用統計を後から集計できるよう、CDK側で先に作って13か月保持にする。
    // ランタイムを作り直すとIDが変わり別名になるため、このスタックで一緒に作り直す。
    new logs.LogGroup(this, 'RuntimeLogGroup', {
      logGroupName: `/aws/bedrock-agentcore/runtimes/${this.runtime.attrAgentRuntimeId}-DEFAULT`,
      retention: logs.RetentionDays.THIRTEEN_MONTHS,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new cdk.CfnOutput(this, 'AgentRuntimeArn', { value: this.runtime.attrAgentRuntimeArn });
  }
}
