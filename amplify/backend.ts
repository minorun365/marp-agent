import 'dotenv/config';
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { createMarpAgent } from './agent/resource';

// 環境判定
// - Sandbox: AWS_BRANCHが未定義
// - 本番/ステージング: AWS_BRANCHにブランチ名が設定される
const isSandbox = !process.env.AWS_BRANCH;
const branchName = process.env.AWS_BRANCH || 'dev';
// Runtime名に使える文字のみに変換（/ や - を _ に置換）
const sanitizedBranchName = branchName.replace(/[^a-zA-Z0-9_]/g, '_');

const backend = defineBackend({
  auth,
});

// AgentCoreスタックを作成
const agentCoreStack = backend.createStack('AgentCoreStack');

// Marp Agentを作成（Cognito認証統合）
const { runtime } = createMarpAgent({
  stack: agentCoreStack,
  userPool: backend.auth.resources.userPool,
  userPoolClient: backend.auth.resources.userPoolClient,
  nameSuffix: sanitizedBranchName,
});

// フロントエンドにランタイム情報を渡す（DEFAULTエンドポイントを使用）
backend.addOutput({
  custom: {
    agentRuntimeArn: runtime.agentRuntimeArn,
    environment: isSandbox ? 'sandbox' : branchName,
  },
});
