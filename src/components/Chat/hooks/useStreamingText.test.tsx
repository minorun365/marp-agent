import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Message } from '../types';
import { createMessage } from '../types';
import { useStreamingText } from './useStreamingText';

describe('useStreamingText', () => {
  it('途中で別のメッセージが追加されても開始時の吹き出しへ書き続ける', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useStreamingText());
    let messages: Message[] = [];
    const setMessages: React.Dispatch<React.SetStateAction<Message[]>> = update => {
      messages = typeof update === 'function' ? update(messages) : update;
    };

    let streamPromise: Promise<void>;
    act(() => {
      streamPromise = result.current.streamText('案内', setMessages, { delay: 10 });
    });
    const initialMessageId = messages[0].id;
    messages = [...messages, createMessage({ role: 'user', content: 'すぐに送信' })];

    await act(async () => {
      await vi.runAllTimersAsync();
      await streamPromise!;
    });

    expect(messages.find(message => message.id === initialMessageId)).toMatchObject({
      content: '案内',
      isStreaming: false,
    });
    expect(messages.at(-1)).toMatchObject({ role: 'user', content: 'すぐに送信' });
    vi.useRealTimers();
  });
});
