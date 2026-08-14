#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AgentStack } from '../lib/agent-stack.js';
import { AuthAccessStack } from '../lib/auth-access-stack.js';
import { AuthStack } from '../lib/auth-stack.js';
import { FoundationStack } from '../lib/foundation-stack.js';
import { WebStack } from '../lib/web-stack.js';
import { WorkloadAccessStack } from '../lib/workload-access-stack.js';

const app = new cdk.App();
const region = 'us-east-1';
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region,
};
const appDomain = app.node.getContext('appDomain') as string;
const previewDomain = app.node.tryGetContext('previewDomain') as string | undefined;
const cutoverWildcardDomain = app.node.tryGetContext('cutoverWildcardDomain') as string | undefined;
// 旧環境からユーザーを引き継ぐときだけ指定する。新規に構築する場合は未設定でよい。
const oldMigrationRoleArn = app.node.tryGetContext('oldMigrationRoleArn') as string | undefined;
const oldGoogleCheckRoleArn = app.node.tryGetContext('oldGoogleCheckRoleArn') as string | undefined;

const foundation = new FoundationStack(app, 'PawapoFoundation', {
  env,
  appDomain,
  previewDomain,
  cutoverWildcardDomain,
  description: 'パワポ作るマンの永続データとドメイン基盤',
});

const authAccess = new AuthAccessStack(app, 'PawapoAuthAccess', {
  env,
  legacyMigrationRoleArn: oldMigrationRoleArn,
  legacyGoogleCheckRoleArn: oldGoogleCheckRoleArn,
  description: 'パワポ作るマンの認証Lambda実行ロールとログ',
});

const auth = new AuthStack(app, 'PawapoAuth', {
  env,
  appDomain,
  previewDomain,
  authAccess,
  legacyMigrationRoleArn: oldMigrationRoleArn,
  legacyGoogleCheckRoleArn: oldGoogleCheckRoleArn,
  description: 'パワポ作るマンのCognito認証基盤',
});

const workloadAccess = new WorkloadAccessStack(app, 'PawapoWorkloadAccess', {
  env,
  foundation,
  description: 'パワポ作るマンのAgentCore・Web実行ロールとログ',
});

const agent = new AgentStack(app, 'PawapoAgent', {
  env,
  appDomain,
  auth,
  foundation,
  workloadAccess,
  description: 'パワポ作るマンのAgentCore実行基盤',
});

const web = new WebStack(app, 'PawapoWeb', {
  env,
  appDomain,
  previewDomain,
  cutoverWildcardDomain,
  auth,
  agent,
  foundation,
  workloadAccess,
  description: 'パワポ作るマンのWeb配信と共有スライド配信',
});

auth.addStackDependency(foundation);
auth.addStackDependency(authAccess);
workloadAccess.addStackDependency(foundation);
agent.addStackDependency(auth);
agent.addStackDependency(foundation);
agent.addStackDependency(workloadAccess);
web.addStackDependency(agent);
web.addStackDependency(auth);
web.addStackDependency(foundation);
web.addStackDependency(workloadAccess);

cdk.Tags.of(app).add('Project', 'pawapo');
cdk.Tags.of(app).add('ManagedBy', 'cdk-cdkd');
