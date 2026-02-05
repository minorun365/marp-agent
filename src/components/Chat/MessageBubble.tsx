import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Message } from './types';

interface MessageBubbleProps {
  message: Message;
  showStatus?: boolean;
  status?: string;
}

export const MessageBubble = memo(function MessageBubble({ message, showStatus, status }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser
            ? 'bg-kag-gradient text-white'
            : 'bg-gray-100 text-gray-800'
        }`}
      >
        {showStatus ? (
          <span className="text-sm shimmer-text font-medium">{status}</span>
        ) : message.role === 'assistant' ? (
          <div className="text-sm prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
            <ReactMarkdown
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {message.content + (message.isStreaming ? ' ▌' : '')}
            </ReactMarkdown>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-sm">
            {message.content}
          </pre>
        )}
      </div>
    </div>
  );
});
