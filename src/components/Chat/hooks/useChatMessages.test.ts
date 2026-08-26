import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../constants';
import { createMessage } from '../types';
import { appendSlideProgress, applyToolUse, settleMessagesBeforeText } from './useChatMessages';

describe('settleMessagesBeforeText', () => {
  it('Grokの途中テキストが届いてもスライド修正中を完了へ変えない', () => {
    const messages = [
      createMessage({
        role: 'assistant',
        content: '',
        isStatus: true,
        statusText: MESSAGES.SLIDE_FIXING,
      }),
    ];

    const result = settleMessagesBeforeText(messages);

    expect(result[0].statusText).toBe(MESSAGES.SLIDE_FIXING);
  });

  it('途中テキストの前にWeb検索は完了へ切り替える', () => {
    const messages = applyToolUse([], 'web_search', 'MCP roadmap');

    const result = settleMessagesBeforeText(messages);

    expect(result[0].statusText).toBe('Web検索完了 "MCP roadmap"');
  });
});

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
      `${MESSAGES.WEB_FETCH_COMPLETED} https://example.com/article`,
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

    // 完了しても何を調べたかを残す。全部「Web検索完了」に潰すと、
    // 検索を6回する依頼で同じ行が6本並び、同じ通知の繰り返しに見える。
    expect(generating.map(message => message.statusText)).toEqual([
      `${MESSAGES.WEB_SEARCH_COMPLETED} "Claude Code"`,
      `${MESSAGES.WEB_FETCH_COMPLETED} https://example.com`,
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

  it('検索クエリが途中まで届いても、同じ検索は1行のまま書き換える', () => {
    // ツールの引数は分割して届く。行を足すと1回の検索が3行に見える。
    let messages = applyToolUse([], 'web_search', '御田稔 KAG');
    messages = applyToolUse(messages, 'web_search', '御田稔 KAG テックエバンジェリスト');
    messages = applyToolUse(messages, 'web_search', '御田稔 KAG テックエバンジェリスト 著書');

    const searchRows = messages.filter(
      message => message.statusText?.startsWith(MESSAGES.WEB_SEARCH_PREFIX),
    );
    expect(searchRows).toHaveLength(1);
    expect(searchRows[0].statusText).toBe('Web検索中... "御田稔 KAG テックエバンジェリスト 著書"');
  });

  it('別の検索が始まったら前の行を完了にして新しい行を立てる', () => {
    let messages = applyToolUse([], 'web_search', '御田稔 KAG');
    messages = applyToolUse(messages, 'web_search', 'KDDIアジャイル開発センター 会社概要');

    expect(messages.map(message => message.statusText)).toEqual([
      'Web検索完了 "御田稔 KAG"',
      'Web検索中... "KDDIアジャイル開発センター 会社概要"',
    ]);
  });

  // 2026-08-20の表示崩れ。検索に5秒以上かかると、バックエンドの無音検知が
  // 「スライドを作成中」を先出ししてしまう。その後で検索が再開すると、
  // 作成中の下に検索の行が積まれて順番が壊れ、検索の行は完了にならないまま
  // スライドのストリーミングと並走していた。
  it('作成中を先出しした後に検索へ戻ったら、作成中の行を取り下げて検索を最後に置く', () => {
    let messages = applyToolUse([], 'web_search', '生成AI 導入事例');
    messages = applyToolUse(messages, 'output_slide');            // 無音検知による先出し
    messages = applyToolUse(messages, 'web_search', '生成AI 市場規模');

    expect(messages.map(message => message.statusText)).toEqual([
      'Web検索完了 "生成AI 導入事例"',
      'Web検索中... "生成AI 市場規模"',
    ]);
    expect(
      messages.some(message => message.statusText === MESSAGES.SLIDE_GENERATING),
    ).toBe(false);
  });

  it('作成中を先出しした後にページ取得へ戻っても同じように取り下げる', () => {
    let messages = applyToolUse([], 'output_slide');
    messages = applyToolUse(messages, 'http_request', 'https://example.com/article');

    expect(messages.map(message => message.statusText)).toEqual([
      'Webページを読み込み中... https://example.com/article',
    ]);
  });

  it('検索が終わって本当に作成へ進んだら、作成中の行は1本だけ立つ', () => {
    let messages = applyToolUse([], 'web_search', '生成AI 導入事例');
    messages = applyToolUse(messages, 'output_slide');

    expect(messages.map(message => message.statusText)).toEqual([
      'Web検索完了 "生成AI 導入事例"',
      MESSAGES.SLIDE_GENERATING,
    ]);
  });

  it('スライドの修正中は、検索へ戻っても取り下げない（Kimiのはみ出し修正待ち）', () => {
    const messages = applyToolUse(
      [
        createMessage({
          role: 'assistant',
          content: '',
          isStatus: true,
          statusText: MESSAGES.SLIDE_FIXING,
        }),
      ],
      'web_search',
      '生成AI 市場規模',
    );

    expect(messages.map(message => message.statusText)).toEqual([
      MESSAGES.SLIDE_FIXING,
      'Web検索中... "生成AI 市場規模"',
    ]);
  });
});
