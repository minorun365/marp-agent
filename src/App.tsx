import { useState, useRef } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { Chat } from './components/Chat';
import { SlidePreview } from './components/SlidePreview';
import { ShareConfirmModal } from './components/ShareConfirmModal';
import { ShareResultModal } from './components/ShareResultModal';
import { exportPdf, exportPdfMock, exportPptx, exportPptxMock, shareSlide, shareSlideMock } from './hooks/useAgentCore';
import type { ShareResult } from './hooks/useAgentCore';

// モック使用フラグ（ローカル開発用：認証スキップ＆モックAPI）
const useMock = import.meta.env.VITE_USE_MOCK === 'true';

type Tab = 'chat' | 'preview';

// モックのsignOut関数
const mockSignOut = () => {
  console.log('Mock signOut called');
};

const authComponents = {
  Header() {
    return (
      <div className="text-center py-4">
        <h1 className="text-2xl font-bold text-white">
          パワポ作るマン　for KAG
        </h1>
        <p className="text-sm text-white/80 mt-1">
          KAGメルアドで新規アカウントを作れます！
        </p>
      </div>
    );
  },
  Footer() {
    return (
      <div className="text-center py-3 px-4">
        <p className="text-xs text-white/70 leading-relaxed">
          このアプリはトライアル運用中です。
        </p>
      </div>
    );
  },
};

function App() {
  // モックモード時は認証をスキップ（ローカル開発用）
  if (useMock) {
    return <MainApp signOut={mockSignOut} />;
  }

  return (
    <Authenticator components={authComponents}>
      {({ signOut }) => <MainApp signOut={signOut} />}
    </Authenticator>
  );
}

function MainApp({ signOut }: { signOut?: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [markdown, setMarkdown] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [editPromptTrigger, setEditPromptTrigger] = useState(0);
  const [sharePromptTrigger, setSharePromptTrigger] = useState(0);
  const [hasShownSharePrompt, setHasShownSharePrompt] = useState(false);
  const chatInputRef = useRef<HTMLInputElement>(null);
  // セッションID（画面更新まで同じIDを使用して会話履歴を保持）
  const [sessionId] = useState(() => crypto.randomUUID());

  // スライド共有関連
  const [isSharing, setIsSharing] = useState(false);
  const [showShareConfirm, setShowShareConfirm] = useState(false);
  const [shareResult, setShareResult] = useState<ShareResult | null>(null);
  const [pendingShareTheme, setPendingShareTheme] = useState<string>('gradient');

  const handleMarkdownGenerated = (newMarkdown: string) => {
    setMarkdown(newMarkdown);
    // スライド生成後、自動でプレビュータブに切り替え
    setActiveTab('preview');
  };

  const handleRequestEdit = () => {
    setActiveTab('chat');
    // 修正用メッセージをトリガー
    setEditPromptTrigger(prev => prev + 1);
    // タブ切り替え後、入力欄にフォーカス
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 100);
  };

  const handleExport = async (format: 'pdf' | 'pptx', theme: string) => {
    if (!markdown) return;

    const exportFns = {
      pdf: useMock ? exportPdfMock : exportPdf,
      pptx: useMock ? exportPptxMock : exportPptx,
    };

    setIsDownloading(true);
    try {
      const blob = await exportFns[format](markdown, theme);

      const url = URL.createObjectURL(blob);
      const newWindow = window.open(url, '_blank');

      // ポップアップブロック検出
      if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
        const a = document.createElement('a');
        a.href = url;
        a.download = `slide.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        alert('ポップアップがブロックされたため、直接ダウンロードしました。');
      }

      if (useMock) {
        alert('モックモード: マークダウンファイルをダウンロードしました。');
      }

      // チャット画面に遷移（初回のみシェアトリガーを発火）
      setActiveTab('chat');
      if (!hasShownSharePrompt) {
        setSharePromptTrigger(prev => prev + 1);
        setHasShownSharePrompt(true);
      }
    } catch (error) {
      console.error('Download error:', error);
      alert(`${format.toUpperCase()}ダウンロードに失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsDownloading(false);
    }
  };

  // スライド共有リクエスト（確認モーダルを表示）
  const handleShareRequest = (theme: string) => {
    setPendingShareTheme(theme);
    setShowShareConfirm(true);
  };

  // スライド共有実行
  const handleShareConfirm = async () => {
    if (!markdown) return;

    setIsSharing(true);

    try {
      const shareFn = useMock ? shareSlideMock : shareSlide;
      const result = await shareFn(markdown, pendingShareTheme);
      setShowShareConfirm(false);
      setShareResult(result);
    } catch (error) {
      console.error('Share error:', error);
      setShowShareConfirm(false);
      alert(`スライド共有に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-kag-gradient text-white px-4 md:px-6 py-3 md:py-4 shadow-md">
        <div className="max-w-3xl mx-auto flex justify-between items-center gap-2">
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold truncate">
              パワポ作るマン　<span className="text-base md:text-lg font-normal ml-1">for KAG</span>
            </h1>
            <p className="text-xs md:text-sm text-white/50 truncate">AgentCore ＆ Amplifyでフルサーバーレス構築！</p>
          </div>
          <button
            onClick={signOut}
            className="bg-white/20 text-white px-2 md:px-3 py-0.5 md:py-1 rounded hover:bg-white/30 transition-colors text-[10px] md:text-[10px] whitespace-nowrap flex-shrink-0"
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* タブ */}
      <div className="bg-white border-b px-6">
        <div className="max-w-3xl mx-auto flex">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'chat'
                ? 'text-kag-gradient border-b-2 border-[#5ba4d9]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            チャット
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-6 py-3 font-medium transition-colors relative ${
              activeTab === 'preview'
                ? 'text-kag-gradient border-b-2 border-[#5ba4d9]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            プレビュー
            {markdown && activeTab !== 'preview' && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* コンテンツ */}
      <main className="flex-1 overflow-hidden">
        <div className={`h-full ${activeTab === 'chat' ? '' : 'hidden'}`}>
          <Chat
            onMarkdownGenerated={handleMarkdownGenerated}
            currentMarkdown={markdown}
            inputRef={chatInputRef}
            editPromptTrigger={editPromptTrigger}
            sharePromptTrigger={sharePromptTrigger}
            sessionId={sessionId}
          />
        </div>
        <div className={`h-full ${activeTab === 'preview' ? '' : 'hidden'}`}>
          <SlidePreview
            markdown={markdown}
            onDownloadPdf={(theme) => handleExport('pdf', theme)}
            onDownloadPptx={(theme) => handleExport('pptx', theme)}
            onShareSlide={handleShareRequest}
            isDownloading={isDownloading}
            onRequestEdit={handleRequestEdit}
          />
        </div>
      </main>

      {/* スライド共有モーダル */}
      <ShareConfirmModal
        isOpen={showShareConfirm}
        onConfirm={handleShareConfirm}
        onCancel={() => setShowShareConfirm(false)}
        isSharing={isSharing}
      />
      <ShareResultModal
        isOpen={!!shareResult}
        url={shareResult?.url || ''}
        expiresAt={shareResult?.expiresAt || 0}
        onClose={() => setShareResult(null)}
      />
    </div>
  );
}

export default App;
