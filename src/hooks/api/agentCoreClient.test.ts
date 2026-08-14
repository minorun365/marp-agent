// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAuthSession } from 'aws-amplify/auth';
import { setRuntimeConfig } from '../../runtimeConfig';
import { handleEvent, invokeAgent, type AgentCoreCallbacks } from './agentCoreClient';

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn(),
}));

function createCallbacks(): AgentCoreCallbacks {
  return {
    onText: vi.fn(),
    onSlideProgress: vi.fn(),
    onStatus: vi.fn(),
    onMarkdown: vi.fn(),
    onToolUse: vi.fn(),
    onError: vi.fn(),
    onComplete: vi.fn(),
  };
}

describe('handleEvent', () => {
  it('スライド検査の進捗を通常テキストと分けて通知する', () => {
    const callbacks = createCallbacks();
    const message = '1回目の確認で、文字や表のはみ出しを検出しました。内容を調整して再チェックします。';

    handleEvent({ type: 'slide_progress', data: message }, callbacks);

    expect(callbacks.onSlideProgress).toHaveBeenCalledWith(message);
    expect(callbacks.onText).not.toHaveBeenCalled();
    expect(callbacks.onComplete).not.toHaveBeenCalled();
  });
});

describe('invokeAgent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setRuntimeConfig({
      auth: {
        region: 'us-east-1',
        userPoolId: 'us-east-1_example',
        userPoolClientId: 'example-client',
      },
      agent: {
        runtimeArn: 'arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/example',
        protocol: 'HTTP',
      },
      environment: 'test',
    });
  });

  it('AgentCoreが古いJWTを拒否したら強制更新して1回だけ再送する', async () => {
    const staleToken = { toString: () => 'stale-token' };
    const freshToken = { toString: () => 'fresh-token' };
    vi.mocked(fetchAuthSession)
      .mockResolvedValueOnce({ tokens: { accessToken: staleToken } } as never)
      .mockResolvedValueOnce({ tokens: { accessToken: freshToken } } as never);

    const cancel = vi.fn().mockResolvedValue(undefined);
    const reader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: [DONE]\n\n') })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        body: { cancel },
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: { getReader: () => reader },
      } as never);
    const callbacks = createCallbacks();

    await invokeAgent('テスト', '', 'border', callbacks, '12345678-1234-1234-1234-123456789012');

    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchAuthSession).toHaveBeenNthCalledWith(1);
    expect(fetchAuthSession).toHaveBeenNthCalledWith(2, { forceRefresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer stale-token' }),
    });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
    });
    expect(callbacks.onComplete).toHaveBeenCalledOnce();
  });
});
