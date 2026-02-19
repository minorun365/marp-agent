import { useRef } from 'react';
import type { ModelType } from './types';
import { MODEL_OPTIONS, MAX_FILE_SIZE } from './types';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  modelType: ModelType;
  setModelType: (value: ModelType) => void;
  isLoading: boolean;
  hasUserMessage: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onSubmit: (e: React.FormEvent) => void;
  selectedFile?: File | null;
  onFileSelect?: (file: File | null) => void;
}

const MAX_INPUT_LENGTH = 2000;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function ChatInput({
  input,
  setInput,
  modelType,
  setModelType,
  isLoading,
  hasUserMessage,
  inputRef,
  onSubmit,
  selectedFile,
  onFileSelect,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showModelSelector = MODEL_OPTIONS.length > 0;
  const currentModel = MODEL_OPTIONS.find(m => m.value === modelType);
  const modelLabel = currentModel?.shortLabel ?? currentModel?.label ?? modelType;
  const isNearLimit = input.length > MAX_INPUT_LENGTH * 0.9;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('PDFファイルのみアップロードできます');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      alert('ファイルサイズは10MB以下にしてください');
      e.target.value = '';
      return;
    }

    onFileSelect?.(file);
    e.target.value = '';
  };

  return (
    <form onSubmit={onSubmit} className="border-t px-6 py-4">
      <div className="max-w-3xl mx-auto">
        {/* ファイル選択チップ */}
        {selectedFile && (
          <div className="flex items-center gap-1.5 mb-2 ml-0">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-600">
              <span className="shrink-0">📄</span>
              <span className="truncate max-w-[200px] sm:max-w-[300px]">{selectedFile.name}</span>
              <span className="text-gray-400 text-xs shrink-0">({formatFileSize(selectedFile.size)})</span>
              <button
                type="button"
                onClick={() => onFileSelect?.(null)}
                className="ml-0.5 text-gray-400 hover:text-gray-600"
                title="ファイルを削除"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          </div>
        )}
        <div className="flex gap-2">
          {/* 入力欄（モデルが複数ある場合のみ左端にセレクター表示） */}
          <div className="flex-1 flex items-center border border-gray-200 rounded-lg bg-gray-50 focus-within:ring-2 focus-within:ring-[#5ba4d9] focus-within:border-transparent">
            {showModelSelector && (
              <>
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
                    {MODEL_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="w-px h-5 bg-gray-200 mx-1" />
              </>
            )}
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_LENGTH))}
              maxLength={MAX_INPUT_LENGTH}
              placeholder={selectedFile ? '指示を入力（例：この資料をもとにスライドを作って）' : '例：AgentCoreの入門資料'}
              className="flex-1 bg-transparent px-3 py-2 focus:outline-none placeholder:text-gray-400"
              disabled={isLoading}
            />
            {/* 添付ボタン（右端） */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className={`pr-3 pl-1 py-1.5 transition-colors ${
                selectedFile
                  ? 'text-[#5ba4d9]'
                  : 'text-gray-300 hover:text-gray-500'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="参考資料（PDF）を添付"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
          <div className="flex flex-col items-center gap-1">
            <button
              type="submit"
              disabled={isLoading || (!input.trim() && !selectedFile)}
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
      </div>
    </form>
  );
}
