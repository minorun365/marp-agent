import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormEvent } from 'react';
import type { AgentCoreCallbacks } from '../../../hooks/useAgentCore';
import { MESSAGES } from '../constants';
import { useChatMessages } from './useChatMessages';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../../hooks/useAgentCore', () => ({ invokeAgent: invoke, invokeAgentMock: invoke }));

describe('スライド生成の終了判定', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invoke.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function setup() {
    const onMarkdownGenerated = vi.fn();
    const hook = renderHook(() => useChatMessages({ onMarkdownGenerated, currentMarkdown: '' }));
    await act(async () => { await vi.runAllTimersAsync(); });
    const submit = async () => {
      act(() => hook.result.current.setInput('https://example.com/blog'));
      await act(async () => { await hook.result.current.handleSubmit({ preventDefault() {} } as FormEvent); });
      await act(async () => { await vi.runAllTimersAsync(); });
    };
    return { ...hook, submit, onMarkdownGenerated };
  }

  it.each(['done', 'eof', 'error', 'empty-markdown'])('%sで未完成なら成功表示を出さない', async ending => {
    invoke.mockImplementation(async (_prompt, _markdown, _theme, callbacks: AgentCoreCallbacks) => {
      callbacks.onToolUse?.('output_slide');
      callbacks.onSlideProgress?.('見出しを短くして修正します');
      if (ending === 'done') callbacks.onComplete?.();
      if (ending === 'error') callbacks.onError?.(new Error('generation failed'));
      if (ending === 'empty-markdown') callbacks.onMarkdown?.('   ');
    });
    const hook = await setup();
    await hook.submit();
    expect(hook.result.current.messages.some(m => m.statusText === MESSAGES.SLIDE_COMPLETED)).toBe(false);
    expect(hook.result.current.messages.filter(m => m.content === MESSAGES.ERROR)).toHaveLength(1);
    expect(hook.onMarkdownGenerated).not.toHaveBeenCalled();
    expect(hook.result.current.isLoading).toBe(false);
    hook.unmount();
  });

  it('前の依頼が成功しても、次の依頼の未完成を成功と判定しない', async () => {
    invoke.mockImplementationOnce(async (_p, _m, _t, callbacks: AgentCoreCallbacks) => {
      callbacks.onToolUse?.('output_slide');
      callbacks.onMarkdown?.('# 完成');
      callbacks.onComplete?.();
    }).mockImplementationOnce(async (_p, _m, _t, callbacks: AgentCoreCallbacks) => {
      callbacks.onToolUse?.('output_slide');
      callbacks.onComplete?.();
    });
    const hook = await setup();
    await hook.submit();
    expect(hook.result.current.messages.filter(m => m.statusText === MESSAGES.SLIDE_COMPLETED)).toHaveLength(1);
    expect(hook.onMarkdownGenerated).toHaveBeenCalledExactlyOnceWith('# 完成');
    await hook.submit();
    expect(hook.result.current.messages.filter(m => m.statusText === MESSAGES.SLIDE_COMPLETED).length).toBeLessThanOrEqual(1);
    expect(hook.result.current.messages.at(-1)?.content).toBe(MESSAGES.ERROR);
    hook.unmount();
  });

  it('通常の会話はスライドがなくてもエラーにしない', async () => {
    invoke.mockImplementation(async (_p, _m, _t, callbacks: AgentCoreCallbacks) => {
      callbacks.onText?.('どのような内容にしますか？');
      callbacks.onComplete?.();
    });
    const hook = await setup();
    await hook.submit();
    expect(hook.result.current.messages.some(m => m.content === MESSAGES.ERROR)).toBe(false);
    hook.unmount();
  });
});
