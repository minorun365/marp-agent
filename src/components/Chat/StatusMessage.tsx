import { TIPS, MESSAGES, isSlideInProgressStatus, isCompletedWebStatus } from './constants';
import type { Message } from './types';

interface StatusMessageProps {
  message: Message;
  index: number;
}

export function StatusMessage({ message, index }: StatusMessageProps) {
  const isSlideGenerating = isSlideInProgressStatus(message.statusText);
  const isWebSearching = message.statusText?.startsWith(MESSAGES.WEB_SEARCH_PREFIX) && !isCompletedWebStatus(message.statusText);
  const isWebFetching = message.statusText?.startsWith(MESSAGES.WEB_FETCH_PREFIX) && !isCompletedWebStatus(message.statusText);
  const currentTip = isSlideGenerating && message.tipIndex !== undefined ? TIPS[message.tipIndex] : null;

  const isCompleted = message.statusText === MESSAGES.SLIDE_CHECK_COMPLETED ||
    message.statusText === MESSAGES.SLIDE_COMPLETED ||
    isCompletedWebStatus(message.statusText) ||
    message.statusText === MESSAGES.TWEET_COMPLETED;

  return (
    <div
      key={isWebSearching || isWebFetching ? `web-${message.statusText}` : index}
      className="flex justify-start"
      data-chat-status={isCompleted ? 'completed' : 'active'}
    >
      <div className={`bg-blue-50 text-blue-700 rounded-lg px-4 py-2 border border-blue-200 ${isWebSearching || isWebFetching ? 'animate-fade-in' : ''}`}>
        <span className="text-sm flex items-center gap-2">
          {isCompleted ? (
            <span className="text-green-600">&#10003;</span>
          ) : (
            <span className="inline-block shrink-0 w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
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
