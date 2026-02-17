/**
 * SSEストリーミング共通処理
 */

/**
 * SSEアイドルタイムアウトエラー
 */
export class SSEIdleTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SSEIdleTimeoutError';
  }
}

/**
 * SSEレスポンスを読み取り、各イベントに対してコールバックを実行
 */
export async function readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: Record<string, unknown>) => void | 'stop',
  onDone?: () => void,
  idleTimeoutMs?: number,
  ongoingIdleTimeoutMs?: number,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';
  let firstEventReceived = false;

  while (true) {
    const timeoutMs = firstEventReceived ? ongoingIdleTimeoutMs : idleTimeoutMs;

    let readResult: ReadableStreamReadResult<Uint8Array>;
    if (timeoutMs) {
      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new SSEIdleTimeoutError(
            firstEventReceived
              ? `SSEイベント間のアイドルタイムアウト（${timeoutMs}ms）`
              : `SSE初回イベントのタイムアウト（${timeoutMs}ms）`
          ));
        }, timeoutMs);
      });
      try {
        readResult = await Promise.race([reader.read(), timeoutPromise]);
      } finally {
        clearTimeout(timeoutId!);
      }
    } else {
      readResult = await reader.read();
    }

    const { done, value } = readResult;
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        firstEventReceived = true;
        const data = line.slice(6);
        if (data === '[DONE]') {
          onDone?.();
          return;
        }

        try {
          const event = JSON.parse(data);
          const result = onEvent(event);
          if (result === 'stop') return;
        } catch {
          // JSONパースエラーは無視
        }
      }
    }
  }

  onDone?.();
}

/**
 * Base64文字列をBlobに変換
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}
