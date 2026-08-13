// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { handleEvent, type AgentCoreCallbacks } from './agentCoreClient';

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
