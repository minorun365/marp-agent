import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

export interface AuthAccessStackProps extends cdk.StackProps {
  readonly legacyMigrationRoleArn: string;
  readonly legacyGoogleCheckRoleArn: string;
}

export class AuthAccessStack extends cdk.Stack {
  readonly userMigrationRole: iam.Role;
  readonly userMigrationLogGroup: logs.LogGroup;
  readonly googleLinkRole: iam.Role;
  readonly googleLinkLogGroup: logs.LogGroup;
  readonly googleIdpManagerRole: iam.Role;
  readonly googleIdpManagerLogGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: AuthAccessStackProps) {
    super(scope, id, props);

    this.userMigrationLogGroup = this.createLogGroup('UserMigration', 'pawapo-user-migration');
    this.userMigrationRole = this.createLambdaRole('UserMigration', 'pawapo-user-migration', this.userMigrationLogGroup);
    this.userMigrationRole.addToPolicy(new iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [props.legacyMigrationRoleArn],
    }));

    this.googleLinkLogGroup = this.createLogGroup('GoogleLink', 'pawapo-google-link');
    this.googleLinkRole = this.createLambdaRole('GoogleLink', 'pawapo-google-link', this.googleLinkLogGroup);
    this.googleLinkRole.addToPolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:ListUsers', 'cognito-idp:AdminLinkProviderForUser'],
      resources: [`arn:${this.partition}:cognito-idp:${this.region}:${this.account}:userpool/*`],
      conditions: {
        StringEquals: { 'aws:ResourceTag/Project': 'pawapo' },
      },
    }));
    this.googleLinkRole.addToPolicy(new iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [props.legacyGoogleCheckRoleArn],
    }));

    this.googleIdpManagerLogGroup = this.createLogGroup('GoogleIdpManager', 'pawapo-google-idp-manager');
    this.googleIdpManagerRole = this.createLambdaRole(
      'GoogleIdpManager',
      'pawapo-google-idp-manager',
      this.googleIdpManagerLogGroup,
    );
    this.googleIdpManagerRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:CreateIdentityProvider',
        'cognito-idp:UpdateIdentityProvider',
        'cognito-idp:DeleteIdentityProvider',
      ],
      resources: [`arn:${this.partition}:cognito-idp:${this.region}:${this.account}:userpool/*`],
      conditions: {
        StringEquals: { 'aws:ResourceTag/Project': 'pawapo' },
      },
    }));
    this.googleIdpManagerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [`arn:${this.partition}:secretsmanager:${this.region}:${this.account}:secret:pawapo/google-oauth-client-secret-*`],
    }));
  }

  private createLogGroup(id: string, functionName: string) {
    return new logs.LogGroup(this, `${id}LogGroup`, {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }

  private createLambdaRole(id: string, roleName: string, logGroup: logs.ILogGroup) {
    const role = new iam.Role(this, `${id}Role`, {
      roleName,
      description: `${roleName} Lambda execution role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [logGroup.logGroupArn, `${logGroup.logGroupArn}:*`],
    }));
    return role;
  }
}
