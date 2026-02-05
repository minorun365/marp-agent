import { useState, useRef, useEffect } from 'react';
import { invokeAgent, invokeAgentMock } from '../../hooks/useAgentCore';
import { MESSAGES, getWebSearchStatus, getShareMessage, useMock } from './constants';
import type { ModelType, Message, ChatProps } from './types';
import { useTipRotation } from './hooks/useTipRotation';
import { useStreamingText } from './hooks/useStreamingText';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';

export function Chat({ onMarkdownGenerated, currentMarkdown, inputRef, editPromptTrigger, sharePromptTrigger, sessionId }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [modelType, setModelType] = useState<ModelType>('claude');
  const initializedRef = useRef(false);

  const { startTipRotation, stopTipRotation } = useTipRotation();
  const { streamText } = useStreamingText();

  // 初期メッセージをストリーミング表示
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    streamText(MESSAGES.INITIAL, setMessages);
  }, [streamText]);

  // 修正依頼ボタンが押されたときのストリーミングメッセージ
  useEffect(() => {
    if (!editPromptTrigger || editPromptTrigger === 0) return;

    // 既存の「どのように修正しますか？」メッセージを削除してから追加
    setMessages(prev =>
      prev.filter(msg => !(msg.role === 'assistant' && msg.content === MESSAGES.EDIT_PROMPT))
    );
    streamText(MESSAGES.EDIT_PROMPT, setMessages);
  }, [editPromptTrigger, streamText]);

  // シェアボタンが押されたときにエージェントにシェアリクエストを自動送信
  useEffect(() => {
    if (!sharePromptTrigger || sharePromptTrigger === 0 || isLoading) return;

    const sendShareRequest = async () => {
      setIsLoading(true);

      // アシスタントメッセージを追加（ストリーミング用）
      setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }]);

      try {
        const invoke = useMock ? invokeAgentMock : invokeAgent;

        await invoke('今回の体験をXでシェアするURLを提案してください（無言でツール使用開始すること）', currentMarkdown, {
          onText: (text) => {
            setMessages(prev =>
              prev.map((msg, idx) =>
                idx === prev.length - 1 && msg.role === 'assistant' && !msg.isStatus
                  ? { ...msg, content: msg.content + text }
                  : msg
              )
            );
          },
          onStatus: () => {},
          onToolUse: (toolName) => {
            // ストリーミングカーソルを消す
            setMessages(prev =>
              prev.map(msg =>
                msg.isStreaming ? { ...msg, isStreaming: false } : msg
              )
            );

            if (toolName === 'generate_tweet_url') {
              setMessages(prev => {
                const hasExisting = prev.some(
                  msg => msg.isStatus && msg.statusText === MESSAGES.TWEET_GENERATING
                );
                if (hasExisting) return prev;
                return [
                  ...prev,
                  { role: 'assistant', content: '', isStatus: true, statusText: MESSAGES.TWEET_GENERATING }
                ];
              });
            }
          },
          onMarkdown: () => {},
          onTweetUrl: (url) => {
            // ツイートURLステータスを完了に更新し、リンクメッセージを追加
            setMessages(prev => {
              const updated = prev.map(msg =>
                msg.isStatus && msg.statusText === MESSAGES.TWEET_GENERATING
                  ? { ...msg, statusText: MESSAGES.TWEET_COMPLETED }
                  : msg
              );
              return [
                ...updated,
                { role: 'assistant', content: getShareMessage(url) }
              ];
            });
          },
          onError: (error) => {
            console.error('Share error:', error);
          },
          onComplete: () => {
            setMessages(prev =>
              prev.map(msg => {
                if (msg.isStreaming) {
                  return { ...msg, isStreaming: false };
                }
                if (msg.isStatus && msg.statusText === MESSAGES.TWEET_GENERATING) {
                  return { ...msg, statusText: MESSAGES.TWEET_COMPLETED };
                }
                return msg;
              })
            );
          },
        }, sessionId, modelType);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    sendShareRequest();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharePromptTrigger, modelType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    setStatus('考え中...');

    // アシスタントメッセージを追加（ストリーミング用）
    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }]);

    try {
      const invoke = useMock ? invokeAgentMock : invokeAgent;

      await invoke(userMessage, currentMarkdown, {
        onText: (text) => {
          setStatus(''); // テキストが来たらステータスを消す
          setMessages(prev => {
            // テキストが来たら進行中のWeb検索ステータスを完了にする
            const msgs = prev.map(msg =>
              msg.isStatus && msg.statusText?.startsWith(MESSAGES.WEB_SEARCH_PREFIX)
                ? { ...msg, statusText: MESSAGES.WEB_SEARCH_COMPLETED }
                : msg
            );
            // 最後のステータスメッセージと最後の非ステータスアシスタントメッセージのインデックスを探す
            let lastStatusIdx = -1;
            let lastTextAssistantIdx = -1;
            for (let i = msgs.length - 1; i >= 0; i--) {
              if (msgs[i].isStatus && lastStatusIdx === -1) {
                lastStatusIdx = i;
              }
              if (msgs[i].role === 'assistant' && !msgs[i].isStatus && lastTextAssistantIdx === -1) {
                lastTextAssistantIdx = i;
              }
            }
            // ステータスがあり、その後にテキストメッセージがない場合は新しいメッセージを追加
            if (lastStatusIdx !== -1 && (lastTextAssistantIdx === -1 || lastTextAssistantIdx < lastStatusIdx)) {
              return [...msgs, { role: 'assistant', content: text, isStreaming: true }];
            }
            // そうでなければ、最後の非ステータスアシスタントメッセージにテキストを追加
            if (lastTextAssistantIdx !== -1) {
              return msgs.map((msg, idx) =>
                idx === lastTextAssistantIdx ? { ...msg, content: msg.content + text } : msg
              );
            }
            // どちらもなければ新しいメッセージを追加
            return [...msgs, { role: 'assistant', content: text, isStreaming: true }];
          });
        },
        onStatus: (newStatus) => {
          setStatus(newStatus);
        },
        onToolUse: (toolName, query) => {
          // ツール使用開始時にストリーミングカーソルを消す
          setMessages(prev =>
            prev.map(msg =>
              msg.isStreaming ? { ...msg, isStreaming: false } : msg
            )
          );

          if (toolName === 'output_slide') {
            setMessages(prev => {
              const hasExisting = prev.some(
                msg => msg.isStatus && msg.statusText?.startsWith(MESSAGES.SLIDE_GENERATING_PREFIX)
              );
              if (hasExisting) return prev;

              // Web検索中を完了に更新
              const updated = prev.map(msg =>
                msg.isStatus && msg.statusText?.startsWith(MESSAGES.WEB_SEARCH_PREFIX)
                  ? { ...msg, statusText: MESSAGES.WEB_SEARCH_COMPLETED }
                  : msg
              );
              return [
                ...updated,
                { role: 'assistant', content: '', isStatus: true, statusText: MESSAGES.SLIDE_GENERATING, tipIndex: undefined }
              ];
            });

            // 豆知識ローテーション開始
            startTipRotation(setMessages);
          } else if (toolName === 'web_search') {
            const searchStatus = getWebSearchStatus(query);
            setMessages(prev => {
              const hasInProgress = prev.some(
                msg => msg.isStatus && msg.statusText === searchStatus
              );
              if (hasInProgress) return prev;

              const filtered = prev.filter(
                msg => !(msg.isStatus && msg.statusText?.startsWith(MESSAGES.WEB_SEARCH_PREFIX) && msg.statusText !== MESSAGES.WEB_SEARCH_COMPLETED)
              );
              return [
                ...filtered,
                { role: 'assistant', content: '', isStatus: true, statusText: searchStatus }
              ];
            });
          }
        },
        onMarkdown: (markdown) => {
          onMarkdownGenerated(markdown);
          stopTipRotation();
          // output_slideのステータスを完了状態に更新
          setMessages(prev =>
            prev.map(msg =>
              msg.isStatus && msg.statusText?.startsWith(MESSAGES.SLIDE_GENERATING_PREFIX)
                ? { ...msg, statusText: MESSAGES.SLIDE_COMPLETED, tipIndex: undefined }
                : msg
            )
          );
        },
        onError: (error) => {
          console.error('Agent error:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          const isModelNotAvailable = errorMessage.includes('model identifier is invalid');
          const displayMessage = isModelNotAvailable ? MESSAGES.ERROR_MODEL_NOT_AVAILABLE : MESSAGES.ERROR;

          // ステータスメッセージを削除してエラーメッセージをストリーミング表示
          streamText(displayMessage, setMessages, {
            filterPredicate: (msg) => !!msg.isStatus,
          }).then(() => {
            setIsLoading(false);
            setStatus('');
          });
        },
        onComplete: () => {
          // Web検索のステータスも完了に更新
          setMessages(prev =>
            prev.map(msg =>
              msg.isStatus && msg.statusText?.startsWith(MESSAGES.WEB_SEARCH_PREFIX)
                ? { ...msg, statusText: MESSAGES.WEB_SEARCH_COMPLETED }
                : msg
            )
          );
        },
      }, sessionId, modelType);

      // ストリーミング完了
      setMessages(prev =>
        prev.map(msg =>
          msg.role === 'assistant' && msg.isStreaming
            ? { ...msg, isStreaming: false }
            : msg
        )
      );
    } catch (error) {
      console.error('Error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isModelNotAvailable = errorMessage.includes('model identifier is invalid');
      const displayMessage = isModelNotAvailable ? MESSAGES.ERROR_MODEL_NOT_AVAILABLE : MESSAGES.ERROR;

      // ステータスメッセージを削除し、エラーメッセージを表示
      setMessages(prev => {
        const filtered = prev.filter(msg => !msg.isStatus);
        const lastAssistantIdx = filtered.findIndex((msg, idx) =>
          idx === filtered.length - 1 && msg.role === 'assistant'
        );
        if (lastAssistantIdx !== -1) {
          return filtered.map((msg, idx) =>
            idx === lastAssistantIdx
              ? { ...msg, content: displayMessage, isStreaming: false }
              : msg
          );
        } else {
          return [...filtered, { role: 'assistant' as const, content: displayMessage, isStreaming: false }];
        }
      });
    } finally {
      setIsLoading(false);
      setStatus('');
      stopTipRotation();
      // 確実に全てのストリーミング状態を解除
      setMessages(prev =>
        prev.map(msg =>
          msg.isStreaming ? { ...msg, isStreaming: false } : msg
        )
      );
    }
  };

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
