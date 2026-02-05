import { useCallback } from 'react';
import type { Message } from '../types';

interface UseStreamingTextReturn {
  streamText: (
    text: string,
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
    options?: {
      delay?: number;
      appendToLast?: boolean;
      filterPredicate?: (msg: Message) => boolean;
    }
  ) => Promise<void>;
}

export function useStreamingText(): UseStreamingTextReturn {
  const streamText = useCallback(async (
    text: string,
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
    options?: {
      delay?: number;
      appendToLast?: boolean;
      filterPredicate?: (msg: Message) => boolean;
    }
  ) => {
    const delay = options?.delay ?? 30;
    const appendToLast = options?.appendToLast ?? false;

    if (!appendToLast) {
      // 新しいメッセージを追加
      setMessages(prev => {
        let filtered = prev;
        if (options?.filterPredicate) {
          filtered = prev.filter(msg => !options.filterPredicate!(msg));
        }
        return [...filtered, { role: 'assistant', content: '', isStreaming: true }];
      });
    }

    // 1文字ずつ表示
    // 注意: isStreamingチェックを削除（finallyブロックで先にfalseにされるため）
    for (const char of text) {
      await new Promise(resolve => setTimeout(resolve, delay));
      setMessages(prev =>
        prev.map((msg, idx) =>
          idx === prev.length - 1 && msg.role === 'assistant'
            ? { ...msg, content: msg.content + char }
            : msg
        )
      );
    }

    // ストリーミング完了
    setMessages(prev =>
      prev.map((msg, idx) =>
        idx === prev.length - 1 && msg.role === 'assistant'
          ? { ...msg, isStreaming: false }
          : msg
      )
    );
  }, []);

  return { streamText };
}
