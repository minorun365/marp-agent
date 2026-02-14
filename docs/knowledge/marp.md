# Marp（CLI・Core・テーマ）

## Marp CLI

### 基本情報
- Markdown からスライドを生成するツール
- PDF / HTML / PPTX 出力対応
- 公式: https://marp.app/

### Docker内での設定
```dockerfile
RUN apt-get update && apt-get install -y chromium libreoffice-impress
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
```

### 編集可能PPTX（`--pptx-editable`）

`--pptx --pptx-editable` オプションで、PowerPointでテキスト編集可能なPPTXを生成できる（実験的機能）。

- **依存関係**: LibreOffice Impress が必要（Dockerfileに `libreoffice-impress` を追加）
- **仕組み**: Marp CLI が内部でLibreOfficeを使って画像ベースPPTXを編集可能形式に変換
- **制約**: テーマのスタイルが崩れる場合がある（画像ベースPPTXの方が再現度は高い）
- **タイムアウト**: LibreOffice変換に時間がかかるため `timeout=120` を設定

### Marp フロントマター
```yaml
---
marp: true
theme: border
size: 16:9
paginate: true
---
```

### 組み込みテーマ
| テーマ | 特徴 |
|--------|------|
| default | シンプルな白背景 |
| gaia | クラシックなデザイン |
| uncover | ミニマル・モダン |

### テーマ統一ディレクティブ

全テーマ（border, gradient, beam, speee）で統一されたCSSクラスベースのディレクティブを使用。テーマ切り替え時の互換性を確保。

| 用途 | ディレクティブ |
|------|-------------|
| タイトルスライド | `<!-- _class: top --><!-- _paginate: skip -->` |
| セクション区切り | `<!-- _class: lead -->` |
| 裏表紙 | `<!-- _class: end --><!-- _paginate: skip -->` |
| 参考文献スライド | `<!-- _class: tinytext -->` |

各テーマのCSSで `.top` / `.lead` / `.end` / `.tinytext` クラスをテーマの世界観に合わせてスタイリングしている。

### borderテーマ（コミュニティテーマ）

本プロジェクトで採用しているカスタムテーマ。

**特徴**:
- グレーのグラデーション背景（`#f7f7f7` → `#d3d3d3`）
- 濃いグレーの太枠線（`#303030`）
- 白いアウトライン
- Interフォント（Google Fonts）
- `.lead`: 暗い枠線色（`#303030`）背景 + 白テキスト + 中央揃え
- `.tinytext`: 参考文献用の小さいテキスト

**ファイル配置**:
- `src/themes/border.css` - フロントエンド（Marp Core）用
- `amplify/agent/runtime/border.css` - PDF/PPTX生成（Marp CLI）用

**参考**: https://rnd195.github.io/marp-community-themes/theme/border.html

### カスタムテーマのBase64埋め込み

背景画像を含むテーマをポータブルにするには、Base64データURIに変換して埋め込む：

```bash
# 画像をBase64変換
base64 -i background.png | tr -d '\n' > bg_b64.txt

# CSSのURL置換
url('../img/background.png')
↓
url('data:image/png;base64,{Base64データ}')
```

**注意**: 画像が複数あるとCSSファイルが数MB級になる。Git管理には注意。

### Gaiaベーステーマの注意点（Speee等）

`@import "default"` を使わないGaiaベースのテーマは、リスト余白やビュレット位置のデフォルトスタイルが欠落する。以下を明示的に設定する必要がある：

```css
/* リストの左パディングとビュレット位置 */
ul, ol {
  padding-left: 0;
  list-style-position: inside;
  margin-top: 0.6em;
}

/* ネストリストのインデント */
ul ul, ul ol, ol ul, ol ol {
  padding-left: 1.5em;
  margin-top: 0;
}
```

### ブランチ別テーマ切り替え

環境変数でテーマを切り替える実装パターン：

```typescript
// amplify/backend.ts
const themeName = process.env.MARP_THEME || (branchName === 'kag' ? 'kag' : 'border');
```

| 環境 | コマンド | テーマ |
|------|---------|--------|
| sandbox | `npx ampx sandbox` | border |
| sandbox | `MARP_THEME=kag npx ampx sandbox` | kag |
| 本番 | Amplify Console | ブランチ名で自動判定 |

**フロントエンド側**:
```typescript
// SlidePreview.tsx
import borderTheme from '../themes/border.css?raw';
import kagTheme from '../themes/kag.css?raw';
import outputs from '../../amplify_outputs.json';

const themeName = outputs.custom?.themeName || 'border';
const themeMap = { border: borderTheme, kag: kagTheme };
const currentTheme = themeMap[themeName] || borderTheme;

marp.themeSet.add(currentTheme);
```

---

## Marp Core（フロントエンド用）

### インストール
```bash
npm install @marp-team/marp-core
```

### ブラウザでのレンダリング
```typescript
import Marp from '@marp-team/marp-core';

const marp = new Marp();
const { html, css } = marp.render(markdown);

// SVG要素をそのまま抽出（DOM構造を維持）
const parser = new DOMParser();
const doc = parser.parseFromString(html, 'text/html');
const svgs = doc.querySelectorAll('svg[data-marpit-svg]');
```

### スライドプレビュー表示
```tsx
<style>{css}</style>
<div className="marpit w-full h-full [&>svg]:w-full [&>svg]:h-full">
  <div dangerouslySetInnerHTML={{ __html: svg.outerHTML }} />
</div>
```

**注意点**:
- `section`だけ抽出するとCSSセレクタがマッチしない（`div.marpit > svg > foreignObject > section`構造が必要）
- SVG要素をそのまま使い、`div.marpit`でラップする
- SVGにはwidth/height属性がないため、CSSで`w-full h-full`を指定

### スマホ対応（レスポンシブ）

MarpのSVGは固定サイズ（1280x720px）の`width`/`height`属性を持っているため、スマホの狭い画面では見切れてしまう。

**解決策**: SVGの属性を動的に変更してレスポンシブ対応

```typescript
// SlidePreview.tsx
const svgs = doc.querySelectorAll('svg[data-marpit-svg]');

return {
  slides: Array.from(svgs).map((svg, index) => {
    // SVGのwidth/height属性を100%に変更してレスポンシブ対応
    svg.setAttribute('width', '100%');
    svg.removeAttribute('height');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    return {
      index,
      html: svg.outerHTML,
    };
  }),
  css,
};
```

**ポイント**:
- `width`と`height`を`100%`に設定 → 親要素にフィット
- `preserveAspectRatio="xMidYMid meet"` → アスペクト比を維持しつつ収まるように
- CSSの`!important`よりもSVG属性の直接変更が確実

### Tailwind CSS との競合

#### invertクラスの競合
Marpの`class: invert`とTailwindの`.invert`ユーティリティが競合する。

```css
/* src/index.css に追加 */
.marpit section.invert {
  filter: none !important;
}
```

これでTailwindの`filter: invert(100%)`を無効化し、Marpのダークテーマが正しく表示される。

#### 箇条書き（リストスタイル）の競合
Tailwind CSS v4のPreflight（CSSリセット）が`list-style: none`を適用するため、Marpスライド内の箇条書きビュレット（●○■）が消える。

**注意**: `list-style`（ショートハンド）ではなく `list-style-type`（個別プロパティ）を使うこと。ショートハンドだと `list-style-position` も暗黙的にリセットされ、テーマ側の設定が上書きされる。

```css
/* src/index.css に追加 */
.marpit ul {
  list-style-type: disc !important;
}

.marpit ol {
  list-style-type: decimal !important;
}

/* ネストされたリストのスタイル */
.marpit ul ul,
.marpit ol ul {
  list-style-type: circle !important;
}

.marpit ul ul ul,
.marpit ol ul ul {
  list-style-type: square !important;
}
```

### Marp記法の注意点

#### `==ハイライト==` 記法は使用禁止
Marpの `==テキスト==` ハイライト記法は、日本語のカギカッコと組み合わせるとレンダリングが壊れる。

```markdown
<!-- NG: 正しく表示されない -->
==「重要」==

<!-- OK: 太字を使う -->
**「重要」**
```

システムプロンプトで禁止指示済み。

### テーマCSS設計の注意点

#### CSS変数の副作用
leadクラスなどでCSS変数（`--color-foreground`等）を上書きすると、そのセクション内の全テキスト色が変わる。意図しない要素まで影響を受けるため、CSS変数の変更範囲を意識すること。

#### 見出しのfont-weight設計
- タイトルスライドの`h1`（タイトル）と`h2`（サブタイトル）は別々にスタイリングすべき。`h1`のみ太字（`font-weight: 900`）、`h2`は`font-weight: normal`で視覚的階層を作る
- HTMLの見出し（`h2`等）はブラウザデフォルトで太字（`bold`）になる。太字にしたくない場合は`font-weight: normal`を明示的に指定する必要がある

#### テーマファイルの2箇所管理
runtime用CSS（`amplify/agent/runtime/`）とフロントエンド用CSS（`src/themes/`）の2箇所にテーマファイルが存在する。`npm run copy-themes`で同期する運用のため、片方だけ編集すると不整合が起きる。
