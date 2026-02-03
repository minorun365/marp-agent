import { useState } from 'react';

interface ShareResultModalProps {
  isOpen: boolean;
  url: string;
  expiresAt: number;
  onClose: () => void;
}

export function ShareResultModal({ isOpen, url, expiresAt, onClose }: ShareResultModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // 有効期限を日本時間で表示
  const expiresDate = new Date(expiresAt * 1000).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
        {/* ヘッダー */}
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <span>✅</span>
          スライドを公開しました
        </h3>

        {/* URL表示 + コピーボタン */}
        <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-3 mb-4">
          <input
            type="text"
            value={url}
            readOnly
            className="flex-1 bg-transparent text-sm truncate outline-none"
          />
          <button
            onClick={handleCopy}
            className="text-sm px-3 py-1 bg-white border rounded hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            {copied ? 'コピー済み' : 'コピー'}
          </button>
        </div>

        {/* 有効期限 */}
        <p className="text-xs text-gray-500 mb-4">
          {expiresDate}まで有効（7日間）
        </p>

        {/* 閉じるボタン */}
        <button
          onClick={onClose}
          className="w-full btn-kag text-white py-2 rounded-lg"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
