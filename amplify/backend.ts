import 'dotenv/config';
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { createMarpAgent } from './agent/resource';
import { SharedSlidesConstruct } from './storage/resource';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cr from 'aws-cdk-lib/custom-resources';

// 環境判定
// - Sandbox: AWS_BRANCHが未定義
// - 本番/ステージング: AWS_BRANCHにブランチ名が設定される
const isSandbox = !process.env.AWS_BRANCH;

const backend = defineBackend({
  auth,
});

// AgentCoreスタックを作成
const agentCoreStack = backend.createStack('AgentCoreStack');

// nameSuffix の決定
// - 本番: AWS_BRANCH を使用（Runtime名に使えない文字をサニタイズ）
// - Sandbox: CDKコンテキストから identifier を取得
//   Amplifyが amplify-backend-name にsandbox識別子を設定している
let nameSuffix: string;
if (isSandbox) {
  // CDKコンテキストからAmplifyが設定した識別子を取得
  const backendName = agentCoreStack.node.tryGetContext('amplify-backend-name') as string;
  console.log('[DEBUG] backendName:', backendName);
  // Runtime名に使えない文字をサニタイズ（本番と同様）
  nameSuffix = (backendName || 'dev').replace(/[^a-zA-Z0-9_]/g, '_');
} else {
  const branchName = process.env.AWS_BRANCH || 'main';
  // Runtime名に使える文字のみに変換（/ や - を _ に置換）
  nameSuffix = branchName.replace(/[^a-zA-Z0-9_]/g, '_');
}

// 共有スライド用インフラを作成（S3 + CloudFront）
const sharedSlides = new SharedSlidesConstruct(agentCoreStack, 'SharedSlides');

// Marp Agentを作成（Cognito認証統合）
const { runtime } = createMarpAgent({
  stack: agentCoreStack,
  userPool: backend.auth.resources.userPool,
  userPoolClient: backend.auth.resources.userPoolClient,
  nameSuffix,
  sharedSlidesBucket: sharedSlides.bucket,
  sharedSlidesDistributionDomain: sharedSlides.distribution.distributionDomainName,
});

// フロントエンドにランタイム情報を渡す（DEFAULTエンドポイントを使用）
backend.addOutput({
  custom: {
    agentRuntimeArn: runtime.agentRuntimeArn,
    environment: isSandbox ? 'sandbox' : nameSuffix,
    sharedSlidesDistributionDomain: sharedSlides.distribution.distributionDomainName,
  },
});

// Sandbox環境のみ: テストユーザーを自動作成
if (isSandbox) {
  const testUserEmail = process.env.TEST_USER_EMAIL;
  const testUserPassword = process.env.TEST_USER_PASSWORD;

  if (testUserEmail && testUserPassword) {
    const userPool = backend.auth.resources.userPool;

    // テストユーザーを作成（CfnUserPoolUser）
    const testUser = new cognito.CfnUserPoolUser(agentCoreStack, 'TestUser', {
      userPoolId: userPool.userPoolId,
      username: testUserEmail,
      userAttributes: [
        { name: 'email', value: testUserEmail },
        { name: 'email_verified', value: 'true' },
      ],
      messageAction: 'SUPPRESS', // ウェルカムメールを抑制
    });

    // パスワードを恒久化（AwsCustomResource）
    // CfnUserPoolUserでは一時パスワードしか設定できないため、
    // adminSetUserPassword APIで恒久パスワードを設定
    const setPassword = new cr.AwsCustomResource(agentCoreStack, 'TestUserSetPassword', {
      onCreate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'adminSetUserPassword',
        parameters: {
          UserPoolId: userPool.userPoolId,
          Username: testUserEmail,
          Password: testUserPassword,
          Permanent: true,
        },
        physicalResourceId: cr.PhysicalResourceId.of(`TestUserPassword-${testUserEmail}`),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [userPool.userPoolArn],
      }),
    });

    // ユーザー作成後にパスワード設定
    setPassword.node.addDependency(testUser);

    console.log(`[INFO] テストユーザー作成: ${testUserEmail}`);
  } else {
    console.log('[WARN] TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定のためテストユーザーは作成されません');
  }
}
