export type ModelType = 'sonnet' | 'kimi' | 'opus' | 'haiku';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  isStatus?: boolean;  // ステータス表示用メッセージ
  statusText?: string; // ステータステキスト
  tipIndex?: number;   // 豆知識ローテーション用
}

let _msgCounter = 0;
export function createMessage(partial: Omit<Message, 'id'>): Message {
  return { id: `msg-${++_msgCounter}`, ...partial };
}

export interface ChatProps {
  onMarkdownGenerated: (markdown: string) => void;
  currentMarkdown: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  editPromptTrigger?: number;  // 値が変わるたびに修正用メッセージを表示
  sharePromptTrigger?: number;  // 値が変わるたびにシェア用メッセージを自動送信
  sessionId?: string;  // 会話履歴を保持するためのセッションID
}
