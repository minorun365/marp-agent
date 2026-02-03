interface ShareConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isSharing: boolean;
}

export function ShareConfirmModal({ isOpen, onConfirm, onCancel, isSharing }: ShareConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">⚠️</span>
          <h3 className="text-lg font-bold">スライドを公開しますか？</h3>
        </div>

        {/* 警告メッセージ */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
          <ul className="text-sm text-gray-700 space-y-2 list-disc list-inside">
            <li>URLを知っている人は誰でも閲覧できます</li>
            <li>公開期間は7日間です（自動削除）</li>
          </ul>
        </div>

        {/* ボタン */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={isSharing}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            disabled={isSharing}
            className="btn-kag text-white px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {isSharing ? '公開中...' : '公開する'}
          </button>
        </div>
      </div>
    </div>
  );
}
