#!/usr/bin/env node
/**
 * 本番スモークテスト（利用者と同じ経路を通す）
 *
 * 構成の検査（verify-production.mjs）が通っても、利用者の経路が動くとは限らない。
 * 2026年8月の424障害は、Runtimeの管理状態がREADYのままコンテナだけが起動に失敗していた。
 * 状態表示やHTTP 200では捕まらないので、実際にログインして生成まで通す。
 *
 * 通すのは、切替runbookが「完了条件」と定めた経路:
 *   ログイン → スライド生成 → 利用者の識別記録 → PDF書き出し
 *
 * 使い方:
 *   node --env-file-if-exists=.env --env-file-if-exists=.env.production.local \
 *     infra/scripts/smoke-production.mjs
 *
 * 終了コード: 全項目合格なら0、1件でも不合格なら1。
 */

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const region = 'us-east-1';

const required = (name, hint) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が必要です（${hint}）。`);
  return value;
};

const profile = required('PAWAPO_TARGET_PROFILE', '.env.production.local');
const userPoolId = required('PAWAPO_USER_POOL_ID', '.env.production.local');
const testEmail = required('TEST_USER_EMAIL', '.env');
const testPassword = required('TEST_USER_PASSWORD', '.env');

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
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

console.log('\n本番スモークテスト（利用者と同じ経路）\n');

// ── 1. ログイン ─────────────────────────────────────────────────────
const clientId = aws(['cognito-idp', 'list-user-pool-clients', '--user-pool-id', userPoolId, '--max-results', '10'])
  .UserPoolClients.find((c) => !c.ClientName.includes('migration'))?.ClientId;
if (!clientId) throw new Error('User Pool クライアントを特定できません。');

let accessToken;
try {
  const auth = aws([
    'cognito-idp', 'initiate-auth',
    '--client-id', clientId,
    '--auth-flow', 'USER_PASSWORD_AUTH',
    '--auth-parameters', `USERNAME=${testEmail},PASSWORD=${testPassword}`,
  ]);
  accessToken = auth.AuthenticationResult?.AccessToken;
  check('テストユーザーでログインできる', Boolean(accessToken), accessToken ? 'トークン取得' : '取得できず');
} catch (error) {
  check('テストユーザーでログインできる', false, error.message.split('\n')[0]);
}

// ── 2. スライド生成 ─────────────────────────────────────────────────
const runtime = aws(['bedrock-agentcore-control', 'list-agent-runtimes'])
  .agentRuntimes.find((r) => r.agentRuntimeName === 'pawapo_agent');
if (!runtime) throw new Error('AgentCore Runtime が見つかりません。');

// セッションIDは33文字以上が必要。区切りを入れず、衝突しない値にする。
const sessionId = `smoke${randomUUID().replaceAll('-', '')}`;
let generated = false;
let markdown = '';

if (accessToken) {
  const url = `https://bedrock-agentcore.${region}.amazonaws.com/runtimes/${encodeURIComponent(runtime.agentRuntimeArn)}/invocations?qualifier=DEFAULT`;
  try {
    const body = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${accessToken}`,
        'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': sessionId,
      },
      body: JSON.stringify({
        prompt: '動作確認のため、AWSの良いところを1枚のスライドにまとめて',
        model_type: 'kimi',
        theme: 'border',
      }),
      signal: AbortSignal.timeout(180_000),
    }).then((response) => response.text());

    // 完成したスライドは markdown イベントで届く（型の一覧は agent.py が正）。
    let errorMessage = '';
    for (const line of body.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        const text = event.content || event.data;
        if (event.type === 'markdown' && text) {
          markdown = text;
          generated = true;
        }
        if (event.type === 'error') errorMessage = event.error || event.message || 'エラーイベント';
      } catch {
        // 分割されたイベントは無視してよい（全体の成否は markdown / error で判定する）
      }
    }
    check(
      '認証済みでスライドを生成できる',
      generated,
      generated ? `${markdown.length}文字のスライドを受信` : errorMessage || 'markdownイベントが来なかった',
    );
  } catch (error) {
    check('認証済みでスライドを生成できる', false, error.message.split('\n')[0]);
  }
} else {
  check('認証済みでスライドを生成できる', false, 'ログインできていないので未実施');
}

// ── 3. 利用者の識別記録 ─────────────────────────────────────────────
// 生成そのものが通っても、識別が壊れていると利用統計だけが静かに空になる（2026年8月の実例）。
if (generated) {
  const logGroupName = `/aws/bedrock-agentcore/runtimes/${runtime.agentRuntimeId}-DEFAULT`;
  let identified = false;
  for (let attempt = 0; attempt < 6 && !identified; attempt += 1) {
    await sleep(5000);
    const events = aws([
      'logs', 'filter-log-events',
      '--log-group-name', logGroupName,
      '--start-time', String(Date.now() - 10 * 60 * 1000),
      '--filter-pattern', sessionId,
    ]);
    identified = (events.events || []).some((event) =>
      event.message.includes('pawapo_session_identity') && event.message.includes('"identified": true'),
    );
  }
  check('利用者を識別して記録できている', identified, identified ? '識別子つきで記録' : '識別ログを確認できず');
} else {
  check('利用者を識別して記録できている', false, '生成できていないので未実施');
}

// ── 4. PDF書き出し ──────────────────────────────────────────────────
if (generated && markdown) {
  const url = `https://bedrock-agentcore.${region}.amazonaws.com/runtimes/${encodeURIComponent(runtime.agentRuntimeArn)}/invocations?qualifier=DEFAULT`;
  try {
    const body = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${accessToken}`,
        'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': sessionId,
      },
      body: JSON.stringify({ action: 'export_pdf', markdown, theme: 'border' }),
      signal: AbortSignal.timeout(180_000),
    }).then((response) => response.text());

    let exported = false;
    let errorMessage = '';
    for (const line of body.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'pdf') exported = true;
        if (event.type === 'error') errorMessage = event.error || event.message || 'エラーイベント';
      } catch {
        // 分割されたイベントは無視してよい
      }
    }
    check('PDFを書き出せる', exported, exported ? 'PDFイベントを受信' : errorMessage || 'PDFイベントが来なかった');
  } catch (error) {
    check('PDFを書き出せる', false, error.message.split('\n')[0]);
  }
} else {
  check('PDFを書き出せる', false, '生成結果が無いので未実施');
}

// ── 5. Grokを選んだときの生成 ───────────────────────────────────────
// Grok 4.6はMantleという別エンドポイントで動くので、Kimiが通っても認可や接続が
// 落ちていることがある。既定がKimiのままだと利用者が選ぶまで誰も気づけないため、
// 選択肢として出している間は毎回ここで通す。
if (accessToken) {
  const url = `https://bedrock-agentcore.${region}.amazonaws.com/runtimes/${encodeURIComponent(runtime.agentRuntimeArn)}/invocations?qualifier=DEFAULT`;
  try {
    const body = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${accessToken}`,
        'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': `${sessionId}-grok`,
      },
      body: JSON.stringify({
        prompt: 'Web検索は不要です。動作確認のため、AWSの良いところを4枚のスライドにまとめて',
        model_type: 'grok',
        theme: 'border',
      }),
      signal: AbortSignal.timeout(180_000),
    }).then((response) => response.text());

    let grokMarkdown = '';
    let errorMessage = '';
    for (const line of body.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        const text = event.content || event.data;
        if (event.type === 'markdown' && text) grokMarkdown = text;
        if (event.type === 'error') errorMessage = event.error || event.message || 'エラーイベント';
      } catch {
        // 分割されたイベントは無視してよい
      }
    }
    check(
      'Grokを選んでもスライドを生成できる',
      Boolean(grokMarkdown),
      grokMarkdown ? `${grokMarkdown.length}文字のスライドを受信` : errorMessage || 'markdownイベントが来なかった',
    );
  } catch (error) {
    check('Grokを選んでもスライドを生成できる', false, error.message.split('\n')[0]);
  }
} else {
  check('Grokを選んでもスライドを生成できる', false, 'ログインできていないので未実施');
}

// ── 6. Web検索を使う経路 ────────────────────────────────────────────
// 検索APIのキーが枯渇すると、エージェントは「無料枠が枯渇しました」と案内して
// スライドを作らずに終わる。HTTPは200のままで構成検査も通るため、これまで
// 利用者から指摘されるまで気づけなかった（2026-08-20に約半日止まっていた）。
if (accessToken) {
  const url = `https://bedrock-agentcore.${region}.amazonaws.com/runtimes/${encodeURIComponent(runtime.agentRuntimeArn)}/invocations?qualifier=DEFAULT`;
  try {
    const body = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', Accept: 'text/event-stream',
        Authorization: `Bearer ${accessToken}`,
        'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': `${sessionId}-search`,
      },
      body: JSON.stringify({
        prompt: 'Amazon Bedrock AgentCoreの最新情報を調べて、6枚のスライドにまとめて',
        theme: 'border',
      }),
      signal: AbortSignal.timeout(300_000),
    }).then((r) => r.text());

    let searched = false;
    let searchMarkdown = '';
    let agentText = '';
    for (const line of body.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'tool_use' && event.data === 'web_search') searched = true;
        if (event.type === 'markdown') searchMarkdown = event.data || event.content || '';
        if (event.type === 'text') agentText += event.data || event.content || '';
      } catch {
        // 分割されたイベントは無視してよい
      }
    }
    const exhausted = agentText.includes('枯渇');
    check(
      'Web検索を使う依頼でもスライドを生成できる',
      searched && Boolean(searchMarkdown) && !exhausted,
      exhausted
        ? '検索APIのキーが枯渇している（Secrets Managerのキーを差し替える）'
        : searchMarkdown
          ? `検索${searched ? 'あり' : 'なし'}で${searchMarkdown.length}文字のスライドを受信`
          : 'スライドが返らなかった',
    );
  } catch (error) {
    check('Web検索を使う依頼でもスライドを生成できる', false, error.message.split('\n')[0]);
  }
} else {
  check('Web検索を使う依頼でもスライドを生成できる', false, 'ログインできていないので未実施');
}

// ── 結果 ────────────────────────────────────────────────────────────
const failures = results.filter((r) => !r.ok);
console.log(`\n${results.length - failures.length}/${results.length} 項目が合格\n`);

if (failures.length > 0) {
  console.error('利用者の経路が通っていません。デプロイを完了扱いにしないこと。\n');
  process.exit(1);
}
