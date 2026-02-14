# フロントエンド（React・Tailwind）

## Tailwind CSS v4

### Vite統合
```typescript
// vite.config.ts
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

### カスタムカラー定義
```css
/* src/index.css */
@import "tailwindcss";

@theme {
  --color-kag-blue: #0e0d6a;
}
```

### グラデーション定義
```css
/* カスタムクラスとして定義 */
.bg-kag-gradient {
  background: linear-gradient(to right, #1a3a6e, #5ba4d9);
}

.btn-kag {
  background: linear-gradient(to right, #1a3a6e, #5ba4d9);
  transition: all 0.2s;
}

.btn-kag:hover {
  background: linear-gradient(to right, #142d54, #4a93c8);
}
```

### 使用方法
```jsx
<header className="bg-kag-gradient">ヘッダー</header>
<button className="btn-kag text-white">送信</button>
```

---

## フロントエンド構成

### コンポーネント構成
```
src/
├── App.tsx              # メイン（タブ切り替え、状態管理）
├── components/
│   ├── Chat/            # チャットUI（分割済み）
│   │   ├── index.tsx    # メインコンポーネント
│   │   ├── ChatInput.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── StatusMessage.tsx
│   │   ├── constants.ts # TIPS, MESSAGES定数
│   │   ├── types.ts     # 型定義
│   │   └── hooks/       # useChatMessages, useTipRotation, useStreamingText
│   └── SlidePreview.tsx # スライドプレビュー
└── hooks/
    ├── useAgentCore.ts  # re-export
    ├── api/             # agentCoreClient, exportClient
    ├── streaming/       # sseParser
    └── mock/            # mockClient
```

### Chatコンポーネントの設計

Chat/index.tsx はUIレンダリングのみの薄いコンポーネント（約40行）。
ロジックは `useChatMessages` カスタムフックに集約：

- **useChatMessages.ts**: メッセージ管理、API呼び出し、ストリーミング処理
- **types.ts**: `Message`型（`id`フィールド付き）と `createMessage()` ヘルパー
  - IDはインクリメンタルカウンターで自動採番、React keyに使用
- **MessageBubble.tsx**: `React.memo`でメモ化し、変更のないメッセージの再レンダリングを防止
- **ChatInput.tsx**: `MAX_INPUT_LENGTH = 2000` の文字数制限付き（90%超で残り文字数を表示）

### 状態管理
- `markdown`: 生成されたMarpマークダウン
- `activeTab`: 現在のタブ（chat / preview）
- `isDownloading`: PDF/PPTX生成中フラグ

### ダウンロード機能
プレビュー画面のヘッダーにドロップダウンメニューでダウンロード形式を選択。
App.tsxの `handleExport(format: 'pdf' | 'pptx', theme: string)` で両形式を統一処理：
- バックエンドに `action: 'export_pdf'` または `'export_pptx'` を送信 → Marp CLI で変換

※ `--pptx-editable`（編集可能PPTX）はLibreOffice依存のため未対応

**iOS Safari対応**: ドロップダウンメニューはCSS `:hover` ではなく `useState` によるクリック/タップベースで実装。iOS Safariでは `:hover` がタップで正しく動作しないため、`onClick` でメニューを開閉し、`touchstart` イベントで外側タップ時に閉じる処理を実装。

### ストリーミングUI実装パターン
```typescript
// メッセージを逐次更新（イミュータブル更新が必須）
setMessages(prev =>
  prev.map((msg, idx) =>
    idx === prev.length - 1 && msg.role === 'assistant'
      ? { ...msg, content: msg.content + chunk }
      : msg
  )
);
```

**注意**: シャローコピー（`[...prev]`）してオブジェクトを直接変更すると、React StrictModeで2回実行され文字がダブる。必ず `map` + スプレッド構文でイミュータブルに更新する。

### useMemoの依存配列バグ

派生値（derived value）を使った `useMemo` では、派生値自体を依存配列に含める必要がある。

```typescript
// 派生値を生成
const markdownWithTheme = useMemo(() => {
  if (!markdown) return '';
  // 旧スタイルのインラインディレクティブを統一クラスに正規化
  let normalized = markdown;
  normalized = normalized.replace(
    /<!-- _backgroundColor: #303030 -->\s*<!-- _color: white -->/g,
    '<!-- _class: lead -->'
  );
  // フロントマターのthemeを選択中テーマで上書き
  // ...
  return normalized;
}, [markdown, selectedTheme]);

// NG: 元の値だけ依存配列に入れると、selectedTheme変更で再計算されない
const slides = useMemo(() => {
  return renderSlides(markdownWithTheme);
}, [markdown]);  // ❌ markdownWithThemeの変更を検知できない

// OK: 派生値を依存配列に
const slides = useMemo(() => {
  return renderSlides(markdownWithTheme);
}, [markdownWithTheme]);  // ✅ selectedTheme変更 → markdownWithTheme変更 → slides再計算
```

**症状**: 状態を変えても UI が更新されない場合、`useMemo` の依存配列を疑う。

### useEffectの依存配列による無限ループ

useEffect内で変更する状態を依存配列に含めると、無限ループが発生する。

```typescript
// ❌ 無限ループ: isLoadingを依存配列に含めている
useEffect(() => {
  if (!trigger || isLoading) return;

  const sendRequest = async () => {
    setIsLoading(true);  // これで依存配列が変化 → useEffect再発火
    await doSomething();
    setIsLoading(false); // またisLoadingが変化 → 条件を満たして再実行
  };

  sendRequest();
}, [trigger, isLoading]);  // ❌ isLoadingが依存配列にある

// ✅ 正しい実装: 内部で変更する状態は依存配列から除外
useEffect(() => {
  if (!trigger || isLoading) return;

  const sendRequest = async () => {
    setIsLoading(true);
    await doSomething();
    setIsLoading(false);
  };

  sendRequest();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [trigger]);  // ✅ triggerの変化時のみ発火
```

**症状**: 特定のアクション後にAPIリクエストが無限に送信される。

**対策**:
- useEffect内で `setState` する状態は依存配列に含めない
- リファクタリング時は元のコードの依存配列を正確に維持する
- ESLintの警告は必要に応じて `eslint-disable-next-line` で抑制

### ステータスメッセージ後のテキスト表示

ツール使用後にLLMが追加のテキスト（エラー報告など）を返す場合、ステータスメッセージの後に新しいメッセージとして追加する処理が必要：

```typescript
onText: (text) => {
  setMessages(prev => {
    // ステータスメッセージと非ステータスメッセージの位置を探す
    let lastStatusIdx = -1;
    let lastTextAssistantIdx = -1;
    for (let i = prev.length - 1; i >= 0; i--) {
      if (prev[i].isStatus && lastStatusIdx === -1) lastStatusIdx = i;
      if (prev[i].role === 'assistant' && !prev[i].isStatus && lastTextAssistantIdx === -1) {
        lastTextAssistantIdx = i;
      }
    }
    // ステータスの後にテキストがなければ新規メッセージを追加
    if (lastStatusIdx !== -1 && lastTextAssistantIdx < lastStatusIdx) {
      return [...prev, { role: 'assistant', content: text, isStreaming: true }];
    }
    // それ以外は既存メッセージに追加
    // ...
  });
};
```

### シマーエフェクト（ローディングアニメーション）

「考え中...」などのステータステキストに光が左から右に流れるエフェクトを適用：

```css
/* src/index.css */
.shimmer-text {
  background: linear-gradient(
    90deg,
    #6b7280 0%,
    #6b7280 40%,
    #9ca3af 50%,
    #6b7280 60%,
    #6b7280 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shimmer 1.5s ease-in-out infinite;
}

@keyframes shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
```

使用例：
```tsx
<span className="shimmer-text font-medium">{status}</span>
```

### ReactMarkdownでのカーソル表示

ストリーミング中のカーソル（▌）をReactMarkdownの外側に配置すると、`<p>`タグの後に配置されて改行されてしまう。

```tsx
// NG: カーソルが次の行に折り返される
<ReactMarkdown>{message.content}</ReactMarkdown>
{message.isStreaming && <span>▌</span>}

// OK: カーソルをマークダウン文字列に含める
<ReactMarkdown>
  {message.content + (message.isStreaming ? ' ▌' : '')}
</ReactMarkdown>
```

### ReactMarkdownでリンクを新しいタブで開く

マークダウン内のリンクをクリックした時に新しいタブで開くには、`components`プロパティでカスタムリンクレンダラーを設定する。

```tsx
<ReactMarkdown
  components={{
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
  }}
>
  {message.content}
</ReactMarkdown>
```

**用途**: Xシェア機能のツイートリンクなど、外部サイトへのリンクを新しいタブで開く場合に使用。

### TypeScript型インポートエラー（Vite + esbuild）

**症状**:
```
Uncaught SyntaxError: The requested module '/src/hooks/useAgentCore.ts'
does not provide an export named 'ModelType'
```

**原因**: Vite + esbuild + TypeScriptの型エクスポートの相性問題
- `export type ModelType = ...` は型のみのエクスポートで、コンパイル後のJSには残らない
- esbuildは型のみのエクスポートを適切に処理しないことがある
- `isolatedModules`モード（Viteのデフォルト）で問題が起きやすい

**解決策**:

1. **型をローカルで定義**（シンプル、2-3箇所でしか使わない場合に推奨）
   ```typescript
   // types.ts 内で直接定義
   type ModelType = 'sonnet' | 'opus';  // MODEL_OPTIONS で実際に有効な選択肢を管理
   ```

2. **`import type` を使う**（多くのファイルで使う場合）
   ```typescript
   import type { ModelType } from './types';
   ```

**判断基準**:
- 2-3箇所でしか使わない → ローカル定義
- 多くのファイルで使う、頻繁に変更される → `import type` で一元管理

### タブ切り替え時の状態保持
```tsx
// NG: 条件レンダリングだとアンマウント時に状態が消える
{activeTab === 'chat' ? <Chat /> : <Preview />}

// OK: hiddenクラスで非表示にすれば状態が保持される
<div className={activeTab === 'chat' ? '' : 'hidden'}>
  <Chat />
</div>
<div className={activeTab === 'preview' ? '' : 'hidden'}>
  <Preview />
</div>
```

### フォーム要素の折り返し防止

モデルセレクターなどを追加すると、スマホ表示でボタンが狭くなりテキストが折り返されることがある。

```tsx
<button className="whitespace-nowrap px-4 sm:px-6 py-2">
  送信
</button>
```

**ポイント**:
- `whitespace-nowrap` → テキストの折り返しを防止
- `px-4 sm:px-6` → スマホではパディングを小さく

**注意**: `shrink-0`を使うとボタンが縮まなくなり、画面からはみ出す可能性があるので使用しない。

### useStreamingText の isStreaming チェック競合

`streamText` 関数でエラーメッセージをストリーミング表示する際、`isStreaming` をチェックしていると、`invokeAgent` 後の同期的な `setMessages` で `isStreaming: false` に設定されてしまい、ストリーミングが止まる。

```typescript
// NG: isStreamingチェックがあると、外部で先にfalseにされた場合に追加されなくなる
setMessages(prev =>
  prev.map((msg, idx) =>
    idx === prev.length - 1 && msg.role === 'assistant' && msg.isStreaming
      ? { ...msg, content: msg.content + char }
      : msg
  )
);

// OK: isStreamingチェックを削除
setMessages(prev =>
  prev.map((msg, idx) =>
    idx === prev.length - 1 && msg.role === 'assistant'
      ? { ...msg, content: msg.content + char }
      : msg
  )
);
```

**症状**: エラー発生時にDevToolsコンソールにはエラーが表示されるが、画面には何も表示されない。

**原因**: `onError` コールバック内の `streamText()` は非同期で実行されるが、`invokeAgent` 後の処理が先に実行されて `isStreaming: false` に設定される。

### SSEアイドルタイムアウト（削除済み）

以前はSSEストリームに2段階のアイドルタイムアウト（初回10秒/イベント間60秒）を設定していたが、コスト削減施策デプロイ時にSystem Prompt圧縮によるレスポンス時間変動で誤検知が発生したため、2026年2月に完全削除。現在の `sseParser.ts` はタイムアウトなしのシンプルな実装。
