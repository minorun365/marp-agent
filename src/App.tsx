import { useEffect, useRef, useState } from 'react';
import { getCurrentUser, signOut as amplifySignOut } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { AuthScreen } from './components/Auth/AuthScreen';
import { Chat } from './components/Chat';
import { SlidePreview } from './components/SlidePreview';
import type { ThemeId } from './components/SlidePreview';
import { ShareConfirmModal } from './components/ShareConfirmModal';
import { ShareResultModal } from './components/ShareResultModal';
import { exportPdf, exportPdfMock, exportPptx, exportPptxMock, exportEditablePptx, exportEditablePptxMock, shareSlide, shareSlideMock } from './hooks/useAgentCore';
import type { ShareResult } from './hooks/useAgentCore';

// モック使用フラグ（ローカル開発用：認証スキップ＆モックAPI）
const useMock = import.meta.env.VITE_USE_MOCK === 'true';
const showAuthDemo = import.meta.env.VITE_SHOW_AUTH === 'true';

type Tab = 'chat' | 'preview';

// モックのsignOut関数
const mockSignOut = () => {
  console.log('Mock signOut called');
};

function redirectErrorMessage(data: unknown) {
  const error = (data as { error?: unknown } | undefined)?.error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'Googleログインを完了できませんでした。時間をおいてもう一度お試しください。';
}

function AuthenticatedApp() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [redirectError, setRedirectError] = useState('');

  useEffect(() => {
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      // signedIn は画面側の signIn() が成功した瞬間に飛ぶ。ここで画面を差し替えると、
      // ログイン後にパスキー登録を案内する画面（AuthScreen の offer）へ進む前に
      // AuthScreen ごと消えてしまい、案内が一度も出ない。
      // 画面内のログインは AuthScreen が onAuthenticated() で明示的に閉じるので、
      // ここで拾うのは戻り先が画面の外にある Google リダイレクトだけにする。
      if (payload.event === 'signInWithRedirect') {
        setRedirectError('');
        setAuthenticated(true);
      }
      if (payload.event === 'signInWithRedirect_failure') {
        // 失敗を黙って握りつぶすと、ログイン画面が再表示されるだけに見えて原因が追えない。
        setRedirectError(redirectErrorMessage(payload.data));
        setAuthenticated(false);
      }
    });
    void getCurrentUser()
      .then(() => setAuthenticated(true))
      .catch(() => setAuthenticated(false));
    return unsubscribe;
  }, []);

  if (authenticated === null) return null;
  if (!authenticated) {
    return <AuthScreen initialError={redirectError} onAuthenticated={() => setAuthenticated(true)} />;
  }

  return <MainApp signOut={() => void amplifySignOut().finally(() => setAuthenticated(false))} />;
}

function App() {
  if (useMock && showAuthDemo) {
    return <AuthScreen demoMode onAuthenticated={() => undefined} />;
  }
  if (useMock) {
    return <MainApp signOut={mockSignOut} />;
  }
  return <AuthenticatedApp />;
}

function MainApp({ signOut }: { signOut?: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [markdown, setMarkdown] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>('speee');
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
  const [pendingShareTheme, setPendingShareTheme] = useState<string>('border');

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

  const handleExport = async (format: 'pdf' | 'pptx' | 'pptx_editable', theme: string) => {
    if (!markdown) return;

    const exportFns = {
      pdf: useMock ? exportPdfMock : exportPdf,
      pptx: useMock ? exportPptxMock : exportPptx,
      pptx_editable: useMock ? exportEditablePptxMock : exportEditablePptx,
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
        a.download = `slide.${format === 'pptx_editable' ? 'pptx' : format}`;
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
    <div className="h-[100dvh] flex flex-col bg-gray-50">
      {/* ヘッダー: 背景と余白はapp-header側で2層グラデ＋セーフエリアを組み立てる */}
      <header className="app-header text-white shadow-md">
        <div className="max-w-3xl mx-auto flex justify-between items-center gap-2">
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold truncate">
              パワポ作るマン <span className="text-base md:text-lg font-normal ml-1">by みのるん</span>
            </h1>
            <p className="text-xs md:text-sm text-white/50 truncate">Strands ＆ AgentCoreでフルサーバーレス構築！</p>
          </div>
          <button
            onClick={signOut}
            className="bg-white/20 text-white px-3 md:px-4 py-1 md:py-1.5 rounded-md hover:bg-white/30 transition-colors text-xs md:text-sm whitespace-nowrap flex-shrink-0"
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
                ? 'text-brand-gradient border-b-2 border-[#5ba4d9]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            チャット
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-6 py-3 font-medium transition-colors relative ${
              activeTab === 'preview'
                ? 'text-brand-gradient border-b-2 border-[#5ba4d9]'
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
            theme={selectedTheme}
          />
        </div>
        <div className={`h-full ${activeTab === 'preview' ? '' : 'hidden'}`}>
          <SlidePreview
            markdown={markdown}
            selectedTheme={selectedTheme}
            onThemeChange={setSelectedTheme}
            onDownloadPdf={(theme) => handleExport('pdf', theme)}
            onDownloadPptx={(theme) => handleExport('pptx', theme)}
            onDownloadEditablePptx={(theme) => handleExport('pptx_editable', theme)}
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
