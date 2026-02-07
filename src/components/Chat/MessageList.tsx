import { useRef, useEffect } from 'react';
import { MESSAGES } from './constants';
import type { Message } from './types';
import { StatusMessage } from './StatusMessage';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: Message[];
  status: string;
}

export function MessageList({ messages, status }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* 一時的なお知らせバナー（不要になったら削除） */}
        {/* <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-yellow-700 text-sm">
          ⚠️ 現在、Claude Opus 4.6モデルは人気のため応答に時間がかかる場合があります。お急ぎの方は別のモデルをお試しください！
        </div> */}

        {/* 空状態 */}
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-8">
            <p className="text-lg">{MESSAGES.EMPTY_STATE_TITLE}</p>
            <p className="text-sm mt-2">{MESSAGES.EMPTY_STATE_EXAMPLE}</p>
          </div>
        )}

        {/* メッセージ一覧 */}
        {messages.map((message, index) => {
          const isLastAssistant = message.role === 'assistant' && index === messages.length - 1;
          const showStatus = isLastAssistant && !message.content && !message.isStatus && status;

          // 空のアシスタントメッセージはスキップ（ステータス表示中を除く）
          if (message.role === 'assistant' && !message.isStatus && !message.content.trim() && !showStatus) {
            return null;
          }

          // ステータスメッセージの場合
          if (message.isStatus) {
            return <StatusMessage key={message.id} message={message} index={index} />;
          }

          return (
            <MessageBubble
              key={message.id}
              message={message}
              showStatus={!!showStatus}
              status={status}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
