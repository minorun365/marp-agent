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
    const progress = '文字や表のはみ出しを検知したので、スライドを修正します';

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

  it('検査結果の直後に修正中ステータスを立てて無言の間を作らない', () => {
    const messages = [
      createMessage({
        role: 'assistant',
        content: '',
        isStatus: true,
        statusText: MESSAGES.SLIDE_GENERATING,
      }),
    ];

    const result = appendSlideProgress(messages, '文字や表のはみ出しを検知したので、スライドを修正します');

    expect(result[result.length - 1]).toMatchObject({
      isStatus: true,
      statusText: MESSAGES.SLIDE_FIXING,
    });
  });
});

describe('applyToolUse', () => {
  it('URL無しの通知に続いてURL付きが届いても取得の行を増やさない', () => {
    // Kimiはツールの引数を分割して流すため、URLが埋まる前の通知が先に届く
    const partial = applyToolUse([], 'http_request');
    const full = applyToolUse(partial, 'http_request', 'https://example.com/article');
    const generating = applyToolUse(full, 'output_slide');

    expect(generating.map(message => message.statusText)).toEqual([
      MESSAGES.WEB_FETCH_COMPLETED,
      MESSAGES.SLIDE_GENERATING,
    ]);
  });

  it('途中まで届いたURLが伸びても取得の行を増やさない', () => {
    const partial = applyToolUse([], 'http_request', 'https://example.com/art');
    const full = applyToolUse(partial, 'http_request', 'https://example.com/article');

    expect(full).toHaveLength(1);
    expect(full[0].statusText).toContain('https://example.com/article');
  });

  it('別のURLなら取得の行を分けて立てる', () => {
    const first = applyToolUse([], 'http_request', 'https://example.com/a');
    const second = applyToolUse(first, 'http_request', 'https://example.org/b');

    expect(second).toHaveLength(2);
  });

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
    const progress = '文字や表のはみ出しを検知したので、スライドを修正します';
    const checked = appendSlideProgress(firstAttempt, progress);
    const retrying = applyToolUse(checked, 'output_slide');

    // 修正中ステータスは検査結果の直後に立っているので、2回目のoutput_slideでは
    // 新しい作成中ステータスを重ねず、そのまま回し続ける
    expect(retrying.map(message => message.statusText ?? message.content)).toEqual([
      MESSAGES.SLIDE_CHECK_COMPLETED,
      progress,
      MESSAGES.SLIDE_FIXING,
    ]);
  });

  it('Kimiから同じtool_useが複数回届いても作成中表示を重複させない', () => {
    const first = applyToolUse([], 'output_slide');
    const duplicate = applyToolUse(first, 'output_slide');

    expect(duplicate.filter(message => message.statusText === MESSAGES.SLIDE_GENERATING)).toHaveLength(1);
  });
});
