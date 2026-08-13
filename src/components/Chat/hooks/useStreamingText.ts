import { useCallback } from 'react';
import type { Message } from '../types';
import { createMessage } from '../types';

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
    let targetMessageId: string | undefined;

    if (!appendToLast) {
      // 新しいメッセージを追加
      const targetMessage = createMessage({ role: 'assistant', content: '', isStreaming: true });
      targetMessageId = targetMessage.id;
      setMessages(prev => {
        let filtered = prev;
        if (options?.filterPredicate) {
          filtered = prev.filter(msg => !options.filterPredicate!(msg));
        }
        return [...filtered, targetMessage];
      });
    }

    // 1文字ずつ表示
    // 注意: isStreamingチェックを削除（finallyブロックで先にfalseにされるため）
    for (const char of text) {
      await new Promise(resolve => setTimeout(resolve, delay));
      setMessages(prev =>
        prev.map((msg, idx) =>
          (targetMessageId ? msg.id === targetMessageId : idx === prev.length - 1 && msg.role === 'assistant')
            ? { ...msg, content: msg.content + char }
            : msg
        )
      );
    }

    // ストリーミング完了
    setMessages(prev =>
      prev.map((msg, idx) =>
        (targetMessageId ? msg.id === targetMessageId : idx === prev.length - 1 && msg.role === 'assistant')
          ? { ...msg, isStreaming: false }
          : msg
      )
    );
  }, []);

  return { streamText };
}
