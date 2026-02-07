/**
 * AgentCore API呼び出し（エージェント実行）
 */

import { fetchAuthSession } from 'aws-amplify/auth';
import outputs from '../../../amplify_outputs.json';
import { readSSEStream } from '../streaming/sseParser';

/** SSEストリームのアイドルタイムアウト（ミリ秒）- 初回イベント受信前（スロットリング検知） */
const SSE_IDLE_TIMEOUT_MS = 10_000;
/** SSEストリームのアイドルタイムアウト（ミリ秒）- イベント間（推論ハング検知） */
const SSE_ONGOING_IDLE_TIMEOUT_MS = 60_000;

export interface AgentCoreCallbacks {
  onText: (text: string) => void;
  onStatus: (status: string) => void;
  onMarkdown: (markdown: string) => void;
  onTweetUrl?: (url: string) => void;
  onToolUse: (toolName: string, query?: string) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
}

export type ModelType = 'sonnet' | 'kimi' | 'kimi25' | 'opus' | 'haiku';

/**
 * AgentCore APIのベースURL・認証情報を取得
 */
export async function getAgentCoreConfig() {
  const runtimeArn = outputs.custom?.agentRuntimeArn;
  if (!runtimeArn) {
    throw new Error('AgentCore runtime ARN not configured');
  }

  // ARNからリージョンを抽出
  const arnParts = runtimeArn.split(':');
  const region = arnParts[3];
  const encodedArn = encodeURIComponent(runtimeArn);

  const url = `https://bedrock-agentcore.${region}.amazonaws.com/runtimes/${encodedArn}/invocations?qualifier=DEFAULT`;

  // Cognito認証トークンを取得
  const session = await fetchAuthSession();
  const accessToken = session.tokens?.accessToken?.toString();

  if (!accessToken) {
    throw new Error('認証が必要です。ログインしてください。');
  }

  return { url, accessToken };
}

/**
 * イベントをコールバックに振り分け
 */
function handleEvent(
  event: { type?: string; content?: string; data?: string; error?: string; message?: string; query?: string },
  callbacks: AgentCoreCallbacks
) {
  const textValue = event.content || event.data;

  switch (event.type) {
    case 'text':
      if (textValue) callbacks.onText(textValue);
      break;
    case 'status':
      if (textValue) callbacks.onStatus(textValue);
      break;
    case 'markdown':
      if (textValue) callbacks.onMarkdown(textValue);
      break;
    case 'tweet_url':
      if (textValue && callbacks.onTweetUrl) callbacks.onTweetUrl(textValue);
      break;
    case 'tool_use':
      if (textValue) callbacks.onToolUse(textValue, event.query);
      break;
    case 'error':
      if (event.error || event.message || textValue) {
        callbacks.onError(new Error(event.error || event.message || textValue));
      }
      break;
    default:
      if (event.error) {
        callbacks.onError(new Error(event.error));
      } else if (textValue) {
        callbacks.onText(textValue);
      }
  }
}

/**
 * エージェントを実行（ストリーミング対応）
 */
export async function invokeAgent(
  prompt: string,
  currentMarkdown: string,
  callbacks: AgentCoreCallbacks,
  sessionId?: string,
  modelType: ModelType = 'sonnet'
): Promise<void> {
  try {
    const { url, accessToken } = await getAgentCoreConfig();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${accessToken}`,
        ...(sessionId && { 'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': sessionId }),
      },
      body: JSON.stringify({
        prompt,
        markdown: currentMarkdown,
        model_type: modelType,
      }),
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    await readSSEStream(
      reader,
      (event) => handleEvent(event as Parameters<typeof handleEvent>[0], callbacks),
      () => callbacks.onComplete(),
      SSE_IDLE_TIMEOUT_MS,
      SSE_ONGOING_IDLE_TIMEOUT_MS
    );
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}
