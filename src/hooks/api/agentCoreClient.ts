/**
 * AgentCore API呼び出し（エージェント実行）
 */

import { fetchAuthSession } from 'aws-amplify/auth';
import outputs from '../../../amplify_outputs.json';
import { readSSEStream } from '../streaming/sseParser';
import type { ModelType, ReferenceFile } from '../../components/Chat/types';

const SSE_IDLE_TIMEOUT_MS = 30_000;         // 初回イベント前: 30秒
const SSE_ONGOING_IDLE_TIMEOUT_MS = 60_000;  // イベント間: 60秒

interface EvaluationTraceEvent {
  elapsedMs: number;
  type: string;
  toolName?: string;
  query?: string;
  contentLength?: number;
}

interface EvaluationTrace {
  startedAt: string;
  modelType: ModelType;
  prompt: string;
  events: EvaluationTraceEvent[];
  markdown: string;
}

declare global {
  interface Window {
    __MARPA_EVALUATION_TRACE__?: EvaluationTrace;
  }
}

let evaluationStartedAt = 0;
const EVALUATION_TRACE_ELEMENT_ID = 'marpa-evaluation-trace';

function isLocalEvaluation() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function persistEvaluationTrace() {
  if (!window.__MARPA_EVALUATION_TRACE__) return;

  let traceElement = document.getElementById(EVALUATION_TRACE_ELEMENT_ID);
  if (!traceElement) {
    traceElement = document.createElement('script');
    traceElement.id = EVALUATION_TRACE_ELEMENT_ID;
    traceElement.setAttribute('type', 'application/json');
    document.head.appendChild(traceElement);
  }
  traceElement.textContent = JSON.stringify(window.__MARPA_EVALUATION_TRACE__);
}

function startEvaluationTrace(modelType: ModelType, prompt: string) {
  if (!isLocalEvaluation()) return;

  evaluationStartedAt = performance.now();
  window.__MARPA_EVALUATION_TRACE__ = {
    startedAt: new Date().toISOString(),
    modelType,
    prompt,
    events: [{ elapsedMs: 0, type: 'invoke_start' }],
    markdown: '',
  };
  persistEvaluationTrace();
}

function recordEvaluationEvent(
  type: string,
  details: Omit<EvaluationTraceEvent, 'elapsedMs' | 'type'> = {},
) {
  if (!isLocalEvaluation() || !window.__MARPA_EVALUATION_TRACE__) return;

  window.__MARPA_EVALUATION_TRACE__.events.push({
    elapsedMs: Math.round(performance.now() - evaluationStartedAt),
    type,
    ...details,
  });
  persistEvaluationTrace();
}

export interface AgentCoreCallbacks {
  onText: (text: string) => void;
  onStatus: (status: string) => void;
  onMarkdown: (markdown: string) => void;
  onTweetUrl?: (url: string) => void;
  onToolUse: (toolName: string, query?: string) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
}

export type { ModelType } from '../../components/Chat/types';

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

  recordEvaluationEvent(event.type || 'unknown', {
    ...(event.type === 'tool_use' && textValue ? { toolName: textValue } : {}),
    ...(event.query ? { query: event.query } : {}),
    ...(textValue ? { contentLength: textValue.length } : {}),
  });

  if (event.type === 'markdown' && textValue && window.__MARPA_EVALUATION_TRACE__) {
    window.__MARPA_EVALUATION_TRACE__.markdown = textValue;
    persistEvaluationTrace();
  }

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
  theme: string,
  callbacks: AgentCoreCallbacks,
  sessionId?: string,
  modelType: ModelType = 'kimi',
  referenceFile?: ReferenceFile
): Promise<void> {
  startEvaluationTrace(modelType, prompt);

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
        theme,
        ...(referenceFile && { reference_file: referenceFile }),
      }),
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    recordEvaluationEvent('response_open');

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    await readSSEStream(
      reader,
      (event) => handleEvent(event as Parameters<typeof handleEvent>[0], callbacks),
      () => {
        recordEvaluationEvent('stream_done');
        callbacks.onComplete();
      },
      SSE_IDLE_TIMEOUT_MS,
      SSE_ONGOING_IDLE_TIMEOUT_MS,
    );
  } catch (error) {
    recordEvaluationEvent('invocation_error');
    // ストリーム切断エラーは呼び出し元のcatchで処理
    // （ストリーム中のエラーイベントはhandleEvent→onErrorで処理済み）
    throw error instanceof Error ? error : new Error(String(error));
  }
}
