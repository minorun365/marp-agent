#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AgentStack } from '../lib/agent-stack.js';
import { AuthAccessStack } from '../lib/auth-access-stack.js';
import { AuthStack } from '../lib/auth-stack.js';
import { FoundationStack } from '../lib/foundation-stack.js';
import { WebStack } from '../lib/web-stack.js';

const app = new cdk.App();
const region = 'us-east-1';
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region,
};
const appDomain = app.node.getContext('appDomain') as string;
const oldMigrationRoleArn = app.node.tryGetContext('oldMigrationRoleArn') as string | undefined;
const oldGoogleCheckRoleArn = app.node.tryGetContext('oldGoogleCheckRoleArn') as string | undefined;

if (!oldMigrationRoleArn || !oldGoogleCheckRoleArn) {
  throw new Error('oldMigrationRoleArn と oldGoogleCheckRoleArn のcontextが必要です');
}

const foundation = new FoundationStack(app, 'PawapoFoundation', {
  env,
  appDomain,
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
  authAccess,
  legacyMigrationRoleArn: oldMigrationRoleArn,
  legacyGoogleCheckRoleArn: oldGoogleCheckRoleArn,
  description: 'パワポ作るマンのCognito認証基盤',
});

const agent = new AgentStack(app, 'PawapoAgent', {
  env,
  appDomain,
  auth,
  foundation,
  description: 'パワポ作るマンのAgentCore実行基盤',
});

const web = new WebStack(app, 'PawapoWeb', {
  env,
  appDomain,
  auth,
  agent,
  foundation,
  description: 'パワポ作るマンのWeb配信と共有スライド配信',
});

auth.addStackDependency(foundation);
auth.addStackDependency(authAccess);
agent.addStackDependency(auth);
agent.addStackDependency(foundation);
web.addStackDependency(agent);
web.addStackDependency(auth);
web.addStackDependency(foundation);

cdk.Tags.of(app).add('Project', 'pawapo');
cdk.Tags.of(app).add('ManagedBy', 'cdk-cdkd');
