import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { invokeAgent, invokeAgentMock } from '../hooks/useAgentCore';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  isStatus?: boolean;  // ステータス表示用メッセージ
  statusText?: string; // ステータステキスト
}

interface ChatProps {
  onMarkdownGenerated: (markdown: string) => void;
  currentMarkdown: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  editPromptTrigger?: number;  // 値が変わるたびに修正用メッセージを表示
  sharePromptTrigger?: number;  // 値が変わるたびにシェア用メッセージを自動送信
  sessionId?: string;  // 会話履歴を保持するためのセッションID
}

const INITIAL_MESSAGE = 'どんな資料を作りたいですか？';

// モック使用フラグ（VITE_USE_MOCK=true で強制的にモック使用）
const useMock = import.meta.env.VITE_USE_MOCK === 'true';

const EDIT_PROMPT_MESSAGE = 'どのように修正しますか？';

export function Chat({ onMarkdownGenerated, currentMarkdown, inputRef, editPromptTrigger, sharePromptTrigger, sessionId }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 初期メッセージをストリーミング表示
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const streamInitialMessage = async () => {
      setMessages([{ role: 'assistant', content: '', isStreaming: true }]);

      for (const char of INITIAL_MESSAGE) {
        await new Promise(resolve => setTimeout(resolve, 30));
        setMessages(prev =>
          prev.map((msg, idx) =>
            idx === 0 ? { ...msg, content: msg.content + char } : msg
          )
        );
      }

      setMessages(prev =>
        prev.map((msg, idx) =>
          idx === 0 ? { ...msg, isStreaming: false } : msg
        )
      );
    };

    streamInitialMessage();
  }, []);

  // 修正依頼ボタンが押されたときのストリーミングメッセージ
  useEffect(() => {
    if (!editPromptTrigger || editPromptTrigger === 0) return;

    const streamEditPrompt = async () => {
      // 既存の「どのように修正しますか？」メッセージを削除してから追加
      setMessages(prev => {
        const filtered = prev.filter(
          msg => !(msg.role === 'assistant' && msg.content === EDIT_PROMPT_MESSAGE)
        );
        return [...filtered, { role: 'assistant', content: '', isStreaming: true }];
      });

      for (const char of EDIT_PROMPT_MESSAGE) {
        await new Promise(resolve => setTimeout(resolve, 30));
        setMessages(prev =>
          prev.map((msg, idx) =>
            idx === prev.length - 1 && msg.role === 'assistant' && msg.isStreaming
              ? { ...msg, content: msg.content + char }
              : msg
          )
        );
      }

      setMessages(prev =>
        prev.map((msg, idx) =>
          idx === prev.length - 1 && msg.isStreaming
            ? { ...msg, isStreaming: false }
            : msg
        )
      );
    };

    streamEditPrompt();
  }, [editPromptTrigger]);

  // シェアボタンが押されたときにエージェントにシェアリクエストを自動送信
  useEffect(() => {
    if (!sharePromptTrigger || sharePromptTrigger === 0 || isLoading) return;

    const sendShareRequest = async () => {
      setIsLoading(true);

      // アシスタントメッセージを追加（ストリーミング用）
      setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }]);

      try {
        const invoke = useMock ? invokeAgentMock : invokeAgent;

        await invoke('今回のスライド作成体験をXでシェアするURLを提案してください（無言でツール使用開始すること）', currentMarkdown, {
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
                  msg => msg.isStatus && msg.statusText === 'ツイート案を作成中...'
                );
                if (hasExisting) return prev;
                return [
                  ...prev,
                  { role: 'assistant', content: '', isStatus: true, statusText: 'ツイート案を作成中...' }
                ];
              });
            }
            // シェアリクエスト時はスライド生成ステータスは無視
          },
          onMarkdown: () => {},
          onTweetUrl: (url) => {
            // ツイートURLステータスを完了に更新し、リンクメッセージを追加
            setMessages(prev => {
              const updated = prev.map(msg =>
                msg.isStatus && msg.statusText === 'ツイート案を作成中...'
                  ? { ...msg, statusText: 'ツイート案を作成しました' }
                  : msg
              );
              return [
                ...updated,
                { role: 'assistant', content: `この体験をXでシェアしませんか？ 👉 [ツイート](${url})` }
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
                // ツイートステータスを確実に完了に更新
                if (msg.isStatus && msg.statusText === 'ツイート案を作成中...') {
                  return { ...msg, statusText: 'ツイート案を作成しました' };
                }
                return msg;
              })
            );
          },
        }, sessionId);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    sendShareRequest();
  }, [sharePromptTrigger]);

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
      // デフォルトは本番API、VITE_USE_MOCK=trueでモック使用
      const invoke = useMock ? invokeAgentMock : invokeAgent;

      await invoke(userMessage, currentMarkdown, {
        onText: (text) => {
          setStatus(''); // テキストが来たらステータスを消す
          // テキストをストリーミング表示
          setMessages(prev =>
            prev.map((msg, idx) =>
              idx === prev.length - 1 && msg.role === 'assistant' && !msg.isStatus
                ? { ...msg, content: msg.content + text }
                : msg
            )
          );
        },
        onStatus: (newStatus) => {
          setStatus(newStatus);
        },
        onToolUse: (toolName) => {
          // ツール使用開始時にストリーミングカーソルを消す
          setMessages(prev =>
            prev.map(msg =>
              msg.isStreaming ? { ...msg, isStreaming: false } : msg
            )
          );

          // ツール使用中のステータスを表示（既存のステータスがなければ追加）
          if (toolName === 'output_slide') {
            setMessages(prev => {
              // Web検索があれば完了に更新し、output_slideのステータスを追加
              const hasExisting = prev.some(
                msg => msg.isStatus && msg.statusText === 'スライドを作成中...（30秒ほどかかります）'
              );
              if (hasExisting) return prev;

              // Web検索中を完了に更新
              const updated = prev.map(msg =>
                msg.isStatus && msg.statusText === 'Web検索中...'
                  ? { ...msg, statusText: 'Web検索完了' }
                  : msg
              );
              return [
                ...updated,
                { role: 'assistant', content: '', isStatus: true, statusText: 'スライドを作成中...（30秒ほどかかります）' }
              ];
            });
          } else if (toolName === 'web_search') {
            setMessages(prev => {
              const hasExisting = prev.some(
                msg => msg.isStatus && msg.statusText === 'Web検索中...'
              );
              if (hasExisting) return prev;
              return [
                ...prev,
                { role: 'assistant', content: '', isStatus: true, statusText: 'Web検索中...' }
              ];
            });
          }
        },
        onMarkdown: (markdown) => {
          onMarkdownGenerated(markdown);
          // output_slideのステータスを完了状態に更新
          setMessages(prev =>
            prev.map(msg =>
              msg.isStatus && msg.statusText === 'スライドを作成中...（30秒ほどかかります）'
                ? { ...msg, statusText: 'スライドを作成しました' }
                : msg
            )
          );
        },
        onError: (error) => {
          console.error('Agent error:', error);
          throw error;
        },
        onComplete: () => {
          // Web検索のステータスも完了に更新
          setMessages(prev =>
            prev.map(msg =>
              msg.isStatus && msg.statusText === 'Web検索中...'
                ? { ...msg, statusText: 'Web検索完了' }
                : msg
            )
          );
        },
      }, sessionId);

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
      setMessages(prev =>
        prev.map((msg, idx) =>
          idx === prev.length - 1 && msg.role === 'assistant' && !msg.isStatus
            ? { ...msg, content: 'エラーが発生しました。もう一度お試しください。', isStreaming: false }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
      setStatus('');
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
      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-8">
            <p className="text-lg">スライドを作成しましょう</p>
            <p className="text-sm mt-2">例: 「AWS入門の5枚スライドを作って」</p>
          </div>
        )}
        {messages.map((message, index) => {
          const isLastAssistant = message.role === 'assistant' && index === messages.length - 1;
          const showStatus = isLastAssistant && !message.content && !message.isStatus && status;

          // 空のアシスタントメッセージはスキップ（ステータス表示中を除く）
          if (message.role === 'assistant' && !message.isStatus && !message.content.trim() && !showStatus) {
            return null;
          }

          // ステータスメッセージの場合
          if (message.isStatus) {
            return (
              <div key={index} className="flex justify-start">
                <div className="bg-blue-50 text-blue-700 rounded-lg px-4 py-2 border border-blue-200">
                  <span className="text-sm flex items-center gap-2">
                    {message.statusText === 'スライドを作成しました' || message.statusText === 'Web検索完了' || message.statusText === 'ツイート案を作成しました' ? (
                      <span className="text-green-600">&#10003;</span>
                    ) : (
                      <span className="animate-spin">&#9696;</span>
                    )}
                    {message.statusText}
                  </span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.role === 'user'
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
        })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 入力フォーム */}
      <form onSubmit={handleSubmit} className="border-t px-6 py-4">
        <div className="max-w-3xl mx-auto flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="例： 製造業のAIエージェント事例"
            className="flex-1 border border-gray-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#5ba4d9] focus:border-transparent bg-gray-50"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="btn-kag text-white px-6 py-2 rounded-lg"
          >
            送信
          </button>
        </div>
      </form>
    </div>
  );
}
