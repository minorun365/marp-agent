import { TIPS, MESSAGES } from './constants';
import type { Message } from './types';

interface StatusMessageProps {
  message: Message;
  index: number;
}

export function StatusMessage({ message, index }: StatusMessageProps) {
  const isSlideGenerating = message.statusText?.startsWith(MESSAGES.SLIDE_GENERATING_PREFIX);
  const isWebSearching = message.statusText?.startsWith(MESSAGES.WEB_SEARCH_PREFIX) && message.statusText !== MESSAGES.WEB_SEARCH_COMPLETED;
  const currentTip = isSlideGenerating && message.tipIndex !== undefined ? TIPS[message.tipIndex] : null;

  const isCompleted = message.statusText === MESSAGES.SLIDE_COMPLETED ||
    message.statusText === MESSAGES.WEB_SEARCH_COMPLETED ||
    message.statusText === MESSAGES.TWEET_COMPLETED;

  return (
    <div key={isWebSearching ? `web-search-${message.statusText}` : index} className="flex justify-start">
      <div className={`bg-blue-50 text-blue-700 rounded-lg px-4 py-2 border border-blue-200 ${isWebSearching ? 'animate-fade-in' : ''}`}>
        <span className="text-sm flex items-center gap-2">
          {isCompleted ? (
            <span className="text-green-600">&#10003;</span>
          ) : (
            <span className="animate-spin">&#9696;</span>
          )}
          {message.statusText}
        </span>
        {currentTip && (
          <p
            key={message.tipIndex}
            className="text-xs text-gray-400 mt-2 animate-fade-in"
          >
            Tips: {currentTip}
          </p>
        )}
      </div>
    </div>
  );
}
