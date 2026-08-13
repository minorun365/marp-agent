import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../constants';
import { createMessage } from '../types';
import { appendSlideProgress } from './useChatMessages';

describe('appendSlideProgress', () => {
  it('作成中表示を残したまま検査結果を会話へ追加する', () => {
    const messages = [
      createMessage({
        role: 'assistant',
        content: '',
        isStatus: true,
        statusText: MESSAGES.SLIDE_GENERATING,
      }),
      createMessage({ role: 'assistant', content: '', isStreaming: true }),
    ];
    const progress = '1回目の確認で、文字や表のはみ出しを検出しました。内容を調整して再チェックします。';

    const result = appendSlideProgress(messages, progress);

    expect(result[0].statusText).toBe(MESSAGES.SLIDE_GENERATING);
    expect(result[1].isStreaming).toBe(false);
    expect(result[2]).toMatchObject({
      role: 'assistant',
      content: progress,
    });
    expect(result[2].isStatus).toBeUndefined();
  });
});
