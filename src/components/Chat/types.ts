// バックエンドが認識できるモデル型。現在無効なモデルも型からは削除しない。
export type ModelType = 'sonnet' | 'sonnet5' | 'kimi' | 'glm' | 'opus';

export interface ModelOption {
  value: ModelType;
  label: string;       // ドロップダウンに表示
  shortLabel?: string;  // セレクター閉じた状態で表示
}

// UIで有効なモデル一覧。2件以上になるとChatInputのセレクターが自動表示される。
export const MODEL_OPTIONS: ModelOption[] = [
  { value: 'sonnet', label: 'Claude Sonnet 4.6', shortLabel: 'Sonnet 4.6' },
  { value: 'sonnet5', label: 'Claude Sonnet 5', shortLabel: 'Sonnet 5' },
  { value: 'kimi', label: 'Kimi K2.5', shortLabel: 'Kimi K2.5' },
  { value: 'glm', label: 'GLM 5', shortLabel: 'GLM 5' },
  // Opus 4.6を再有効化するときは、この行とconfig.pyのENABLED_MODEL_TYPESを同時にコメント解除する。
  // { value: 'opus', label: 'Claude Opus 4.6', shortLabel: 'Opus 4.6' },
];

export interface ReferenceFile {
  file_name: string;
  content_type: string;
  base64_data: string;
  size: number;
}

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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
  theme?: string;  // 選択中のデザインテーマ
}
