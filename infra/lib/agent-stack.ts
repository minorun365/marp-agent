import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import * as agentcore from 'aws-cdk-lib/aws-bedrockagentcore';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import type { AuthStack } from './auth-stack.js';
import type { FoundationStack } from './foundation-stack.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export interface AgentStackProps extends cdk.StackProps {
  readonly appDomain: string;
  readonly auth: AuthStack;
  readonly foundation: FoundationStack;
}

export class AgentStack extends cdk.Stack {
  readonly runtime: agentcore.CfnRuntime;
  readonly memory: agentcore.CfnMemory;

  constructor(scope: Construct, id: string, props: AgentStackProps) {
    super(scope, id, props);

    const runtimeImage = new ecrAssets.DockerImageAsset(this, 'RuntimeImage', {
      directory: path.join(currentDir, '../../amplify/agent/runtime'),
      platform: ecrAssets.Platform.LINUX_ARM64,
      exclude: ['.venv', '**/__pycache__', '**/*.pyc', '.pytest_cache', '.ruff_cache'],
      ignoreMode: cdk.IgnoreMode.GLOB,
    });

    const runtimeRole = new iam.Role(this, 'RuntimeRole', {
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      description: 'Execution role for the Pawapo AgentCore Runtime',
    });
    runtimeImage.repository.grantPull(runtimeRole);
    props.foundation.tavilySecret.grantRead(runtimeRole);

    const sharedSlidesBucketName = `pawapo-shared-slides-${this.account}-${this.region}`;
    runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject'],
      resources: [`arn:${this.partition}:s3:::${sharedSlidesBucketName}/*`],
    }));

    runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: [
        'arn:aws:bedrock:*::foundation-model/*',
        `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
        `arn:aws:bedrock:*:${this.account}:application-inference-profile/*`,
      ],
    }));
    runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'bedrock-mantle:CallWithBearerToken',
        'bedrock-mantle:CreateInference',
        'bedrock-mantle:GetProject',
        'bedrock-mantle:ListProjects',
        'bedrock-mantle:ListTagsForResources',
      ],
      resources: ['*'],
    }));

    this.memory = new agentcore.CfnMemory(this, 'ConversationMemory', {
      name: 'pawapo_memory',
      description: 'パワポ作るマンのセッション会話履歴',
      eventExpiryDuration: 30,
    });
    this.memory.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
    runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'bedrock-agentcore:CreateEvent',
        'bedrock-agentcore:GetEvent',
        'bedrock-agentcore:ListEvents',
        'bedrock-agentcore:DeleteEvent',
        'bedrock-agentcore:ListSessions',
      ],
      resources: [
        `arn:${this.partition}:bedrock-agentcore:${this.region}:${this.account}:memory/${this.memory.attrMemoryId}`,
      ],
    }));

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
      roleArn: runtimeRole.roleArn,
      environmentVariables: {
        AGENT_OBSERVABILITY_ENABLED: 'true',
        OTEL_PYTHON_DISTRO: 'aws_distro',
        OTEL_PYTHON_CONFIGURATOR: 'aws_configurator',
        OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
        BYPASS_TOOL_CONSENT: 'true',
        BEDROCK_KIMI_MODEL_ID: 'moonshotai.kimi-k2.5',
        BEDROCK_MANTLE_REGION: this.region,
        TAVILY_SECRET_ARN: props.foundation.tavilySecret.secretArn,
        AGENTCORE_MEMORY_ID: this.memory.attrMemoryId,
        SHARED_SLIDES_BUCKET: sharedSlidesBucketName,
        SHARED_SLIDES_PUBLIC_DOMAIN: props.appDomain,
      },
      tags: { Project: 'pawapo' },
    });
    this.runtime.node.addDependency(runtimeRole);
    this.runtime.node.addDependency(this.memory);

    new cdk.CfnOutput(this, 'AgentRuntimeArn', { value: this.runtime.attrAgentRuntimeArn });
    new cdk.CfnOutput(this, 'AgentMemoryId', { value: this.memory.attrMemoryId });
  }
}
