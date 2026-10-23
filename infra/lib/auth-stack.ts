import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Construct } from 'constructs';
import type { AuthAccessStack } from './auth-access-stack.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export interface AuthStackProps extends cdk.StackProps {
  readonly appDomain: string;
  readonly previewDomain?: string;
  readonly authAccess: AuthAccessStack;
}

export class AuthStack extends cdk.Stack {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly cognitoDomain?: cognito.UserPoolDomain;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const googleClientId = this.node.tryGetContext('googleClientId') as string | undefined;
    const cognitoDomainPrefix = this.node.tryGetContext('cognitoDomainPrefix') as string | undefined;
    const googleEnabled = Boolean(googleClientId);
    if (googleEnabled && !cognitoDomainPrefix) {
      throw new Error('Googleログインを有効にする場合は cognitoDomainPrefix が必要です');
    }
    let googleLinkFunction: lambdaNodejs.NodejsFunction | undefined;
    if (googleEnabled) {
      const functionName = 'pawapo-google-link';
      googleLinkFunction = new lambdaNodejs.NodejsFunction(this, 'GoogleLinkFunction', {
        functionName,
        entry: path.join(currentDir, '../../infra/lambda/auth/google-link/handler.ts'),
        runtime: lambda.Runtime.NODEJS_24_X,
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.seconds(15),
        role: props.authAccess.googleLinkRole,
        logGroup: props.authAccess.googleLinkLogGroup,
        bundling: { minify: true, sourceMap: true },
      });
    }

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'pawapo-users',
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      // パスキーは第1認証要素として使い、従来ユーザーへMFAは強制しない。
      // CDKDがWebAuthn設定だけのときにOPTIONALへ補完しないよう明示する。
      mfa: cognito.Mfa.OFF,
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
          // パスワードの置き換え先。Cognito 標準メール（1日50通）で送る
          emailOtp: true,
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
        ...(googleLinkFunction ? { preSignUp: googleLinkFunction } : {}),
      },
    });

    // 運営者本人の利用を利用統計から切り分けるためのグループ。
    // 所属ユーザーのJWTには cognito:groups に owner が入り、エージェント側がログへ印を付ける。
    // 誰を入れるかはCognito側で管理し、個人の識別子はこのリポジトリへ持ち込まない。
    new cognito.CfnUserPoolGroup(this, 'OwnerGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'owner',
      description: '運営者本人。デモ・検証の利用を統計から除外するために使う',
    });

    let googleProvider: cdk.CustomResource | undefined;
    if (googleEnabled) {
      const googleIdpManagerFunction = new lambdaNodejs.NodejsFunction(this, 'GoogleIdpManagerFunction', {
        functionName: 'pawapo-google-idp-manager',
        entry: path.join(currentDir, '../../infra/lambda/auth/google-idp-manager/handler.ts'),
        runtime: lambda.Runtime.NODEJS_24_X,
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.seconds(30),
        role: props.authAccess.googleIdpManagerRole,
        logGroup: props.authAccess.googleIdpManagerLogGroup,
        bundling: { minify: true, sourceMap: true },
      });

      googleProvider = new cdk.CustomResource(this, 'GoogleIdentityProvider', {
        serviceToken: googleIdpManagerFunction.functionArn,
        properties: {
          UserPoolId: this.userPool.userPoolId,
          ClientId: googleClientId!,
          SecretName: 'pawapo/google-oauth-client-secret',
          Scopes: 'openid email profile',
          ConfigurationVersion: '3',
        },
      });
      // 既存のL2リソースと同じ論理IDにして、旧IDプロバイダーの削除後に
      // 秘密値をstateへ残さないカスタムリソースを作る置換として扱う。
      const googleProviderResource = googleProvider.node.defaultChild as cdk.CfnResource;
      googleProviderResource.overrideLogicalId('GoogleIdentityProvider5AA1A9DD');

      this.cognitoDomain = this.userPool.addDomain('CognitoDomain', {
        cognitoDomain: { domainPrefix: cognitoDomainPrefix! },
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
        callbackUrls: [
          `https://${props.appDomain}/`,
          ...(props.previewDomain ? [`https://${props.previewDomain}/`] : []),
          'http://localhost:5173/',
        ],
        logoutUrls: [
          `https://${props.appDomain}/`,
          ...(props.previewDomain ? [`https://${props.previewDomain}/`] : []),
          'http://localhost:5173/',
        ],
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
