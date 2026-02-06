/**
 * SSEストリーミング共通処理
 */

/**
 * SSEストリームのアイドルタイムアウトエラー
 */
export class SSEIdleTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`SSE idle timeout: no data received for ${timeoutMs}ms`);
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
  ongoingIdleTimeoutMs?: number
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';
  let firstEventReceived = false;

  while (true) {
    let readResult: ReadableStreamReadResult<Uint8Array>;

    // 初回イベント受信前: idleTimeoutMs（スロットリング検知）
    // 初回イベント受信後: ongoingIdleTimeoutMs（推論ハング検知）
    const currentTimeout = firstEventReceived ? ongoingIdleTimeoutMs : idleTimeoutMs;
    if (currentTimeout) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new SSEIdleTimeoutError(currentTimeout)), currentTimeout);
      });
      readResult = await Promise.race([reader.read(), timeoutPromise]);
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
