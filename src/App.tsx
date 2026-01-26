import { useState, useRef } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { Chat } from './components/Chat';
import { SlidePreview } from './components/SlidePreview';
import { exportPdf, exportPdfMock } from './hooks/useAgentCore';

// モック使用フラグ
const useMock = import.meta.env.VITE_USE_MOCK === 'true';

type Tab = 'chat' | 'preview';

const authComponents = {
  Header() {
    return (
      <div className="text-center py-4">
        <h1 className="text-2xl font-bold text-white">
          パワポ作るマン　by みのるん
        </h1>
        <p className="text-sm text-white/80 mt-1">
          誰でもアカウントを作って利用できます！<br/>
          （1日50名超えるとエラー）
        </p>
      </div>
    );
  },
  Footer() {
    return (
      <div className="text-center py-3 px-4">
        <p className="text-xs text-white/70 leading-relaxed">
          登録されたメールアドレスは認証目的でのみ使用します。
        </p>
        <p className="text-xs text-white/70 mt-2">
          <a
            href="https://github.com/minorun365/marp-agent"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white transition-colors"
          >
            GitHub
          </a>
          {' / '}
          <a
            href="https://x.com/minorun365"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white transition-colors"
          >
            X
          </a>
        </p>
      </div>
    );
  },
};

function App() {
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
  const chatInputRef = useRef<HTMLInputElement>(null);
  // セッションID（画面更新まで同じIDを使用して会話履歴を保持）
  const [sessionId] = useState(() => crypto.randomUUID());

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

  const handleDownloadPdf = async () => {
    if (!markdown) return;

    setIsDownloading(true);
    try {
      const exportFn = useMock ? exportPdfMock : exportPdf;
      const blob = await exportFn(markdown);

      // 新しいタブでPDFを開く
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');

      if (useMock) {
        alert('モックモード: マークダウンファイルをダウンロードしました。');
      }

      // チャット画面に遷移してシェアトリガーを発火
      setActiveTab('chat');
      setSharePromptTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Download error:', error);
      alert(`ダウンロードに失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-kag-gradient text-white px-6 py-4 shadow-md">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">パワポ作るマン　by みのるん</h1>
            <p className="text-xs text-white/50">AgentCore ＆ Amplifyでフルサーバーレス構築！</p>
          </div>
          <button
              onClick={signOut}
              className="bg-white/20 text-white px-4 py-1 rounded hover:bg-white/30 transition-colors text-sm"
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
            onDownloadPdf={handleDownloadPdf}
            isDownloading={isDownloading}
            onRequestEdit={handleRequestEdit}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
