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

  const handleShareToX = () => {
    const tweetText = `#パワポ作るマン でスライドを作りました！みんなも試してみてね👍\n${url}`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(twitterUrl, '_blank', 'width=600,height=400');
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

        {/* アクションボタン */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            閉じる
          </button>
          <button
            onClick={handleShareToX}
            className="flex-1 btn-brand text-white py-2 rounded-lg"
          >
            Xでシェア
          </button>
        </div>
      </div>
    </div>
  );
}
