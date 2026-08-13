import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Construct } from 'constructs';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export interface AuthStackProps extends cdk.StackProps {
  readonly appDomain: string;
}

export class AuthStack extends cdk.Stack {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly cognitoDomain?: cognito.UserPoolDomain;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const oldAccountRoleArn = this.node.tryGetContext('oldAccountRoleArn') as string | undefined;
    const oldUserPoolId = this.node.tryGetContext('oldUserPoolId') as string | undefined;
    const oldUserPoolClientId = this.node.tryGetContext('oldUserPoolClientId') as string | undefined;
    const migrationEnabled = Boolean(oldAccountRoleArn && oldUserPoolId && oldUserPoolClientId);
    const googleClientId = this.node.tryGetContext('googleClientId') as string | undefined;
    const googleClientSecretId = this.node.tryGetContext('googleClientSecretId') as string | undefined;
    const googleEnabled = Boolean(googleClientId && googleClientSecretId);

    let migrationFunction: lambdaNodejs.NodejsFunction | undefined;
    if (migrationEnabled) {
      migrationFunction = new lambdaNodejs.NodejsFunction(this, 'UserMigrationFunction', {
        entry: path.join(currentDir, '../../amplify/auth/user-migration/handler.ts'),
        runtime: lambda.Runtime.NODEJS_24_X,
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.seconds(15),
        environment: {
          OLD_ACCOUNT_ROLE_ARN: oldAccountRoleArn!,
          OLD_USER_POOL_ID: oldUserPoolId!,
          OLD_USER_POOL_CLIENT_ID: oldUserPoolClientId!,
        },
        bundling: { minify: true, sourceMap: true },
      });
      migrationFunction.addToRolePolicy(new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [oldAccountRoleArn!],
      }));
    }

    let googleLinkFunction: lambdaNodejs.NodejsFunction | undefined;
    if (googleEnabled) {
      googleLinkFunction = new lambdaNodejs.NodejsFunction(this, 'GoogleLinkFunction', {
        entry: path.join(currentDir, '../../amplify/auth/google-link/handler.ts'),
        runtime: lambda.Runtime.NODEJS_24_X,
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.seconds(15),
        environment: {
          OLD_ACCOUNT_ROLE_ARN: oldAccountRoleArn ?? '',
          OLD_USER_POOL_ID: oldUserPoolId ?? '',
        },
        bundling: { minify: true, sourceMap: true },
      });
      googleLinkFunction.addToRolePolicy(new iam.PolicyStatement({
        actions: ['cognito-idp:ListUsers', 'cognito-idp:AdminLinkProviderForUser'],
        resources: [`arn:${this.partition}:cognito-idp:${this.region}:${this.account}:userpool/*`],
      }));
      if (oldAccountRoleArn) {
        googleLinkFunction.addToRolePolicy(new iam.PolicyStatement({
          actions: ['sts:AssumeRole'],
          resources: [oldAccountRoleArn],
        }));
      }
    }

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'pawapo-users',
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      signInPolicy: {
        allowedFirstAuthFactors: {
          password: true,
          passkey: true,
        },
      },
      passkeyRelyingPartyId: props.appDomain,
      passkeyUserVerification: cognito.PasskeyUserVerification.PREFERRED,
      passwordPolicy: {
        minLength: 8,
        requireDigits: false,
        requireLowercase: false,
        requireSymbols: false,
        requireUppercase: false,
      },
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lambdaTriggers: {
        ...(migrationFunction ? { userMigration: migrationFunction } : {}),
        ...(googleLinkFunction ? { preSignUp: googleLinkFunction } : {}),
      },
    });

    let googleProvider: cognito.UserPoolIdentityProviderGoogle | undefined;
    if (googleEnabled) {
      googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleIdentityProvider', {
        userPool: this.userPool,
        clientId: googleClientId!,
        clientSecretValue: cdk.SecretValue.secretsManager(googleClientSecretId!),
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
        },
      });

      const domainPrefix = this.node.tryGetContext('cognitoDomainPrefix') as string | undefined;
      if (!domainPrefix) {
        throw new Error('Googleログインを有効にする場合は -c cognitoDomainPrefix=<一意な名前> が必要です');
      }
      this.cognitoDomain = this.userPool.addDomain('CognitoDomain', {
        cognitoDomain: { domainPrefix },
      });
    }

    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: 'pawapo-web',
      generateSecret: false,
      preventUserExistenceErrors: true,
      authFlows: {
        user: true,
        userPassword: true,
        userSrp: true,
      },
      supportedIdentityProviders: googleEnabled
        ? [cognito.UserPoolClientIdentityProvider.COGNITO, cognito.UserPoolClientIdentityProvider.GOOGLE]
        : [cognito.UserPoolClientIdentityProvider.COGNITO],
      oAuth: googleEnabled ? {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [`https://${props.appDomain}/`, 'http://localhost:5173/'],
        logoutUrls: [`https://${props.appDomain}/`, 'http://localhost:5173/'],
      } : undefined,
      accessTokenValidity: cdk.Duration.minutes(60),
      idTokenValidity: cdk.Duration.minutes(60),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    if (googleProvider) {
      this.userPoolClient.node.addDependency(googleProvider);
    }

    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
    if (this.cognitoDomain) {
      new cdk.CfnOutput(this, 'CognitoDomainName', { value: this.cognitoDomain.domainName });
    }
  }
}
