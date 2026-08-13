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
const targetDistributionId = required('PAWAPO_TARGET_DISTRIBUTION_ID');
const targetDistributionDomain = required('PAWAPO_TARGET_DISTRIBUTION_DOMAIN');
const legacyAppId = required('PAWAPO_LEGACY_AMPLIFY_APP_ID');
const legacyCloudFrontDomain = required('PAWAPO_LEGACY_CLOUDFRONT_DOMAIN');
const cutoverWildcardDomain = required('PAWAPO_CUTOVER_WILDCARD_DOMAIN');
const runtimeId = required('PAWAPO_RUNTIME_ID');
const userPoolId = required('PAWAPO_USER_POOL_ID');
const userPoolClientId = required('PAWAPO_USER_POOL_CLIENT_ID');

const profiles = {
  target: required('PAWAPO_TARGET_PROFILE'),
  dns: required('PAWAPO_DNS_PROFILE'),
  legacy: required('PAWAPO_LEGACY_PROFILE'),
};

function aws(profile, args) {
  return execFileSync('aws', [...args, '--profile', profile, '--region', region, '--output', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function json(profile, args) {
  const output = aws(profile, args);
  return output ? JSON.parse(output) : {};
}

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function isNotFound(error) {
  return String(error?.stderr ?? '').includes('NotFoundException');
}

function currentRecords(name) {
  const response = json(profiles.dns, [
    'route53', 'list-resource-record-sets',
    '--hosted-zone-id', parentZoneId,
    '--query', `ResourceRecordSets[?Name=='${name}.']`,
  ]);
  return response;
}

function changeRecord(name, value) {
  return json(profiles.dns, [
    'route53', 'change-resource-record-sets',
    '--hosted-zone-id', parentZoneId,
    '--change-batch', JSON.stringify({
      Comment: `Pawapo production cutover: ${name}`,
      Changes: [{
        Action: 'UPSERT',
        ResourceRecordSet: {
          Name: `${name}.`,
          Type: 'CNAME',
          TTL: 60,
          ResourceRecords: [{ Value: `${value}.` }],
        },
      }],
    }),
  ]);
}

function removeLegacyDomainAssociation() {
  return json(profiles.legacy, [
    'amplify', 'delete-domain-association',
    '--app-id', legacyAppId,
    '--domain-name', 'minoruonda.com',
  ]);
}

function waitForLegacyPawapoRemoval() {
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    let legacy;
    try {
      legacy = json(profiles.legacy, [
        'amplify', 'get-domain-association',
        '--app-id', legacyAppId,
        '--domain-name', 'minoruonda.com',
      ]).domainAssociation;
    } catch (error) {
      if (isNotFound(error)) return 'REMOVED';
      throw error;
    }
    const pawapo = legacy.subDomains.find((item) => item.subDomainSetting.prefix === 'pawapo');
    if (!pawapo) return legacy.domainStatus;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10_000);
  }
  throw new Error('旧Amplifyから本番ドメインが外れるまでの待機がタイムアウトしました。');
}

function printSummary(data) {
  console.log(JSON.stringify(data, null, 2));
}

function preflight() {
  const targetIdentity = json(profiles.target, ['sts', 'get-caller-identity']);
  const dnsIdentity = json(profiles.dns, ['sts', 'get-caller-identity']);
  const legacyIdentity = json(profiles.legacy, ['sts', 'get-caller-identity']);
  ensure(targetIdentity.Account !== dnsIdentity.Account, '新環境とDNS管理アカウントが同一です。想定を確認してください。');
  ensure(targetIdentity.Account !== legacyIdentity.Account, '新環境と旧環境アカウントが同一です。想定を確認してください。');

  const distribution = json(profiles.target, ['cloudfront', 'get-distribution', '--id', targetDistributionId]).Distribution;
  const aliases = distribution.DistributionConfig.Aliases.Items ?? [];
  ensure(distribution.Status === 'Deployed', '新CloudFrontがDeployedではありません。');
  ensure(distribution.DistributionConfig.Enabled === true, '新CloudFrontが無効です。');
  const targetReadyForDomain = aliases.includes(productionDomain) || aliases.includes(cutoverWildcardDomain);
  ensure(targetReadyForDomain, '新CloudFrontに本番ドメインを覆う待機設定がありません。');

  const certificateArn = distribution.DistributionConfig.ViewerCertificate.ACMCertificateArn;
  ensure(certificateArn, '新CloudFrontのACM証明書を確認できません。');
  const certificate = json(profiles.target, ['acm', 'describe-certificate', '--certificate-arn', certificateArn]).Certificate;
  ensure(certificate.Status === 'ISSUED', '新CloudFrontのACM証明書がISSUEDではありません。');
  ensure(certificate.SubjectAlternativeNames.includes(productionDomain), '新ACM証明書に本番ドメインがありません。');
  ensure(certificate.SubjectAlternativeNames.includes(cutoverWildcardDomain), '新ACM証明書に切替用ワイルドカードがありません。');

  const runtime = json(profiles.target, [
    'bedrock-agentcore-control', 'get-agent-runtime',
    '--agent-runtime-id', runtimeId,
  ]);
  ensure(runtime.status === 'READY', 'AgentCore RuntimeがREADYではありません。');

  const auth = json(profiles.target, [
    'cognito-idp', 'describe-user-pool-client',
    '--user-pool-id', userPoolId,
    '--client-id', userPoolClientId,
  ]).UserPoolClient;
  ensure(auth.CallbackURLs.includes(`https://${productionDomain}/`), 'Cognitoの本番Callback URLがありません。');
  ensure(auth.SupportedIdentityProviders.includes('Google'), 'CognitoのGoogle認証が無効です。');

  const legacy = json(profiles.legacy, [
    'amplify', 'get-domain-association',
    '--app-id', legacyAppId,
    '--domain-name', 'minoruonda.com',
  ]).domainAssociation;
  ensure(legacy.domainStatus === 'AVAILABLE', '旧Amplifyの独自ドメインがAVAILABLEではありません。');
  ensure(legacy.subDomains.length === 1, '旧Amplifyの独自ドメインにpawapo以外の関連付けがあります。自動削除を停止します。');
  ensure(legacy.subDomains.some((item) => item.subDomainSetting.prefix === 'pawapo' && item.verified), '旧Amplifyのpawapoサブドメインが確認できません。');

  const productionRecord = currentRecords(productionDomain);
  const previewRecord = currentRecords(`preview.${productionDomain}`);
  ensure(productionRecord.length === 1 && productionRecord[0].Type === 'CNAME', '本番DNSが単一CNAMEではありません。');
  ensure(previewRecord.length === 1 && previewRecord[0].Type === 'CNAME', 'プレビューDNSが単一CNAMEではありません。');
  ensure(productionRecord[0].TTL === 60, '本番DNSのTTLが60秒ではありません。');
  const productionDns = productionRecord[0].ResourceRecords?.[0]?.Value;
  const allowedProductionTargets = apply
    ? [`${legacyCloudFrontDomain}.`, `${targetDistributionDomain}.`]
    : [`${legacyCloudFrontDomain}.`];
  ensure(allowedProductionTargets.includes(productionDns), '本番DNSが旧Amplify以外の予期しない配信先を向いています。');
  ensure(previewRecord[0].ResourceRecords?.[0]?.Value === `${targetDistributionDomain}.`, 'プレビューDNSが新CloudFrontを向いていません。');

  return {
    targetDistributionStatus: distribution.Status,
    targetAliases: aliases,
    targetReadyForDomain,
    certificateStatus: certificate.Status,
    runtimeStatus: runtime.status,
    cognitoCallbackReady: true,
    googleReady: true,
    legacyDomainStatus: legacy.domainStatus,
    productionDns,
    productionDnsTtl: productionRecord[0].TTL,
    previewDns: previewRecord[0].ResourceRecords[0].Value,
  };
}

try {
  const state = preflight();
  if (!apply) {
    printSummary({ mode: 'preflight', ready: true, ...state });
    console.log(`\n切替を実行するときだけ ${APPLY_FLAG} を付けてください。`);
    process.exit(0);
  }

  if (state.productionDns !== `${targetDistributionDomain}.`) {
    const change = changeRecord(productionDomain, targetDistributionDomain);
    execFileSync('aws', [
      'route53', 'wait', 'resource-record-sets-changed',
      '--id', change.ChangeInfo.Id,
      '--profile', profiles.dns,
    ], { stdio: 'inherit' });
  }
  const after = currentRecords(productionDomain);
  ensure(after[0].ResourceRecords[0].Value === `${targetDistributionDomain}.`, '本番DNSの切替後検証に失敗しました。');
  removeLegacyDomainAssociation();
  const legacyDomainStatus = waitForLegacyPawapoRemoval();
  printSummary({
    mode: 'apply',
    changed: true,
    target: targetDistributionDomain,
    route53Status: 'INSYNC',
    legacyDomainRemoved: true,
    legacyDomainStatus,
  });
} catch (error) {
  console.error(`切替を停止しました: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
