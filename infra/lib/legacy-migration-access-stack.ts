import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

export interface LegacyMigrationAccessStackProps extends cdk.StackProps {
  readonly targetAccountId: string;
  readonly sourceUserPoolId: string;
}

function trustedRole(
  stack: cdk.Stack,
  targetAccountId: string,
  roleName: string,
): iam.IPrincipal {
  return new iam.AccountPrincipal(targetAccountId).withConditions({
    ArnEquals: {
      'aws:PrincipalArn': `arn:${stack.partition}:iam::${targetAccountId}:role/${roleName}`,
    },
  });
}

export class LegacyMigrationAccessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LegacyMigrationAccessStackProps) {
    super(scope, id, props);

    const sourceUserPoolArn = this.formatArn({
      service: 'cognito-idp',
      resource: 'userpool',
      resourceName: props.sourceUserPoolId,
    });

    const migrationRole = new iam.Role(this, 'UserMigrationAccessRole', {
      roleName: 'pawapo-legacy-user-migration',
      description: 'Verify legacy Cognito credentials during first sign-in to the new user pool',
      assumedBy: trustedRole(this, props.targetAccountId, 'pawapo-user-migration'),
    });
    migrationRole.addToPolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser', 'cognito-idp:AdminInitiateAuth'],
      resources: [sourceUserPoolArn],
    }));

    const googleCheckRole = new iam.Role(this, 'GoogleCheckAccessRole', {
      roleName: 'pawapo-legacy-google-check',
      description: 'Check legacy Cognito membership before first Google sign-in',
      assumedBy: trustedRole(this, props.targetAccountId, 'pawapo-google-link'),
    });
    googleCheckRole.addToPolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [sourceUserPoolArn],
    }));

    new cdk.CfnOutput(this, 'UserMigrationRoleArn', { value: migrationRole.roleArn });
    new cdk.CfnOutput(this, 'GoogleCheckRoleArn', { value: googleCheckRole.roleArn });
  }
}
