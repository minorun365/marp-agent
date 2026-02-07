import type { ModelType } from './types';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  modelType: ModelType;
  setModelType: (value: ModelType) => void;
  isLoading: boolean;
  hasUserMessage: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onSubmit: (e: React.FormEvent) => void;
}

const MAX_INPUT_LENGTH = 2000;

export function ChatInput({
  input,
  setInput,
  modelType,
  setModelType,
  isLoading,
  hasUserMessage,
  inputRef,
  onSubmit,
}: ChatInputProps) {
  const modelLabel = modelType === 'sonnet' ? 'Sonnet' : modelType === 'opus' ? 'Opus' : modelType === 'haiku' ? 'Haiku' : 'DeepSeek';
  const isNearLimit = input.length > MAX_INPUT_LENGTH * 0.9;

  return (
    <form onSubmit={onSubmit} className="border-t px-6 py-4">
      <div className="max-w-3xl mx-auto flex gap-2">
        {/* 入力欄（左端にモデルセレクター内蔵） */}
        <div className="flex-1 flex items-center border border-gray-200 rounded-lg bg-gray-50 focus-within:ring-2 focus-within:ring-[#5ba4d9] focus-within:border-transparent">
          <div className="relative flex items-center pl-3 sm:pl-4">
            {/* PC: モデル名表示、スマホ: 矢印のみ */}
            <span className={`hidden sm:inline text-xs ${hasUserMessage ? 'text-gray-300' : 'text-gray-600'}`}>
              {modelLabel}
            </span>
            <span className={`text-xl sm:ml-1 mr-2 ${hasUserMessage ? 'text-gray-300' : 'text-gray-600'}`}>▾</span>
            {/* 透明なselectを上に重ねてタップ領域を確保 */}
            <select
              value={modelType}
              onChange={(e) => setModelType(e.target.value as ModelType)}
              disabled={isLoading || hasUserMessage}
              className="absolute inset-0 opacity-0 cursor-pointer"
              title={hasUserMessage ? '会話中はモデルを変更できません' : '使用するAIモデルを選択'}
            >
              <option value="sonnet">バランス（Claude Sonnet 4.5）</option>
              <option value="opus">高品質（Claude Opus 4.6）</option>
              <option value="haiku">高速（Claude Haiku 4.5）</option>
              <option value="deepseek">サステナブル（DeepSeek V3.2）</option>
            </select>
          </div>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_LENGTH))}
            maxLength={MAX_INPUT_LENGTH}
            placeholder="例：AgentCoreの入門資料"
            className="flex-1 bg-transparent px-3 py-2 focus:outline-none placeholder:text-gray-400"
            disabled={isLoading}
          />
        </div>
        <div className="flex flex-col items-center gap-1">
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="btn-kag text-white px-4 sm:px-6 py-2 rounded-lg whitespace-nowrap"
          >
            送信
          </button>
          {isNearLimit && (
            <span className={`text-[10px] ${input.length >= MAX_INPUT_LENGTH ? 'text-red-500' : 'text-gray-400'}`}>
              {input.length}/{MAX_INPUT_LENGTH}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
