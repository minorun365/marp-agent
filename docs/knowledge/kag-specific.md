# KAGブランチ固有のナレッジ

kagブランチ固有の設定・注意点をここに記載する。

---

## KAGテーマ

### 概要

kagブランチで使用するMarpテーマ。KDDI Agile Development Center Corp.のプロプライエタリなデザイン。

### ライセンス

```
PROPRIETARY LICENSE
Copyright (c) 2026 KDDI Agile Development Center Corp.
All Rights Reserved.

This file is NOT covered by the MIT License.
```

**注意**: MITライセンス対象外。明示的な許可なく使用・配布不可。

### 特徴

- Marp defaultテーマをベースに拡張
- 背景画像がBase64埋め込み（ファイルサイズ: 約1.6MB）
- KAG独自のカラースキーム

### ファイル配置

| 場所 | 用途 |
|------|------|
| `src/themes/kag.css` | フロントエンド（Marp Core）用 |
| `amplify/agent/runtime/kag.css` | PDF/PPTX生成（Marp CLI）用 |

### テーマ切り替え

sandbox環境でkagテーマを使用する場合：

```bash
MARP_THEME=kag npm run sandbox
```

---

## KAGカラースキーム

### Tailwind CSS v4 カスタムカラー

```css
/* src/index.css */
@theme {
  --color-kag-blue: #0e0d6a;
}
```

### グラデーション

```css
/* KAGグラデーション（青系） */
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

---

## mainブランチとの差分

| 項目 | mainブランチ | kagブランチ |
|------|-------------|-------------|
| デフォルトテーマ | border | kag |
| カラースキーム | グレー系 | 青系グラデーション |
| 背景画像 | なし | Base64埋め込み |

---

## 参考

共通のナレッジ（SDK、CDK、フロントエンド実装等）はmainブランチの `docs/knowledge/` を参照。
