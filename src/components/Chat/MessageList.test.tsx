import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { MessageList } from './MessageList';
import { MESSAGES } from './constants';
import { appendSlideProgress, applyToolUse } from './hooks/useChatMessages';

const PROGRESS = '文字や表のはみ出しを検知したので、スライドを修正します';

// jsdomにscrollIntoViewが無いため、自動スクロールだけ差し替える
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe('はみ出し検知後の画面表示', () => {
  it('検知メッセージを出した後もスピナー付きのステータスが残る', () => {
    const generating = applyToolUse([], 'output_slide');
    const progressed = appendSlideProgress(generating, PROGRESS);

    const { container } = render(<MessageList messages={progressed} status="" />);

    // Kimiが修正版を作り直している間、画面が無言にならないこと
    const active = container.querySelectorAll('[data-chat-status="active"]');
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toContain(MESSAGES.SLIDE_FIXING);

    // 検査済みの表示はチェック付きで残る
    const completed = container.querySelectorAll('[data-chat-status="completed"]');
    expect(completed).toHaveLength(1);
    expect(completed[0].textContent).toContain(MESSAGES.SLIDE_CHECK_COMPLETED);
  });

  it('修正版のoutput_slideが届いてもステータスは1つのまま', () => {
    const generating = applyToolUse([], 'output_slide');
    const progressed = appendSlideProgress(generating, PROGRESS);
    const retrying = applyToolUse(progressed, 'output_slide');

    const { container } = render(<MessageList messages={retrying} status="" />);

    expect(container.querySelectorAll('[data-chat-status="active"]')).toHaveLength(1);
  });
});
