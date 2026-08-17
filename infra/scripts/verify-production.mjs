#!/usr/bin/env node
/**
 * 本番構成の検査
 *
 * 「デプロイは成功するのに、利用者の経路では動かない」種類の壊れ方を、本番の実リソースから検出する。
 * 2026年8月に3件続けて起きた事故（コンテナへのファイル同梱漏れ、移行元の世代漏れ、
 * リクエストヘッダーの許可漏れ）は、どれもデプロイが成功し、エラーも出なかった。
 * 共通するのは「設定が落ちても無症状」という性質なので、期待値を機械で突き合わせる。
 *
 * CDKのソースを読むだけの静的検査とは役割が違う。こちらは「実際にAWSへ反映されているか」を見るので、
 * デプロイし忘れ、context落ち、コンソールからの手作業による差異まで捕まえられる。
 *
 * 使い方:
 *   node --env-file-if-exists=.env.production.local infra/scripts/verify-production.mjs
 *
 * 終了コード: 全項目合格なら0、1件でも不合格なら1。
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const region = 'us-east-1';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が .env.production.local に必要です。`);
  return value;
};

const profile = required('PAWAPO_TARGET_PROFILE');
const userPoolId = required('PAWAPO_USER_POOL_ID');
// 2代目の移行元は任意。設定していれば、その世代も届いているかまで検査する。
const legacyAccountId2 = process.env.PAWAPO_OLD2_ACCOUNT_ID;
const legacyUserPoolId2 = process.env.PAWAPO_OLD2_USER_POOL_ID;

const cdkJson = JSON.parse(readFileSync(new URL('../../cdk.json', import.meta.url), 'utf8'));
const appDomain = cdkJson.context.appDomain;

function aws(args) {
  const output = execFileSync('aws', [...args, '--profile', profile, '--region', region, '--output', 'json'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return output.trim() ? JSON.parse(output) : null;
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
}

/** 例外を出さずに検査する。1項目の失敗で残りの検査を止めない。 */
function guarded(name, fn) {
  try {
    fn();
  } catch (error) {
    check(name, false, `検査自体が失敗: ${error.message.split('\n')[0]}`);
  }
}

// ── AgentCore Runtime ───────────────────────────────────────────────
let runtimeId;
guarded('AgentCore Runtimeが稼働している', () => {
  const list = aws(['bedrock-agentcore-control', 'list-agent-runtimes']);
  const runtime = (list.agentRuntimes || []).find((r) => r.agentRuntimeName === 'pawapo_agent');
  if (!runtime) {
    check('AgentCore Runtimeが稼働している', false, 'pawapo_agent が見つからない');
    return;
  }
  runtimeId = runtime.agentRuntimeId;
  check('AgentCore Runtimeが稼働している', runtime.status === 'READY', `status=${runtime.status}`);
});

guarded('Authorizationヘッダーがコンテナへ転送される', () => {
  if (!runtimeId) throw new Error('Runtime IDを取得できていない');
  const runtime = aws(['bedrock-agentcore-control', 'get-agent-runtime', '--agent-runtime-id', runtimeId]);
  const allowlist = runtime.requestHeaderConfiguration?.requestHeaderAllowlist || [];
  // これが落ちると、JWTから利用者を識別できず、エラーも出ないまま利用統計だけが空になる。
  check(
    'Authorizationヘッダーがコンテナへ転送される',
    allowlist.includes('Authorization'),
    `許可リスト=[${allowlist.join(', ')}]`,
  );
});

guarded('Runtimeに必須の環境変数がそろっている', () => {
  if (!runtimeId) throw new Error('Runtime IDを取得できていない');
  const runtime = aws(['bedrock-agentcore-control', 'get-agent-runtime', '--agent-runtime-id', runtimeId]);
  const env = runtime.environmentVariables || {};
  const requiredKeys = [
    'AGENT_OBSERVABILITY_ENABLED',
    'TAVILY_SECRET_ARN',
    'SHARED_SLIDES_BUCKET',
    'SHARED_SLIDES_PUBLIC_DOMAIN',
  ];
  const missing = requiredKeys.filter((key) => !env[key]);
  check(
    'Runtimeに必須の環境変数がそろっている',
    missing.length === 0,
    missing.length ? `不足=${missing.join(', ')}` : `${requiredKeys.length}件すべてあり`,
  );
});

// ── ログ保持 ────────────────────────────────────────────────────────
guarded('エージェントのログが13か月保持になっている', () => {
  if (!runtimeId) throw new Error('Runtime IDを取得できていない');
  const logGroupName = `/aws/bedrock-agentcore/runtimes/${runtimeId}-DEFAULT`;
  const groups = aws(['logs', 'describe-log-groups', '--log-group-name-prefix', logGroupName]);
  const group = (groups.logGroups || []).find((g) => g.logGroupName === logGroupName);
  // AgentCoreが自動生成すると30日で消える。利用統計を後から集計できなくなる。
  check(
    'エージェントのログが13か月保持になっている',
    group?.retentionInDays === 400,
    group ? `retention=${group.retentionInDays ?? '未設定'}日` : 'ロググループが無い',
  );
});

// ── ユーザー移行 ────────────────────────────────────────────────────
guarded('移行元の世代がすべて設定されている', () => {
  const config = aws(['lambda', 'get-function-configuration', '--function-name', 'pawapo-user-migration']);
  const env = config.Environment?.Variables || {};
  const generations = [
    { label: '初代', keys: ['OLD_ACCOUNT_ROLE_ARN', 'OLD_USER_POOL_ID', 'OLD_USER_POOL_CLIENT_ID'] },
  ];
  // 2代目は設定ファイルで有効にしたときだけ必須にする（将来撤去したら自動的に検査対象から外れる）。
  if (legacyAccountId2 && legacyUserPoolId2) {
    generations.push({ label: '2代目', keys: ['OLD2_ACCOUNT_ROLE_ARN', 'OLD2_USER_POOL_ID', 'OLD2_USER_POOL_CLIENT_ID'] });
  }
  const missing = generations.flatMap((gen) =>
    gen.keys.filter((key) => !env[key]).map((key) => `${gen.label}:${key}`),
  );
  check(
    '移行元の世代がすべて設定されている',
    missing.length === 0,
    missing.length ? `不足=${missing.join(', ')}` : `${generations.length}世代ぶんそろっている`,
  );

  if (legacyUserPoolId2) {
    check(
      '2代目の移行元が想定のUser Poolを指している',
      env.OLD2_USER_POOL_ID === legacyUserPoolId2,
      `実際=${env.OLD2_USER_POOL_ID || '未設定'}`,
    );
  }
});

guarded('移行Lambdaが移行元の役割を引き受けられる', () => {
  const policyNames = aws(['iam', 'list-role-policies', '--role-name', 'pawapo-user-migration']);
  const statements = (policyNames.PolicyNames || []).flatMap((policyName) => {
    const policy = aws(['iam', 'get-role-policy', '--role-name', 'pawapo-user-migration', '--policy-name', policyName]);
    return policy.PolicyDocument.Statement || [];
  });
  const assumeTargets = statements
    .filter((s) => [].concat(s.Action).includes('sts:AssumeRole'))
    .flatMap((s) => [].concat(s.Resource));

  const expected = ['715841358122'];
  if (legacyAccountId2) expected.push(legacyAccountId2);
  const missing = expected.filter((accountId) => !assumeTargets.some((arn) => arn.includes(accountId)));
  check(
    '移行Lambdaが移行元の役割を引き受けられる',
    missing.length === 0,
    missing.length ? `引き受け先が不足（${missing.length}件）` : `${assumeTargets.length}件の引き受け先あり`,
  );
});

// ── 認証 ────────────────────────────────────────────────────────────
guarded('Googleログインが有効になっている', () => {
  const idp = aws([
    'cognito-idp', 'describe-identity-provider',
    '--user-pool-id', userPoolId, '--provider-name', 'Google',
  ]);
  check(
    'Googleログインが有効になっている',
    Boolean(idp.IdentityProvider?.ProviderDetails?.client_id),
    'IdP設定あり',
  );
});

guarded('パスワードとパスキーの両方でログインできる', () => {
  const pool = aws(['cognito-idp', 'describe-user-pool', '--user-pool-id', userPoolId]);
  const factors = pool.UserPool?.Policies?.SignInPolicy?.AllowedFirstAuthFactors || [];
  // 既存ユーザーはパスワードで移行するため、パスワードを外すと移行経路ごと壊れる。
  const missing = ['PASSWORD', 'WEB_AUTHN'].filter((factor) => !factors.includes(factor));
  check(
    'パスワードとパスキーの両方でログインできる',
    missing.length === 0,
    `許可=[${factors.join(', ')}]`,
  );
});

// ── Web配信 ─────────────────────────────────────────────────────────
guarded('本番ドメインがCloudFrontへ登録されている', () => {
  const list = aws(['cloudfront', 'list-distributions']);
  const distributions = list.DistributionList?.Items || [];
  const target = distributions.find((d) => (d.Aliases?.Items || []).some((alias) =>
    alias === appDomain || (alias.startsWith('*.') && appDomain.endsWith(alias.slice(1)))
  ));
  if (!target) {
    check('本番ドメインがCloudFrontへ登録されている', false, `${appDomain} を受ける配信が無い`);
    return;
  }
  check(
    '本番ドメインがCloudFrontへ登録されている',
    target.Status === 'Deployed' && target.Enabled,
    `status=${target.Status}`,
  );
  // ワイルドカードのままだと、同じ親ドメインの別サブドメインまで吸い込む。
  // 切替手順書では、切替とE2E成功後に名指し登録へ置き換えると定めている。
  const aliases = target.Aliases?.Items || [];
  check(
    '本番ドメインが名指しで登録されている（ワイルドカード頼りでない）',
    aliases.includes(appDomain),
    `エイリアス=[${aliases.join(', ')}]`,
  );
});

guarded('ログイン画面が配信されている', () => {
  const status = execFileSync('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '20', `https://${appDomain}/`], {
    encoding: 'utf8',
  }).trim();
  check('ログイン画面が配信されている', status === '200', `HTTP ${status}`);
});

// ── 費用の監視 ──────────────────────────────────────────────────────
guarded('予算アラートが設定されている', () => {
  const identity = aws(['sts', 'get-caller-identity']);
  const budgets = aws(['budgets', 'describe-budgets', '--account-id', identity.Account]);
  const budget = (budgets.Budgets || []).find((b) => b.BudgetName === 'pawapo-monthly');
  check('予算アラートが設定されている', Boolean(budget), budget ? `上限 $${Math.round(Number(budget.BudgetLimit.Amount))}/月` : '未設定');
});

// ── 期限が来た後片付け ──────────────────────────────────────────────
// ドキュメントに書くだけだと読み返さないので、期限が過ぎたらここで知らせる。
// 合否には数えない（放置しても壊れないが、片付けないと旧環境が残り続ける類のもの）。
const reminders = [];

// 旧共有サブドメインは、切替日から共有URLの有効期限（7日）を過ぎれば不要になる。
const shareExpiry = new Date('2026-08-22T00:00:00+09:00');
if (Date.now() >= shareExpiry.getTime()) {
  guarded('旧共有サブドメインの停止', () => {
    const zoneName = appDomain.split('.').slice(-2).join('.');
    const zones = aws(['route53', 'list-hosted-zones-by-name', '--dns-name', zoneName]);
    // 親ゾーンは別アカウントにあることもあるので、引けなければ黙って飛ばす。
    const zone = (zones.HostedZones || []).find((z) => z.Name === `${zoneName}.`);
    if (!zone) return;
    const records = aws(['route53', 'list-resource-record-sets', '--hosted-zone-id', zone.Id.split('/').pop()]);
    const legacyShare = (records.ResourceRecordSets || []).find((r) => r.Name === `slides.${appDomain}.`);
    if (legacyShare) {
      reminders.push('旧共有サブドメイン slides.* がまだ残っています。共有URLの有効期限は過ぎているので、切替runbookの「残っている後片付け」に従って撤去できます。');
    }
  });
}

// 2代目の移行元は、そこからの移行が止まったら撤去できる（日付ではなく実績で判断する）。
if (legacyAccountId2) {
  guarded('2代目の移行元の要否', () => {
    if (!runtimeId) return;
    const events = aws([
      'logs', 'filter-log-events',
      '--log-group-name', '/aws/lambda/pawapo-user-migration',
      '--start-time', String(Date.now() - 30 * 24 * 60 * 60 * 1000),
      '--filter-pattern', '2代目',
    ]);
    if ((events.events || []).length === 0) {
      reminders.push('直近30日で「2代目から移行」した利用者がいません。移行が一巡したなら、2代目の移行元を撤去できます（切替runbook参照）。');
    }
  });
}

// ── 結果 ────────────────────────────────────────────────────────────
const failures = results.filter((r) => !r.ok);
console.log('\n本番構成の検査\n');
for (const { name, ok, detail } of results) {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}
console.log(`\n${results.length - failures.length}/${results.length} 項目が合格\n`);

if (reminders.length > 0) {
  console.log('片付けられるものがあります:\n');
  for (const reminder of reminders) console.log(`  ・${reminder}`);
  console.log('');
}

if (failures.length > 0) {
  console.error('不合格の項目があります。デプロイを完了扱いにしないこと。\n');
  process.exit(1);
}
