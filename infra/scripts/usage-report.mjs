#!/usr/bin/env node
/**
 * 利用状況レポート（新基盤）
 *
 * 旧環境（Amplify時代）向けの集計スクリプトは、本番が3世代を経たあいだに実態と合わなくなり、
 * 現行の本番アカウントを1つも見ていない状態になっていた。ここでは新基盤だけを対象に、
 * 「誰が何回使ったか」まで数えられる形で作り直している。
 *
 * 利用者の識別は、エージェントが1行だけ残すJSONログ（pawapo_session_identity）を使う。
 * 記録されているのは利用者IDのハッシュだけなので、集計はできてもログから個人へはたどれない。
 *
 * 使い方:
 *   node --env-file-if-exists=.env --env-file-if-exists=.env.production.local \
 *     infra/scripts/usage-report.mjs [--days 14]
 *
 * KAG社内版も併せて見るときは、環境変数 PAWAPO_KAG_PROFILE と PAWAPO_KAG_RUNTIME_NAME を設定する。
 */

import { execFileSync } from 'node:child_process';

const region = 'us-east-1';
const daysArg = process.argv.indexOf('--days');
const days = daysArg > -1 ? Number(process.argv[daysArg + 1]) : 14;

const required = (name, hint) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が必要です（${hint}）。`);
  return value;
};

const profile = required('PAWAPO_TARGET_PROFILE', '.env.production.local');
const userPoolId = required('PAWAPO_USER_POOL_ID', '.env.production.local');
const kagProfile = process.env.PAWAPO_KAG_PROFILE;
const kagRuntimeName = process.env.PAWAPO_KAG_RUNTIME_NAME;

function aws(args, awsProfile = profile) {
  const output = execFileSync('aws', [...args, '--profile', awsProfile, '--region', region, '--output', 'json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return output.trim() ? JSON.parse(output) : null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** CloudWatch Logs Insights を実行し、結果を配列で返す */
async function runQuery(logGroupName, queryString, awsProfile = profile) {
  const start = Math.floor(Date.now() / 1000) - days * 86400;
  const end = Math.floor(Date.now() / 1000);
  const { queryId } = aws([
    'logs', 'start-query',
    '--log-group-name', logGroupName,
    '--start-time', String(start),
    '--end-time', String(end),
    '--query-string', queryString,
  ], awsProfile);

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(2000);
    const result = aws(['logs', 'get-query-results', '--query-id', queryId], awsProfile);
    if (result.status === 'Complete') {
      return (result.results || []).map((row) =>
        Object.fromEntries(row.filter((f) => f.field !== '@ptr').map((f) => [f.field, f.value])),
      );
    }
    if (result.status === 'Failed' || result.status === 'Cancelled') {
      throw new Error(`クエリが${result.status}で終了しました`);
    }
  }
  throw new Error('クエリがタイムアウトしました');
}

function findRuntimeLogGroup(runtimeName, awsProfile = profile) {
  const list = aws(['bedrock-agentcore-control', 'list-agent-runtimes'], awsProfile);
  const runtime = (list.agentRuntimes || []).find((r) => r.agentRuntimeName === runtimeName);
  if (!runtime) return null;
  return `/aws/bedrock-agentcore/runtimes/${runtime.agentRuntimeId}-DEFAULT`;
}

const jstDay = (utcDay) => utcDay.slice(0, 10);
const bar = (n, max, width = 34) => '█'.repeat(Math.max(0, Math.round((n / Math.max(max, 1)) * width)));

console.log(`\nパワポ作るマン 利用状況（直近${days}日）\n${'─'.repeat(56)}`);

// ── 日別のセッション数と利用者数 ────────────────────────────────────
const logGroup = findRuntimeLogGroup('pawapo_agent');
if (!logGroup) throw new Error('本番のAgentCore Runtimeが見つかりません。');

const daily = await runQuery(
  logGroup,
  'filter @message like /pawapo_session_identity/'
  + ' | parse @message /"session_id":\\s*"(?<sid>[^"]*)"/'
  + ' | parse @message /"user_hash":\\s*"(?<uh>[^"]*)"/'
  + ' | stats min(@timestamp) as first_seen by sid, uh'
  + ' | stats count(*) as sessions, count_distinct(uh) as users by datefloor(first_seen, 1d) as day'
  + ' | sort day asc',
);

console.log('\n■ 日別のセッション数と利用者数（UTC基準）\n');
if (daily.length === 0) {
  console.log('  記録がありません。識別ログが出ているか確認してください。');
} else {
  const maxSessions = Math.max(...daily.map((d) => Number(d.sessions)));
  console.log('  日付         セッション  利用者');
  for (const row of daily) {
    const sessions = Number(row.sessions);
    console.log(
      `  ${jstDay(row.day)}   ${String(sessions).padStart(7)}  ${String(row.users).padStart(5)}  ${bar(sessions, maxSessions)}`,
    );
  }
  const totalSessions = daily.reduce((sum, d) => sum + Number(d.sessions), 0);
  console.log(`\n  合計 ${totalSessions} セッション（1日あたり平均 ${(totalSessions / daily.length).toFixed(1)}）`);
}

// ── 利用者の内訳（リピート状況） ────────────────────────────────────
const perUser = await runQuery(
  logGroup,
  'filter @message like /pawapo_session_identity/'
  + ' | parse @message /"session_id":\\s*"(?<sid>[^"]*)"/'
  + ' | parse @message /"user_hash":\\s*"(?<uh>[^"]*)"/'
  + ' | parse @message /"identified":\\s*(?<ident>true|false)/'
  + ' | stats count_distinct(sid) as sessions by uh, ident'
  + ' | sort sessions desc',
);

console.log('\n■ 利用者の内訳\n');
const identified = perUser.filter((u) => u.ident === 'true');
const unidentified = perUser.filter((u) => u.ident !== 'true');
if (identified.length === 0) {
  console.log('  識別できた利用者がいません。Runtimeのヘッダー許可リストを確認してください。');
} else {
  const repeat = identified.filter((u) => Number(u.sessions) >= 2);
  const heavy = identified.filter((u) => Number(u.sessions) >= 5);
  console.log(`  識別できた利用者    ${identified.length} 人`);
  console.log(`  2回以上使った人     ${repeat.length} 人（${((repeat.length / identified.length) * 100).toFixed(0)}%）`);
  console.log(`  5回以上使った人     ${heavy.length} 人`);
  console.log(`  最多の利用者        ${identified[0].sessions} セッション`);
}
if (unidentified.length > 0) {
  const count = unidentified.reduce((sum, u) => sum + Number(u.sessions), 0);
  console.log(`  ※ 識別できなかったセッションが ${count} 件あります（許可リストの反映前の分）`);
}

// ── Cognito ─────────────────────────────────────────────────────────
const pool = aws(['cognito-idp', 'describe-user-pool', '--user-pool-id', userPoolId]);
console.log('\n■ 登録利用者\n');
console.log(`  Cognitoの登録数     ${pool.UserPool.EstimatedNumberOfUsers} 人`);

// ── コスト ──────────────────────────────────────────────────────────
const identity = aws(['sts', 'get-caller-identity']);
const startDate = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
const endDate = new Date().toISOString().slice(0, 10);
const cost = aws([
  'ce', 'get-cost-and-usage',
  '--time-period', `Start=${startDate},End=${endDate}`,
  '--granularity', 'DAILY',
  '--metrics', 'UnblendedCost',
  '--filter', JSON.stringify({ Not: { Dimensions: { Key: 'RECORD_TYPE', Values: ['Credit', 'Refund'] } } }),
]);
const dailyCost = (cost.ResultsByTime || []).map((r) => Number(r.Total.UnblendedCost.Amount));
const totalCost = dailyCost.reduce((sum, v) => sum + v, 0);
const totalSessions = daily.reduce((sum, d) => sum + Number(d.sessions), 0);

console.log('\n■ 費用（専用アカウント全体・クレジット適用前）\n');
console.log(`  期間合計            $${totalCost.toFixed(2)}（約${Math.round(totalCost * 155).toLocaleString()}円）`);
console.log(`  1日あたり平均        $${(totalCost / Math.max(dailyCost.length, 1)).toFixed(2)}`);
console.log(`  月額の見込み         $${((totalCost / Math.max(dailyCost.length, 1)) * 30).toFixed(2)}（約${Math.round((totalCost / Math.max(dailyCost.length, 1)) * 30 * 155).toLocaleString()}円）`);
if (totalSessions > 0) {
  console.log(`  1セッションあたり     $${(totalCost / totalSessions).toFixed(3)}（約${Math.round((totalCost / totalSessions) * 155)}円）`);
}
console.log(`  ※ アカウントはこのアプリ専用なので、全額がアプリの費用（account ${identity.Account.slice(0, 4)}…）`);

// ── KAG社内版（任意） ───────────────────────────────────────────────
if (kagProfile && kagRuntimeName) {
  try {
    const kagLogGroup = findRuntimeLogGroup(kagRuntimeName, kagProfile);
    if (kagLogGroup) {
      const kagDaily = await runQuery(
        kagLogGroup,
        'parse @message /"session\\.id":\\s*"(?<sid>[^"]+)"/'
        + ' | filter ispresent(sid)'
        + ' | stats min(@timestamp) as first_seen by sid'
        + ' | stats count(*) as sessions by datefloor(first_seen, 1d) as day'
        + ' | sort day asc',
        kagProfile,
      );
      const kagTotal = kagDaily.reduce((sum, d) => sum + Number(d.sessions), 0);
      console.log('\n■ KAG社内版\n');
      console.log(`  期間合計            ${kagTotal} セッション`);
      if (kagDaily.length > 0) {
        console.log(`  最終利用日          ${jstDay(kagDaily[kagDaily.length - 1].day)}`);
      }
    }
  } catch (error) {
    console.log(`\n■ KAG社内版\n\n  取得できませんでした: ${error.message.split('\n')[0]}`);
  }
}

// ── Tavily ──────────────────────────────────────────────────────────
const tavilyKeys = (process.env.TAVILY_API_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean);
if (tavilyKeys.length > 0) {
  console.log('\n■ Tavily 検索APIの残量\n');
  let totalRemaining = 0;
  for (const [index, key] of tavilyKeys.entries()) {
    try {
      const usage = await fetch('https://api.tavily.com/usage', {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10_000),
      }).then((response) => response.json());
      // 残量はキー単体ではなくアカウント単位で決まる。同じアカウントに別のキーがぶら下がっていると、
      // キー単体の使用量だけでは枯渇したかどうかを判定できない。
      const used = usage.account?.plan_usage ?? usage.account?.current_plan_usage ?? usage.key?.usage ?? 0;
      const limit = usage.account?.plan_limit ?? usage.key?.limit ?? 0;
      const keyUsed = usage.key?.usage ?? 0;
      const remaining = Math.max(limit - used, 0);
      totalRemaining += remaining;
      const note = remaining === 0 ? '  ← 枯渇' : '';
      const sibling = used > keyUsed ? `（うちこのキー ${keyUsed}）` : '';
      console.log(`  キー${index + 1}   ${used} / ${limit} 使用${sibling}（残り ${remaining}）${note}`);
    } catch (error) {
      console.log(`  キー${index + 1}   取得できず（${error.message.split('\n')[0]}）`);
    }
  }
  console.log(`\n  残りの合計          ${totalRemaining} クレジット（毎月1日にリセット）`);
}

console.log(`\n${'─'.repeat(56)}\n`);
