import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../constants';
import { createMessage } from '../types';
import { appendSlideProgress, applyToolUse } from './useChatMessages';

describe('appendSlideProgress', () => {
  it('作成中表示を完了させてから検査結果を会話へ追加する', () => {
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

    expect(result[0].statusText).toBe(MESSAGES.SLIDE_CHECK_COMPLETED);
    expect(result[0].tipIndex).toBeUndefined();
    expect(result[1].isStreaming).toBe(false);
    expect(result[2]).toMatchObject({
      role: 'assistant',
      content: progress,
    });
    expect(result[2].isStatus).toBeUndefined();
  });
});

describe('applyToolUse', () => {
  it('Web取得を完了させてからスライド生成を開始する', () => {
    const searching = applyToolUse([], 'web_search', 'Claude Code');
    const fetching = applyToolUse(searching, 'http_request', 'https://example.com');
    const generating = applyToolUse(fetching, 'output_slide');

    expect(generating.map(message => message.statusText)).toEqual([
      MESSAGES.WEB_SEARCH_COMPLETED,
      MESSAGES.WEB_FETCH_COMPLETED,
      MESSAGES.SLIDE_GENERATING,
    ]);
  });

  it('検査結果の吹き出しの後へ再生成ステータスを追加する', () => {
    const firstAttempt = applyToolUse([], 'output_slide');
    const progress = 'はみ出しを検出しました。調整して再チェックします。';
    const checked = appendSlideProgress(firstAttempt, progress);
    const retrying = applyToolUse(checked, 'output_slide');

    expect(retrying.map(message => message.statusText ?? message.content)).toEqual([
      MESSAGES.SLIDE_CHECK_COMPLETED,
      progress,
      MESSAGES.SLIDE_GENERATING,
    ]);
  });

  it('Kimiから同じtool_useが複数回届いても作成中表示を重複させない', () => {
    const first = applyToolUse([], 'output_slide');
    const duplicate = applyToolUse(first, 'output_slide');

    expect(duplicate.filter(message => message.statusText === MESSAGES.SLIDE_GENERATING)).toHaveLength(1);
  });
});
