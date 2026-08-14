#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { LegacyMigrationAccessStack } from '../lib/legacy-migration-access-stack.js';

const app = new cdk.App();
const region = 'us-east-1';
const targetAccountId = app.node.tryGetContext('targetAccountId') as string | undefined;
const sourceUserPoolId = app.node.tryGetContext('sourceUserPoolId') as string | undefined;

if (!targetAccountId || !sourceUserPoolId) {
  throw new Error('targetAccountId と sourceUserPoolId のcontextが必要です');
}

new LegacyMigrationAccessStack(app, 'PawapoLegacyMigrationAccess', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region,
  },
  targetAccountId,
  sourceUserPoolId,
  description: '旧Cognitoから新Cognitoへ初回ログインで移行するための一時アクセス',
});

cdk.Tags.of(app).add('Project', 'pawapo');
cdk.Tags.of(app).add('ManagedBy', 'cdk-cdkd');
