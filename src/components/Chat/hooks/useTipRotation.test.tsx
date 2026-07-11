import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MESSAGES } from '../constants';
import { createMessage } from '../types';
import type { Message } from '../types';
import { useTipRotation } from './useTipRotation';

function useTipRotationHarness() {
  const [messages, setMessages] = useState<Message[]>([
    createMessage({
      role: 'assistant',
      content: '',
      isStatus: true,
      statusText: MESSAGES.SLIDE_GENERATING,
    }),
  ]);
  const { startTipRotation, stopTipRotation } = useTipRotation();

  return { messages, setMessages, startTipRotation, stopTipRotation };
}

describe('useTipRotation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('重複するツールイベントで最初のTips表示を後ろ倒しにしない', () => {
    const { result } = renderHook(() => useTipRotationHarness());

    act(() => {
      result.current.startTipRotation(result.current.setMessages);
      vi.advanceTimersByTime(2000);
      result.current.startTipRotation(result.current.setMessages);
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.messages[0].tipIndex).toBeDefined();
  });

  it('停止後はTipsを更新しない', () => {
    const { result } = renderHook(() => useTipRotationHarness());

    act(() => {
      result.current.startTipRotation(result.current.setMessages);
      result.current.stopTipRotation();
      vi.advanceTimersByTime(8000);
    });

    expect(result.current.messages[0].tipIndex).toBeUndefined();
  });
});
