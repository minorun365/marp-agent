#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { Amplify } from 'aws-amplify';
import { fetchAuthSession, signIn } from 'aws-amplify/auth';

const DEFAULT_PROMPT = 'Bedrock AgentCoreを活用した社内向け生成AIエージェント導入提案を、部長層向けに作ってください。タイトル・裏表紙を含めて10枚。課題、解決策、導入ロードマップ、期待効果、リスク対策を含めてください。Web検索は不要です。';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(`引数は --key value 形式で指定してください: ${key ?? ''}`);
    }
    args[key.slice(2)] = value;
  }
  return args;
}

function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const key = line.slice(0, separator);
        const value = line.slice(separator + 1).replace(/^['"]|['"]$/g, '');
        return [key, value];
      }),
  );
}

function splitSlides(markdown) {
  const withoutFrontMatter = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
  return withoutFrontMatter
    .split(/\n---\s*\n/)
    .map((slide) => slide.trim())
    .filter(Boolean);
}

function visualLineCount(slide) {
  return slide.split('\n').filter((line) => {
    const trimmed = line.trim();
    return trimmed
      && !/^<!--.*-->$/.test(trimmed)
      && !/^\|[\s\-:|]+\|$/.test(trimmed)
      && !trimmed.startsWith('```');
  }).length;
}

function classifySlide(slide) {
  if (/_class:\s*top/.test(slide)) return 'top';
  if (/_class:\s*lead/.test(slide)) return 'lead';
  if (/_class:\s*end/.test(slide)) return 'end';
  if (/_class:\s*tinytext/.test(slide)) return 'sources';
  if (/^\|.*\|$/m.test(slide)) return 'table';
  if (/^###\s+/m.test(slide)) return 'subheading';
  const bulletCount = (slide.match(/^[-*+]\s+/gm) || []).length;
  if (bulletCount >= 5) return 'bullets';
  if (bulletCount >= 3 && /\*\*.+\*\*\s*$/.test(slide)) return 'summary';
  if (bulletCount >= 3) return 'mixed';
  return 'prose';
}

function analyzeMarkdown(markdown, prompt) {
  const slides = splitSlides(markdown);
  const requestedCounts = [...prompt.matchAll(/(\d{1,2})\s*枚/g)];
  const requestedSlideCount = requestedCounts.length
    ? Number(requestedCounts.at(-1)[1])
    : null;
  const classified = slides.map((slide) => ({
    type: classifySlide(slide),
    visualLines: visualLineCount(slide),
  }));
  const regular = classified.filter(({ type }) => !['top', 'lead', 'end', 'sources'].includes(type));
  const repeatedPatterns = [];
  for (let index = 1; index < regular.length; index += 1) {
    if (regular[index].type === regular[index - 1].type) {
      repeatedPatterns.push({ index: index + 1, type: regular[index].type });
    }
  }

  return {
    slideCount: slides.length,
    requestedSlideCount,
    frontMatter: {
      marp: /^marp:\s*true$/m.test(markdown),
      theme: /^theme:\s*\S+$/m.test(markdown),
      size: /^size:\s*16:9$/m.test(markdown),
      paginate: /^paginate:\s*true$/m.test(markdown),
    },
    topSlide: classified[0]?.type === 'top',
    endSlide: classified.at(-1)?.type === 'end',
    leadSlideCount: classified.filter(({ type }) => type === 'lead').length,
    likelyOverflowSlides: classified
      .map(({ visualLines }, index) => ({ slide: index + 1, visualLines }))
      .filter(({ visualLines }) => visualLines > 9),
    sparseRegularSlides: regular.filter(({ visualLines }) => visualLines < 5).length,
    repeatedPatterns,
    patternCounts: Object.fromEntries(
      [...new Set(regular.map(({ type }) => type))]
        .map((type) => [type, regular.filter((slide) => slide.type === type).length]),
    ),
    forbidden: {
      emojiCount: (markdown.match(/\p{Extended_Pictographic}/gu) || []).length,
      highlightCount: (markdown.match(/==/g) || []).length,
    },
  };
}

async function authenticate(outputs, env) {
  Amplify.configure(outputs);
  await signIn({
    username: env.TEST_USER_EMAIL,
    password: env.TEST_USER_PASSWORD,
    options: { authFlowType: 'USER_SRP_AUTH' },
  });
  const session = await fetchAuthSession();
  const token = session.tokens?.accessToken?.toString();
  if (!token) throw new Error('Cognitoアクセストークンを取得できませんでした');
  return token;
}

async function invokeRuntime({ outputs, accessToken, model, prompt, theme }) {
  const runtimeArn = outputs.custom.agentRuntimeArn;
  const region = runtimeArn.split(':')[3];
  const url = `https://bedrock-agentcore.${region}.amazonaws.com/runtimes/${encodeURIComponent(runtimeArn)}/invocations?qualifier=DEFAULT`;
  const startedAt = Date.now();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': randomUUID(),
    },
    body: JSON.stringify({ prompt, markdown: '', model_type: model, theme }),
  });
  if (!response.ok || !response.body) {
    throw new Error(`AgentCore API error: ${response.status} ${response.statusText}`);
  }

  let buffer = '';
  let markdown = '';
  const events = [];
  for await (const chunk of response.body) {
    buffer += new TextDecoder().decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      try {
        const event = JSON.parse(data);
        events.push({ type: event.type, data: event.type === 'markdown' ? undefined : event.data, error: event.error });
        if (event.type === 'markdown') markdown = event.data || event.content || '';
        if (event.type === 'error') throw new Error(event.error || event.message || 'AgentCore error');
      } catch (error) {
        if (error instanceof SyntaxError) continue;
        throw error;
      }
    }
  }
  if (!markdown) throw new Error('Markdownイベントが返されませんでした');
  return { markdown, events, elapsedMs: Date.now() - startedAt };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const model = args.model || 'sonnet';
  const outputBase = path.resolve(args.output || `/tmp/marp-agent-eval/${model}`);
  const root = path.resolve(import.meta.dirname, '..');
  const [outputsText, envText] = await Promise.all([
    readFile(path.join(root, 'amplify_outputs.json'), 'utf8'),
    readFile(path.join(root, '.env'), 'utf8'),
  ]);
  const outputs = JSON.parse(outputsText);
  const env = parseEnv(envText);
  const accessToken = await authenticate(outputs, env);
  const result = await invokeRuntime({
    outputs,
    accessToken,
    model,
    prompt: args.prompt || DEFAULT_PROMPT,
    theme: args.theme || 'speee',
  });
  const report = {
    model,
    prompt: args.prompt || DEFAULT_PROMPT,
    theme: args.theme || 'speee',
    elapsedMs: result.elapsedMs,
    eventCounts: Object.fromEntries(
      [...new Set(result.events.map(({ type }) => type))]
        .map((type) => [type, result.events.filter((event) => event.type === type).length]),
    ),
    analysis: analyzeMarkdown(result.markdown, args.prompt || DEFAULT_PROMPT),
  };

  await mkdir(path.dirname(outputBase), { recursive: true });
  await Promise.all([
    writeFile(`${outputBase}.md`, result.markdown),
    writeFile(`${outputBase}.json`, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  console.log(JSON.stringify(report, null, 2));
}

await main();
