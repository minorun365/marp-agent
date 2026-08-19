import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import type { FoundationStack } from './foundation-stack.js';

export interface WorkloadAccessStackProps extends cdk.StackProps {
  readonly foundation: FoundationStack;
}

export class WorkloadAccessStack extends cdk.Stack {
  readonly runtimeRole: iam.Role;
  readonly webRole: iam.Role;
  readonly webLogGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: WorkloadAccessStackProps) {
    super(scope, id, props);

    this.runtimeRole = new iam.Role(this, 'RuntimeRole', {
      roleName: 'pawapo-agentcore-runtime',
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      description: 'Execution role for the Pawapo AgentCore Runtime',
    });
    this.runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }));
    this.runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ecr:BatchCheckLayerAvailability', 'ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer'],
      resources: [`arn:${this.partition}:ecr:${this.region}:${this.account}:repository/cdkd-container-assets-*`],
    }));
    props.foundation.tavilySecret.grantRead(this.runtimeRole);
    this.runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject'],
      resources: [`arn:${this.partition}:s3:::pawapo-shared-slides-${this.account}-${this.region}/*`],
    }));
    this.runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: [
        `arn:${this.partition}:bedrock:*::foundation-model/*`,
        `arn:${this.partition}:bedrock:*:${this.account}:inference-profile/*`,
        `arn:${this.partition}:bedrock:*:${this.account}:application-inference-profile/*`,
      ],
    }));
    // Grok 4.6はbedrock-mantleエンドポイントで動く。bedrock:InvokeModelでは認可されず、
    // Mantle側のCreateInferenceが要る。SigV4から短期トークンを作るのでCallWithBearerTokenも必要。
    this.runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock-mantle:CreateInference', 'bedrock-mantle:Get*', 'bedrock-mantle:List*'],
      resources: [`arn:${this.partition}:bedrock-mantle:*:${this.account}:project/*`],
    }));
    this.runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:CallWithBearerToken', 'bedrock-mantle:CallWithBearerToken'],
      resources: ['*'],
    }));
    this.runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:DescribeLogGroups'],
      resources: ['*'],
    }));
    this.runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [
        `arn:${this.partition}:logs:${this.region}:${this.account}:log-group:/aws/bedrock-agentcore/runtimes/*`,
        `arn:${this.partition}:logs:${this.region}:${this.account}:log-group:/aws/bedrock-agentcore/runtimes/*:*`,
      ],
    }));
    this.runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['xray:PutTelemetryRecords', 'xray:PutTraceSegments'],
      resources: ['*'],
    }));
    this.webLogGroup = new logs.LogGroup(this, 'WebLogGroup', {
      logGroupName: '/aws/lambda/pawapo-web',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.webRole = new iam.Role(this, 'WebRole', {
      roleName: 'pawapo-web',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for the Pawapo Lambda Web Adapter function',
    });
    this.webRole.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [this.webLogGroup.logGroupArn, `${this.webLogGroup.logGroupArn}:*`],
    }));
  }
}
