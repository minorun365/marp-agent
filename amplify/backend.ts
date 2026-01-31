import 'dotenv/config';
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { createMarpAgent } from './agent/resource';

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
  nameSuffix = backendName || 'dev';
} else {
  const branchName = process.env.AWS_BRANCH || 'main';
  // Runtime名に使える文字のみに変換（/ や - を _ に置換）
  nameSuffix = branchName.replace(/[^a-zA-Z0-9_]/g, '_');
}

// Marp Agentを作成（Cognito認証統合）
const { runtime } = createMarpAgent({
  stack: agentCoreStack,
  userPool: backend.auth.resources.userPool,
  userPoolClient: backend.auth.resources.userPoolClient,
  nameSuffix,
});

// フロントエンドにランタイム情報を渡す（DEFAULTエンドポイントを使用）
backend.addOutput({
  custom: {
    agentRuntimeArn: runtime.agentRuntimeArn,
    environment: isSandbox ? 'sandbox' : nameSuffix,
  },
});
