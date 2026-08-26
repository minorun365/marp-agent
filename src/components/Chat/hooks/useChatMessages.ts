import { useState, useRef, useEffect, useCallback } from 'react';
import { invokeAgent, invokeAgentMock } from '../../../hooks/useAgentCore';
import { SSEIdleTimeoutError } from '../../../hooks/streaming/sseParser';
import { MESSAGES, getWebSearchStatus, getWebFetchStatus, getShareMessage, isSlideInProgressStatus, toCompletedWebStatus, useMock } from '../constants';
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

export function appendSlideProgress(messages: Message[], message: string): Message[] {
  return [
    ...messages.map(item => {
      if (item.isStreaming) {
        return { ...item, isStreaming: false };
      }
      if (item.isStatus && isSlideInProgressStatus(item.statusText)) {
        return { ...item, statusText: MESSAGES.SLIDE_CHECK_COMPLETED, tipIndex: undefined };
      }
      return item;
    }),
    createMessage({ role: 'assistant', content: message }),
    // 検査結果を伝えた直後に修正中の表示を立てる。次のoutput_slideが届くまで
    // モデルはスライド全文を作り直すため、ここを空けると画面が無言のまま止まる。
    createMessage({ role: 'assistant', content: '', isStatus: true, statusText: MESSAGES.SLIDE_FIXING, tipIndex: undefined }),
  ];
}

// 検索やページ取得が始まったということは、まだ本文を書いていない。
// 先出しした「スライドを作成中」の行が残っていると、検索の行がその下へ積まれて
// 画面の順番が壊れるので、取り下げる（2026-08-20に発生した表示崩れの対策）。
// 「修正中」はKimiのはみ出し検査からの復帰待ちなので残す。
function dropPendingSlideStatus(messages: Message[]): Message[] {
  return messages.filter(
    message => !(
      message.isStatus
      && message.statusText?.startsWith(MESSAGES.SLIDE_GENERATING_PREFIX)
    )
  );
}

function completeActiveWebStatuses(messages: Message[]): Message[] {
  return messages.map(message => {
    if (message.isStatus && message.statusText?.startsWith(MESSAGES.WEB_SEARCH_PREFIX)) {
      return { ...message, statusText: toCompletedWebStatus(message.statusText) };
    }
    if (message.isStatus && message.statusText?.startsWith(MESSAGES.WEB_FETCH_PREFIX)) {
      return { ...message, statusText: toCompletedWebStatus(message.statusText) };
    }
    return message;
  });
}

export function settleMessagesBeforeText(messages: Message[]): Message[] {
  // モデルの文章が届いても、スライドはMarkdownを受け取るまで完了ではない。
  // 検査差し戻し時の途中テキストで「作成しました」へ変えると、再生成中なのに
  // 画面が止まったように見える。検索・取得だけを完了へ切り替える。
  return completeActiveWebStatuses(messages);
}

export function applyToolUse(messages: Message[], toolName: string, query?: string): Message[] {
  const settledMessages = messages.map(message =>
    message.isStreaming ? { ...message, isStreaming: false } : message
  );

  if (toolName === 'output_slide') {
    const hasActiveSlide = settledMessages.some(
      message => message.isStatus && isSlideInProgressStatus(message.statusText)
    );
    if (hasActiveSlide) return settledMessages;

    return [
      ...completeActiveWebStatuses(settledMessages),
      createMessage({ role: 'assistant', content: '', isStatus: true, statusText: MESSAGES.SLIDE_GENERATING, tipIndex: undefined }),
    ];
  }

  if (toolName === 'web_search') {
    const searchStatus = getWebSearchStatus(query);
    // ツールの引数は分割して届くため、同じ検索について「途中までのクエリ」→「全文」の
    // 順で通知が来る。文字列が違うだけで別の検索として行を足すと、1回の検索が
    // 「Web検索完了」3行になって画面が伸びる。続きの通知は同じ行を書き換える
    // （http_requestと同じ扱い）。
    let activeIndex = -1;
    for (let index = settledMessages.length - 1; index >= 0; index -= 1) {
      const message = settledMessages[index];
      if (message.isStatus && message.statusText?.startsWith(MESSAGES.WEB_SEARCH_PREFIX)) {
        activeIndex = index;
        break;
      }
    }

    if (activeIndex >= 0) {
      const activeStatus = settledMessages[activeIndex].statusText as string;
      if (activeStatus === searchStatus) return settledMessages;
      // 表示は 'Web検索中... "クエリ"' と引用符で閉じるので、文字列の前方一致では
      // 続きかどうかを判定できない。クエリ同士で比べる。
      const quoted = `${MESSAGES.WEB_SEARCH_PREFIX} "`;
      const activeQuery = activeStatus.startsWith(quoted)
        ? activeStatus.slice(quoted.length, -1)
        : '';
      const isContinuation = activeQuery.length > 0 && (query ?? '').startsWith(activeQuery);
      if (activeStatus === MESSAGES.WEB_SEARCH_DEFAULT || isContinuation) {
        const updated = [...settledMessages];
        updated[activeIndex] = { ...updated[activeIndex], statusText: searchStatus };
        return updated;
      }
    }

    return [
      ...dropPendingSlideStatus(completeActiveWebStatuses(settledMessages)),
      createMessage({ role: 'assistant', content: '', isStatus: true, statusText: searchStatus }),
    ];
  }

  if (toolName === 'http_request') {
    const fetchStatus = getWebFetchStatus(query);
    // Kimiはツールの引数を分割して流すため、同じ取得について
    // 「URL無し」→「URL付き」の順で通知が届く。行を足すと両方が
    // 「読み込みました」へ変わって二重表示になるので、続きの通知は同じ行を書き換える。
    let activeIndex = -1;
    for (let index = settledMessages.length - 1; index >= 0; index -= 1) {
      const message = settledMessages[index];
      if (message.isStatus && message.statusText?.startsWith(MESSAGES.WEB_FETCH_PREFIX)) {
        activeIndex = index;
        break;
      }
    }

    if (activeIndex >= 0) {
      const activeStatus = settledMessages[activeIndex].statusText as string;
      if (activeStatus === fetchStatus) return settledMessages;
      if (activeStatus === MESSAGES.WEB_FETCH_DEFAULT || fetchStatus.startsWith(activeStatus)) {
        const updated = [...settledMessages];
        updated[activeIndex] = { ...updated[activeIndex], statusText: fetchStatus };
        return updated;
      }
    }

    return [
      ...dropPendingSlideStatus(completeActiveWebStatuses(settledMessages)),
      createMessage({ role: 'assistant', content: '', isStatus: true, statusText: fetchStatus }),
    ];
  }

  return settledMessages;
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
  const [modelType, setModelType] = useState<ModelType>('grok');
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
            const msgs = settleMessagesBeforeText(prev);
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
        onSlideProgress: (message) => {
          setStatus('');
          stopTipRotation();
          setMessages(prev => appendSlideProgress(prev, message));
          // 修正中の待ち時間もTipsを回す。スライド全文を作り直すので長い
          startTipRotation(setMessages);
        },
        onStatus: (newStatus) => {
          setStatus(newStatus);
        },
        onToolUse: (toolName, query) => {
          setMessages(prev => applyToolUse(prev, toolName, query));

          if (toolName === 'output_slide') {
            startTipRotation(setMessages);
          }
          // 検索・取得へ戻ったら、先出しした作成中の行ごとTipsも下ろす。
          if (toolName === 'web_search' || toolName === 'http_request') {
            stopTipRotation();
          }
        },
        onMarkdown: (markdown) => {
          onMarkdownGenerated(markdown);
          stopTipRotation();
          setMessages(prev =>
            prev.map(msg =>
              msg.isStatus && isSlideInProgressStatus(msg.statusText)
                ? { ...msg, statusText: MESSAGES.SLIDE_COMPLETED, tipIndex: undefined }
                : msg
            )
          );
        },
        onError: (error) => {
          // ストリーム中のエラーイベント（バックエンドが{type:"error"}を送信）
          console.error('Agent error:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          const isModelNotAvailable = errorMessage.includes('model identifier is invalid') || errorMessage.includes('Model not found');
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
                return { ...msg, statusText: toCompletedWebStatus(msg.statusText) };
              }
              if (msg.isStatus && msg.statusText?.startsWith(MESSAGES.WEB_FETCH_PREFIX)) {
                return { ...msg, statusText: toCompletedWebStatus(msg.statusText) };
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
      const isModelNotAvailable = errorMessage.includes('model identifier is invalid') || errorMessage.includes('Model not found');
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
          if (msg.isStatus && isSlideInProgressStatus(msg.statusText)) {
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
