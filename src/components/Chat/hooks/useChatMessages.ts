import { useState, useRef, useEffect, useCallback } from 'react';
import { invokeAgent, invokeAgentMock } from '../../../hooks/useAgentCore';
import { SSEIdleTimeoutError } from '../../../hooks/streaming/sseParser';
import { MESSAGES, getWebSearchStatus, getWebFetchStatus, getShareMessage, useMock } from '../constants';
import type { ModelType, Message, ReferenceFile } from '../types';
import { createMessage } from '../types';
import { useTipRotation } from './useTipRotation';
import { useStreamingText } from './useStreamingText';

interface UseChatMessagesProps {
  onMarkdownGenerated: (markdown: string) => void;
  currentMarkdown: string;
  editPromptTrigger?: number;
  sharePromptTrigger?: number;
  sessionId?: string;
  theme?: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function useChatMessages({
  onMarkdownGenerated,
  currentMarkdown,
  editPromptTrigger,
  sharePromptTrigger,
  sessionId,
  theme = 'border',
}: UseChatMessagesProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [modelType, setModelType] = useState<ModelType>('sonnet');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
      setMessages(prev => [...prev, createMessage({ role: 'assistant', content: '', isStreaming: true })]);

      try {
        const invoke = useMock ? invokeAgentMock : invokeAgent;

        await invoke('今回の体験をXでシェアするURLを提案してください（無言でツール使用開始すること）', currentMarkdown, theme, {
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
                  createMessage({ role: 'assistant', content: '', isStatus: true, statusText: MESSAGES.TWEET_GENERATING }),
                ];
              });
            }
          },
          onMarkdown: () => {},
          onTweetUrl: (url) => {
            setMessages(prev => {
              const updated = prev.map(msg =>
                msg.isStatus && msg.statusText === MESSAGES.TWEET_GENERATING
                  ? { ...msg, statusText: MESSAGES.TWEET_COMPLETED }
                  : msg
              );
              return [
                ...updated,
                createMessage({ role: 'assistant', content: getShareMessage(url) }),
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

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const hasText = input.trim().length > 0;
    const hasFile = !!selectedFile;
    if ((!hasText && !hasFile) || isLoading) return;

    const userMessage = input.trim() || 'この参考資料をもとにスライドを作成してください';
    setInput('');

    // ファイルがある場合は表示用テキストにファイル名を含める
    const displayContent = hasFile
      ? `📄 ${selectedFile!.name}\n${userMessage}`
      : userMessage;
    setMessages(prev => [...prev, createMessage({ role: 'user', content: displayContent })]);
    setIsLoading(true);
    setStatus('考え中...');
    setMessages(prev => [...prev, createMessage({ role: 'assistant', content: '', isStreaming: true })]);

    // ファイルをBase64エンコード
    let referenceFile: ReferenceFile | undefined;
    if (hasFile) {
      try {
        setStatus('参考資料を準備中...');
        referenceFile = {
          file_name: selectedFile!.name,
          content_type: selectedFile!.type,
          base64_data: await fileToBase64(selectedFile!),
          size: selectedFile!.size,
        };
      } catch {
        setStatus('');
        setIsLoading(false);
        setMessages(prev => [
          ...prev.filter(m => !m.isStreaming),
          createMessage({ role: 'assistant', content: 'ファイルの読み込みに失敗しました。もう一度お試しください。', isStreaming: false }),
        ]);
        return;
      }
      setSelectedFile(null);
    }

    try {
      const invoke = useMock ? invokeAgentMock : invokeAgent;

      await invoke(userMessage, currentMarkdown, theme, {
        onText: (text) => {
          setStatus('');
          stopTipRotation();
          setMessages(prev => {
            const msgs = prev.map(msg => {
              if (msg.isStatus && msg.statusText?.startsWith(MESSAGES.WEB_SEARCH_PREFIX)) {
                return { ...msg, statusText: MESSAGES.WEB_SEARCH_COMPLETED };
              }
              if (msg.isStatus && msg.statusText?.startsWith(MESSAGES.WEB_FETCH_PREFIX)) {
                return { ...msg, statusText: MESSAGES.WEB_FETCH_COMPLETED };
              }
              if (msg.isStatus && msg.statusText?.startsWith(MESSAGES.SLIDE_GENERATING_PREFIX)) {
                return { ...msg, statusText: MESSAGES.SLIDE_COMPLETED, tipIndex: undefined };
              }
              return msg;
            });
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
            if (lastStatusIdx !== -1 && (lastTextAssistantIdx === -1 || lastTextAssistantIdx < lastStatusIdx)) {
              return [...msgs, createMessage({ role: 'assistant', content: text, isStreaming: true })];
            }
            if (lastTextAssistantIdx !== -1) {
              return msgs.map((msg, idx) =>
                idx === lastTextAssistantIdx ? { ...msg, content: msg.content + text } : msg
              );
            }
            return [...msgs, createMessage({ role: 'assistant', content: text, isStreaming: true })];
          });
        },
        onStatus: (newStatus) => {
          setStatus(newStatus);
        },
        onToolUse: (toolName, query) => {
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

              const updated = prev.map(msg =>
                msg.isStatus && msg.statusText?.startsWith(MESSAGES.WEB_SEARCH_PREFIX)
                  ? { ...msg, statusText: MESSAGES.WEB_SEARCH_COMPLETED }
                  : msg
              );
              return [
                ...updated,
                createMessage({ role: 'assistant', content: '', isStatus: true, statusText: MESSAGES.SLIDE_GENERATING, tipIndex: undefined }),
              ];
            });

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
                createMessage({ role: 'assistant', content: '', isStatus: true, statusText: searchStatus }),
              ];
            });
          } else if (toolName === 'http_request') {
            const fetchStatus = getWebFetchStatus(query);
            setMessages(prev => {
              const hasInProgress = prev.some(
                msg => msg.isStatus && msg.statusText === fetchStatus
              );
              if (hasInProgress) return prev;

              const filtered = prev.filter(
                msg => !(msg.isStatus && msg.statusText?.startsWith(MESSAGES.WEB_FETCH_PREFIX) && msg.statusText !== MESSAGES.WEB_FETCH_COMPLETED)
              );
              return [
                ...filtered,
                createMessage({ role: 'assistant', content: '', isStatus: true, statusText: fetchStatus }),
              ];
            });
          }
        },
        onMarkdown: (markdown) => {
          onMarkdownGenerated(markdown);
          stopTipRotation();
          setMessages(prev =>
            prev.map(msg =>
              msg.isStatus && msg.statusText?.startsWith(MESSAGES.SLIDE_GENERATING_PREFIX)
                ? { ...msg, statusText: MESSAGES.SLIDE_COMPLETED, tipIndex: undefined }
                : msg
            )
          );
        },
        onError: (error) => {
          // ストリーム中のエラーイベント（バックエンドが{type:"error"}を送信）
          console.error('Agent error:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          const isModelNotAvailable = errorMessage.includes('model identifier is invalid');
          const displayMessage = isModelNotAvailable
            ? MESSAGES.ERROR_MODEL_NOT_AVAILABLE
            : MESSAGES.ERROR;

          streamText(displayMessage, setMessages, {
            filterPredicate: (msg) => !!msg.isStatus,
          }).then(() => {
            setIsLoading(false);
            setStatus('');
          });
        },
        onComplete: () => {
          setMessages(prev =>
            prev.map(msg => {
              if (msg.isStatus && msg.statusText?.startsWith(MESSAGES.WEB_SEARCH_PREFIX)) {
                return { ...msg, statusText: MESSAGES.WEB_SEARCH_COMPLETED };
              }
              if (msg.isStatus && msg.statusText?.startsWith(MESSAGES.WEB_FETCH_PREFIX)) {
                return { ...msg, statusText: MESSAGES.WEB_FETCH_COMPLETED };
              }
              return msg;
            })
          );
        },
      }, sessionId, modelType, referenceFile);

      setMessages(prev =>
        prev.map(msg =>
          msg.role === 'assistant' && msg.isStreaming
            ? { ...msg, isStreaming: false }
            : msg
        )
      );
    } catch (error) {
      console.error('Error:', error);
      const isIdleTimeout = error instanceof SSEIdleTimeoutError;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isModelNotAvailable = errorMessage.includes('model identifier is invalid');
      const displayMessage = isIdleTimeout
        ? MESSAGES.ERROR_MODEL_THROTTLED
        : isModelNotAvailable
          ? MESSAGES.ERROR_MODEL_NOT_AVAILABLE
          : MESSAGES.ERROR;

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
          return [...filtered, createMessage({ role: 'assistant', content: displayMessage, isStreaming: false })];
        }
      });
    } finally {
      setIsLoading(false);
      setStatus('');
      stopTipRotation();
      setMessages(prev =>
        prev.map(msg => {
          if (msg.isStreaming) {
            return { ...msg, isStreaming: false };
          }
          if (msg.isStatus && msg.statusText?.startsWith(MESSAGES.SLIDE_GENERATING_PREFIX)) {
            return { ...msg, statusText: MESSAGES.SLIDE_COMPLETED, tipIndex: undefined };
          }
          return msg;
        })
      );
    }
  }, [input, isLoading, selectedFile, currentMarkdown, sessionId, modelType, theme, onMarkdownGenerated, startTipRotation, stopTipRotation, streamText]);

  return {
    messages,
    input,
    setInput,
    isLoading,
    status,
    modelType,
    setModelType,
    selectedFile,
    setSelectedFile,
    handleSubmit,
  };
}
