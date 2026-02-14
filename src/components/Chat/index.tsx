import type { ChatProps } from './types';
import { useChatMessages } from './hooks/useChatMessages';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';

export function Chat({ onMarkdownGenerated, currentMarkdown, inputRef, editPromptTrigger, sharePromptTrigger, sessionId, theme }: ChatProps) {
  const {
    messages,
    input,
    setInput,
    isLoading,
    status,
    modelType,
    setModelType,
    handleSubmit,
  } = useChatMessages({
    onMarkdownGenerated,
    currentMarkdown,
    editPromptTrigger,
    sharePromptTrigger,
    sessionId,
    theme,
  });

  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages} status={status} />
      <ChatInput
        input={input}
        setInput={setInput}
        modelType={modelType}
        setModelType={setModelType}
        isLoading={isLoading}
        hasUserMessage={messages.some(m => m.role === 'user')}
        inputRef={inputRef}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

// 後方互換性のため型もエクスポート
export type { ModelType, Message, ChatProps } from './types';
