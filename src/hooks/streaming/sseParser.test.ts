import { describe, it, expect, vi } from 'vitest';
import { readSSEStream, base64ToBlob, SSEIdleTimeoutError } from './sseParser';

/**
 * TextEncoderでUint8Arrayに変換するヘルパー
 */
function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * 複数チャンクを返すモックReaderを作成
 */
function createMockReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  let index = 0;
  return {
    read: vi.fn(async () => {
      if (index < chunks.length) {
        return { done: false, value: encode(chunks[index++]) };
      }
      return { done: true, value: undefined };
    }),
    cancel: vi.fn(),
    releaseLock: vi.fn(),
    closed: Promise.resolve(undefined),
  } as unknown as ReadableStreamDefaultReader<Uint8Array>;
}

describe('readSSEStream', () => {
  it('SSEイベントを正しくパースしてコールバックを呼ぶ', async () => {
    const reader = createMockReader([
      'data: {"type":"text","content":"Hello"}\n\n',
    ]);
    const onEvent = vi.fn();

    await readSSEStream(reader, onEvent);

    expect(onEvent).toHaveBeenCalledWith({ type: 'text', content: 'Hello' });
  });

  it('[DONE]でストリームを終了し、onDoneを呼ぶ', async () => {
    const reader = createMockReader([
      'data: {"type":"text","content":"Hi"}\ndata: [DONE]\n',
    ]);
    const onEvent = vi.fn();
    const onDone = vi.fn();

    await readSSEStream(reader, onEvent, onDone);

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('複数チャンクにまたがるイベントを正しく処理する', async () => {
    const reader = createMockReader([
      'data: {"type":"te',
      'xt","content":"split"}\n\n',
    ]);
    const onEvent = vi.fn();

    await readSSEStream(reader, onEvent);

    expect(onEvent).toHaveBeenCalledWith({ type: 'text', content: 'split' });
  });

  it('不正なJSONは無視する', async () => {
    const reader = createMockReader([
      'data: not-json\ndata: {"valid":true}\n\n',
    ]);
    const onEvent = vi.fn();

    await readSSEStream(reader, onEvent);

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ valid: true });
  });

  it('コールバックが"stop"を返したらストリームを停止する', async () => {
    const reader = createMockReader([
      'data: {"n":1}\ndata: {"n":2}\n\n',
    ]);
    const onEvent = vi.fn().mockReturnValueOnce('stop');

    await readSSEStream(reader, onEvent);

    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('data:プレフィックスのない行は無視する', async () => {
    const reader = createMockReader([
      'event: message\ndata: {"ok":true}\n\n',
    ]);
    const onEvent = vi.fn();

    await readSSEStream(reader, onEvent);

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ ok: true });
  });

  it('ストリーム終了時に[DONE]がなくてもonDoneを呼ぶ', async () => {
    const reader = createMockReader([
      'data: {"type":"text"}\n\n',
    ]);
    const onDone = vi.fn();

    await readSSEStream(reader, vi.fn(), onDone);

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('readSSEStream - idle timeout', () => {
  function createHangingMockReader(): ReadableStreamDefaultReader<Uint8Array> {
    return {
      read: vi.fn(() => new Promise(() => {})),
      cancel: vi.fn(),
      releaseLock: vi.fn(),
      closed: Promise.resolve(undefined),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;
  }

  it('指定時間データが来なければSSEIdleTimeoutErrorをthrowする', async () => {
    const reader = createHangingMockReader();

    await expect(
      readSSEStream(reader, vi.fn(), undefined, 100)
    ).rejects.toThrow(SSEIdleTimeoutError);
  });

  it('idleTimeoutMsがundefinedのときはタイムアウトしない', async () => {
    const reader = createMockReader([
      'data: {"ok":true}\n\n',
    ]);
    const onEvent = vi.fn();

    await readSSEStream(reader, onEvent, undefined, undefined);

    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('初回イベント受信後はタイムアウトしない', async () => {
    let callCount = 0;
    const reader = {
      read: vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          // 初回: すぐにイベントを返す
          return { done: false, value: encode('data: {"type":"text"}\n\n') };
        }
        if (callCount === 2) {
          // 2回目: 200ms待ってから返す（タイムアウト100msを超えるが、初回受信済みなので問題なし）
          await new Promise(resolve => setTimeout(resolve, 200));
          return { done: false, value: encode('data: {"type":"done"}\n\n') };
        }
        return { done: true, value: undefined };
      }),
      cancel: vi.fn(),
      releaseLock: vi.fn(),
      closed: Promise.resolve(undefined),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;

    const onEvent = vi.fn();
    // タイムアウト100msだが、初回イベント後は無効化されるので200ms待ちでもOK
    await readSSEStream(reader, onEvent, undefined, 100);

    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it('SSEIdleTimeoutErrorのプロパティが正しい', () => {
    const error = new SSEIdleTimeoutError(10000);
    expect(error.name).toBe('SSEIdleTimeoutError');
    expect(error.message).toContain('10000');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('base64ToBlob', () => {
  it('Base64文字列を正しくBlobに変換する', () => {
    // "Hello" のBase64
    const base64 = btoa('Hello');
    const blob = base64ToBlob(base64, 'text/plain');

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(5);
    expect(blob.type).toBe('text/plain');
  });

  it('空のBase64を処理できる', () => {
    const blob = base64ToBlob('', 'application/pdf');

    expect(blob.size).toBe(0);
    expect(blob.type).toBe('application/pdf');
  });
});
