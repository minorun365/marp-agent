# Marp（CLI・Core・テーマ）

## Marp CLI

### 基本情報
- Markdown からスライドを生成するツール
- PDF / HTML / PPTX 出力対応
- 公式: https://marp.app/

### Docker内での設定
```dockerfile
RUN apt-get update && apt-get install -y chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
```

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

### borderテーマ（コミュニティテーマ）

本プロジェクトで採用しているカスタムテーマ。

**特徴**:
- グレーのグラデーション背景（`#f7f7f7` → `#d3d3d3`）
- 濃いグレーの太枠線（`#303030`）
- 白いアウトライン
- Interフォント（Google Fonts）
- `<!-- _class: tinytext -->` で参考文献用の小さいテキスト対応

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

```css
/* src/index.css に追加 */
.marpit ul {
  list-style: disc !important;
}

.marpit ol {
  list-style: decimal !important;
}

/* ネストされたリストのスタイル */
.marpit ul ul,
.marpit ol ul {
  list-style: circle !important;
}

.marpit ul ul ul,
.marpit ol ul ul {
  list-style: square !important;
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
