#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const APPLY_FLAG = '--apply';
const apply = process.argv.includes(APPLY_FLAG);
const region = 'us-east-1';
const productionDomain = 'pawapo.minoruonda.com';
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が .env.production.local に必要です。`);
  return value;
};
const parentZoneId = required('PAWAPO_PARENT_ZONE_ID');
const dnsProfile = required('PAWAPO_DNS_PROFILE');
const legacyProfile = required('PAWAPO_LEGACY_PROFILE');
const legacyAppId = required('PAWAPO_LEGACY_AMPLIFY_APP_ID');
const legacyCloudFrontDomain = required('PAWAPO_LEGACY_CLOUDFRONT_DOMAIN');

function aws(profile, args) {
  return execFileSync('aws', [...args, '--profile', profile, '--region', region, '--output', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function currentRecord() {
  return JSON.parse(aws(dnsProfile, [
    'route53', 'list-resource-record-sets',
    '--hosted-zone-id', parentZoneId,
    '--query', `ResourceRecordSets[?Name=='${productionDomain}.']`,
  ]));
}

function isNotFound(error) {
  return String(error?.stderr ?? '').includes('NotFoundException');
}

function ensureLegacyDomain() {
  try {
    const existing = JSON.parse(aws(legacyProfile, [
      'amplify', 'get-domain-association', '--app-id', legacyAppId, '--domain-name', 'minoruonda.com',
    ])).domainAssociation;
    if (existing.domainStatus === 'AVAILABLE'
      && existing.subDomains.some((item) => item.subDomainSetting.prefix === 'pawapo' && item.verified)) return;
  } catch (error) {
    if (!isNotFound(error)) throw error;
    JSON.parse(aws(legacyProfile, [
      'amplify', 'create-domain-association',
      '--app-id', legacyAppId,
      '--domain-name', 'minoruonda.com',
      '--no-enable-auto-sub-domain',
      '--sub-domain-settings', 'prefix=pawapo,branchName=main',
    ]));
  }

  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    const domain = JSON.parse(aws(legacyProfile, [
      'amplify', 'get-domain-association', '--app-id', legacyAppId, '--domain-name', 'minoruonda.com',
    ])).domainAssociation;
    if (domain.domainStatus === 'AVAILABLE'
      && domain.subDomains.some((item) => item.subDomainSetting.prefix === 'pawapo' && item.verified)) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10_000);
  }
  throw new Error('旧Amplifyの本番ドメイン再関連付けが30分以内に完了しませんでした。');
}

const before = currentRecord();
if (!apply) {
  console.log(JSON.stringify({
    mode: 'preflight',
    current: before[0]?.ResourceRecords?.[0]?.Value,
    rollbackTarget: `${legacyCloudFrontDomain}.`,
    note: '実行時に旧Amplifyのドメイン再関連付けを完了させてからDNSを戻します。',
  }, null, 2));
  console.log(`\n切り戻しを実行するときだけ ${APPLY_FLAG} を付けてください。`);
  process.exit(0);
}

ensureLegacyDomain();
const response = JSON.parse(aws(dnsProfile, [
  'route53', 'change-resource-record-sets',
  '--hosted-zone-id', parentZoneId,
  '--change-batch', JSON.stringify({
    Comment: 'Pawapo production rollback to Amplify',
    Changes: [{
      Action: 'UPSERT',
      ResourceRecordSet: {
        Name: `${productionDomain}.`,
        Type: 'CNAME',
        TTL: 60,
        ResourceRecords: [{ Value: `${legacyCloudFrontDomain}.` }],
      },
    }],
  }),
]));
execFileSync('aws', [
  'route53', 'wait', 'resource-record-sets-changed',
  '--id', response.ChangeInfo.Id,
  '--profile', dnsProfile,
], { stdio: 'inherit' });

const after = currentRecord();
if (after[0]?.ResourceRecords?.[0]?.Value !== `${legacyCloudFrontDomain}.`) {
  console.error('切り戻し後のDNS検証に失敗しました。');
  process.exit(1);
}
console.log(JSON.stringify({ mode: 'apply', rolledBack: true, target: `${legacyCloudFrontDomain}.` }, null, 2));
