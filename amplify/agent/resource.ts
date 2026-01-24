import * as path from 'path';
import * as url from 'url';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
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
}

export function createMarpAgent({ stack, userPool, userPoolClient, nameSuffix }: MarpAgentProps) {
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
    containerImageBuild = new ContainerImageBuild(stack, 'MarpAgentImageBuild', {
      directory: path.join(__dirname, 'runtime'),
      platform: Platform.LINUX_ARM64,
      tag: 'latest',
    });
    agentRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromEcrRepository(
      containerImageBuild.repository,
      'latest'
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

  // エンドポイントはDEFAULTを使用（runtime.addEndpoint不要）

  // 出力
  new cdk.CfnOutput(stack, 'MarpAgentRuntimeArn', {
    value: runtime.agentRuntimeArn,
    description: 'Marp Agent Runtime ARN',
  });

  return { runtime };
}
