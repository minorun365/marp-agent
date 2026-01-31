# テーマ選択機能 実装計画

> TODO #10 対応
> 作成日: 2026-01-30
> ステータス: **実装完了（テスト待ち）** ✅

## 概要

ユーザーがスライドのテーマを選択できる機能を追加する。

## 決定事項

### テーマ一覧（3種類）

| ID | 表示名 | 種類 | クラス指定 | 特徴 |
|----|--------|------|-----------|------|
| `border` | Border | 既存カスタム | なし | 白黒グラデーション＋太枠 |
| `gradient` | Gradient | コミュニティ | デフォルト（blue不使用） | カラフル対角グラデーション |
| `beam` | Beam | コミュニティ | デフォルト | LaTeX Beamer風、学術向け |

### テーマCSSの取得元

- `gradient`: https://raw.githubusercontent.com/rnd195/marp-community-themes/live/themes/gradient.css
- `beam`: https://raw.githubusercontent.com/rnd195/marp-community-themes/live/themes/beam.css

### ライセンス

- `gradient`: MIT License
- `beam`: GNU GPLv3

### UI配置

プレビュー画面のヘッダー**左側**にテーマ選択（ラベル＋ドロップダウン）を縦配置。

```
┌───────────────────────────────────────────────────────┐
│ テーマ                       [修正を依頼] [ダウンロード▼] │
│ [Border ▼]                                            │
└───────────────────────────────────────────────────────┘

各スライドカードの下部に「スライド 1/28」形式で表示
┌─────────────────┐
│                 │
│   スライド内容    │
│                 │
├─────────────────┤
│ スライド 1/28   │  ← 下部に配置
└─────────────────┘
```

### 状態管理

- 永続化なし（useState のみ）
- デフォルトテーマ: `border`

### PDF/PPTX出力

- プレビューで選択中のテーマで出力する
- フロントエンド → バックエンドに `theme` パラメータを渡す

---

## 実装タスク

### 1. テーマCSSファイル追加 ✅

#### 1-1. コミュニティテーマをダウンロード ✅

```bash
# gradient
curl -o src/themes/gradient.css \
  https://raw.githubusercontent.com/rnd195/marp-community-themes/live/themes/gradient.css

# beam
curl -o src/themes/beam.css \
  https://raw.githubusercontent.com/rnd195/marp-community-themes/live/themes/beam.css
```

#### 1-2. バックエンド用にコピー ✅

```bash
cp src/themes/gradient.css amplify/agent/runtime/
cp src/themes/beam.css amplify/agent/runtime/
```

#### 1-3. ファイル配置（完了後）

```
src/themes/
├── border.css     ← 既存
├── gradient.css   ← 新規
└── beam.css       ← 新規

amplify/agent/runtime/
├── border.css     ← 既存
├── gradient.css   ← 新規
└── beam.css       ← 新規
```

---

### 2. フロントエンド実装 ✅

#### 2-1. SlidePreview.tsx ✅

**変更内容**:

1. テーマCSSをインポート
```typescript
import borderTheme from '../themes/border.css?raw';
import gradientTheme from '../themes/gradient.css?raw';
import beamTheme from '../themes/beam.css?raw';
```

2. テーマ定義
```typescript
const THEMES = [
  { id: 'border', name: 'Border', css: borderTheme },
  { id: 'uncover', name: 'Uncover', css: null },  // Marp標準
  { id: 'gradient', name: 'Gradient', css: gradientTheme },
  { id: 'beam', name: 'Beam', css: beamTheme },
] as const;

type ThemeId = typeof THEMES[number]['id'];
```

3. 状態追加
```typescript
const [selectedTheme, setSelectedTheme] = useState<ThemeId>('border');
```

4. Marpレンダリング修正
```typescript
const marp = new Marp();
// 全カスタムテーマを登録
THEMES.forEach(theme => {
  if (theme.css) {
    marp.themeSet.add(theme.css);
  }
});
const { html, css } = marp.render(markdown);
```

5. UIにドロップダウン追加（左側）
```tsx
<div className="flex justify-between items-center px-6 py-4 border-b">
  <div className="flex items-center gap-4">
    <span className="text-sm text-gray-600">
      {slides.length} スライド
    </span>
    {/* テーマ選択 */}
    <select
      value={selectedTheme}
      onChange={(e) => setSelectedTheme(e.target.value as ThemeId)}
      className="text-sm border rounded px-2 py-1"
    >
      {THEMES.map(theme => (
        <option key={theme.id} value={theme.id}>{theme.name}</option>
      ))}
    </select>
  </div>
  {/* 右側のボタン群は変更なし */}
</div>
```

6. Props変更
```typescript
interface SlidePreviewProps {
  markdown: string;
  onDownloadPdf: (theme: string) => void;   // theme追加
  onDownloadPptx: (theme: string) => void;  // theme追加
  isDownloading: boolean;
  onRequestEdit?: () => void;
}
```

7. ダウンロード呼び出し修正
```typescript
onDownloadPdf(selectedTheme);
onDownloadPptx(selectedTheme);
```

#### 2-2. App.tsx ✅

**変更内容**:

1. ハンドラー修正
```typescript
const handleDownloadPdf = async (theme: string) => {
  // ...
  const blob = await exportFn(markdown, theme);
  // ...
};

const handleDownloadPptx = async (theme: string) => {
  // ...
  const blob = await exportFn(markdown, theme);
  // ...
};
```

#### 2-3. useAgentCore.ts ✅

**変更内容**:

1. exportPdf 関数修正
```typescript
export async function exportPdf(markdown: string, theme: string = 'border'): Promise<Blob> {
  // ...
  body: JSON.stringify({ action: 'export_pdf', markdown, theme }),
  // ...
}
```

2. exportPptx 関数修正
```typescript
export async function exportPptx(markdown: string, theme: string = 'border'): Promise<Blob> {
  // ...
  body: JSON.stringify({ action: 'export_pptx', markdown, theme }),
  // ...
}
```

3. モック関数も同様に修正

---

### 3. バックエンド実装 ✅

#### 3-1. agent.py ✅

**変更内容**:

1. generate_pdf 修正
```python
def generate_pdf(markdown: str, theme: str = 'border') -> bytes:
    """Marp CLIでPDFを生成"""
    # uncoverはMarp標準テーマ（CSSファイル不要）
    if theme == 'uncover':
        theme_option = ['--theme', 'uncover']
    else:
        theme_path = Path(__file__).parent / f"{theme}.css"
        if theme_path.exists():
            theme_option = ['--theme', str(theme_path)]
        else:
            theme_option = []

    cmd = [
        "marp",
        str(md_path),
        "--pdf",
        "--allow-local-files",
        "-o", str(pdf_path),
    ] + theme_option
    # ...
```

2. generate_pptx も同様に修正

3. invoke エンドポイント修正
```python
elif action == "export_pdf":
    markdown = payload.get("markdown", "")
    theme = payload.get("theme", "border")
    pdf_bytes = generate_pdf(markdown, theme)
    # ...

elif action == "export_pptx":
    markdown = payload.get("markdown", "")
    theme = payload.get("theme", "border")
    pptx_bytes = generate_pptx(markdown, theme)
    # ...
```

#### 3-2. Dockerfile ✅

**変更内容**:

```dockerfile
# 全テーマファイルをコピー
COPY *.css ./
```

---

### 4. マークダウンへのテーマ埋め込み ✅

プレビュー時、マークダウンの先頭にテーマ指定を注入する。

```typescript
// SlidePreview.tsx
const markdownWithTheme = useMemo(() => {
  if (!markdown) return '';

  // 既存のフロントマターを解析
  const frontMatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);

  if (frontMatterMatch) {
    // 既存のフロントマターにthemeを追加/上書き
    const frontMatter = frontMatterMatch[1];
    const hasTheme = /^theme:/m.test(frontMatter);

    if (hasTheme) {
      // 既存のthemeを置換
      const newFrontMatter = frontMatter.replace(/^theme:.*$/m, `theme: ${selectedTheme}`);
      return markdown.replace(frontMatterMatch[0], `---\n${newFrontMatter}\n---`);
    } else {
      // themeを追加
      return markdown.replace(frontMatterMatch[0], `---\n${frontMatter}\ntheme: ${selectedTheme}\n---`);
    }
  } else {
    // フロントマターがない場合は追加
    return `---\ntheme: ${selectedTheme}\n---\n\n${markdown}`;
  }
}, [markdown, selectedTheme]);
```

---

## 追加修正：Sandbox Identifier対応 ✅

### 問題

複数のsandboxを並列起動すると、AgentCore Runtime名が競合する。

### 調査で判明したこと

1. **`AMPLIFY_SANDBOX_IDENTIFIER` 環境変数は存在しない**（公式未提供）

2. **CDKスタック名から抽出は不可能**
   - 合成時点ではスタック名は `${Token[TOKEN.241]}` というトークン（遅延解決値）
   - CDKの仕様上、合成フェーズでスタック名を取得することは技術的に不可能

3. **CDKコンテキストに識別子が渡されている！** ← 解決策
   - Amplifyが `amplify-backend-name` にsandbox識別子を設定している
   - `agentCoreStack.node.tryGetContext('amplify-backend-name')` で取得可能

### 解決策

CDKコンテキストから直接 `amplify-backend-name` を取得する。

```typescript
// amplify/backend.ts
let nameSuffix: string;
if (isSandbox) {
  // CDKコンテキストからAmplifyが設定した識別子を取得
  const backendName = agentCoreStack.node.tryGetContext('amplify-backend-name') as string;
  nameSuffix = backendName || 'dev';
} else {
  nameSuffix = process.env.AWS_BRANCH || 'main';
}
```

これにより：
- `npx ampx sandbox` → `marp_agent_{ユーザー名}`（デフォルト）
- `npx ampx sandbox --identifier todo10` → `marp_agent_todo10`
- 本番（mainブランチ）→ `marp_agent_main`

### 関連するCDKコンテキストキー

| キー | 説明 | 例 |
|------|------|-----|
| `amplify-backend-name` | sandbox識別子（`--identifier` または `$(whoami)`） | `todo10` |
| `amplify-backend-namespace` | アプリ名 | `marpagent` |
| `amplify-backend-type` | デプロイタイプ | `sandbox` / `branch` |

### 参考リンク

- [aws-amplify/amplify-backend - CDKContextKey.ts](https://github.com/aws-amplify/amplify-backend/blob/main/packages/platform-core/src/cdk_context_key.ts)

### 二重管理にならない理由

「`--identifier` と `RUNTIME_SUFFIX` を同じ値で毎回揃える必要があるのでは？」という懸念があるが、**現状の実装では二重管理にならない**。

| やること | 管理場所 |
|---------|---------|
| 環境変数（APIキー等） | `.env` → `npm run sandbox` で自動読込 |
| identifier | `--identifier` → CDKコンテキストで自動取得 |

**ポイント**:
- `--identifier` を渡せば、CDKコンテキスト経由で `amplify-backend-name` として自動的に取得される
- 別途 `RUNTIME_SUFFIX` のような環境変数を用意する必要はない
- Amplifyが内部的にCDKコンテキストを設定しているため、公式ドキュメントには記載がないが動作する

---

## テスト項目

- [ ] 各テーマでプレビューが正しく表示される
- [ ] テーマ切り替えでプレビューが即座に更新される
- [ ] PDF出力が選択中のテーマで生成される
- [ ] PPTX出力が選択中のテーマで生成される
- [ ] iOS Safari でも正しく表示される（polyfill動作確認）

---

## バグ修正記録

### テーマ切り替えがプレビューに反映されない ✅ 修正済

**症状**: ドロップダウンでテーマを変えても、プレビューがずっとBorderのまま

**原因**: `SlidePreview.tsx` の `useMemo` 依存配列バグ

```typescript
// NG: markdownしか依存配列にないので、テーマ変更で再計算されない
}, [markdown]);

// OK: markdownWithTheme（テーマ注入済み）を依存配列に
}, [markdownWithTheme]);
```

**修正箇所**: `src/components/SlidePreview.tsx` 121行目

---

## 注意事項

1. **クラス指定について**
   - `gradient` テーマには `blue` クラスがあるが、デフォルト（クラス指定なし）を使用
   - `beam` テーマには `title` クラスがあるが、これはシステムプロンプトで案内（タイトルスライド用）

2. **ライセンス**
   - `beam` テーマは GPLv3 なので、ソースコード公開が必要
   - このプロジェクトはGitHubで公開済みなので問題なし

3. **フォント**
   - `gradient` は Google Fonts (Inter) をインポートしている
   - `beam` は Computer Modern Unicode を想定（なければ代替フォント）

---

## 参考リンク

- [Marp Community Themes](https://rnd195.github.io/marp-community-themes/)
- [Gradient Theme](https://rnd195.github.io/marp-community-themes/theme/gradient.html)
- [Beam Theme](https://rnd195.github.io/marp-community-themes/theme/beam.html)
- [Marpit ThemeSet API](https://marpit-api.marp.app/themeset)
