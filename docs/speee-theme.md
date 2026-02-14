# Speeeテーマ導入計画書

## 概要

[marp-speee-theme](https://github.com/speee/marp-speee-theme) は株式会社Speeeが公開しているMarp用デザインテーマ。紺色×白の洗練されたカラースキームで、ビジネス向けスライドに適している。

## テーマの特徴

| 項目 | 内容 |
|------|------|
| テーマ名 | `speee` |
| ベース | Marp公式 Gaia テーマ |
| カラー | 紺色（`#003981`）× 白 |
| フォント | Lato + Noto Sans JP + Roboto Mono（Google Fonts） |
| レイアウト | 16:9（1280x720）/ 4:3（960x720） |
| 特殊クラス | `.lead`（表紙・セクション区切り用、グラデーション背景） |
| コードハイライト | highlight.js `tomorrow-night-blue` |
| ライセンス | MIT（ただしロゴ画像は除外） |

### スライドデザイン

- **通常スライド**: 白背景 + 紺色テキスト + 上部グラデーションバー
- **Leadスライド**: 紺→水色グラデーション背景 + 白テキスト + 中央揃え

## ライセンスに関する注意事項

### MIT License の範囲

CSS/SCSSコード自体はMITライセンスで、改変・再配布・商用利用すべてOK。

```
MIT License
Copyright (c) 2021 株式会社Speee (Speee, Inc.)
```

### ロゴ画像はMITライセンスの対象外

リポジトリの `SPEEE_LOGO` ファイルに明記：

> Speee 企業ロゴは株式会社 Speee が独占的な権利を保持するため、
> Speee 社員が株式会社 Speee の企業活動の一部として資料を作成する場合以外で
> ロゴを使用したい場合は弊社までお問い合わせください。

### アプリに組み込む際の対応事項

| 項目 | 対応 | 備考 |
|------|------|------|
| CSSコードの利用 | OK | MITライセンスで許可 |
| ロゴ画像の同梱 | NG | 削除必須 |
| CSS内のロゴURL参照 | 削除必須 | `background-image` の2箇所 |
| 著作権表示の保持 | 必須 | MITライセンスの条件 |

> **結論**: MITライセンスなのでCSSコードの利用・改変・商用利用はすべて合法。ロゴ画像さえ削除すれば、Webアプリに組み込んで公開して問題ない。著作権表示（CSSコメント内）は残すこと。

## 実装状況

### 完了した作業

#### 1. テーマCSSファイルの作成（ロゴ削除済み）

| 配置先 | ファイル | 状態 |
|--------|----------|------|
| フロントエンド | `src/themes/speee.css` | 完了 |
| バックエンド | `amplify/agent/runtime/speee.css` | 完了 |

CSS変更箇所:
- `section` の `background-image` 等4プロパティ削除（通常スライドのロゴ）
- `section.lead` の `background-image` からロゴURL削除、グラデーションのみ残す

#### 2. フロントエンドにテーマ登録

| ファイル | 変更内容 | 状態 |
|----------|----------|------|
| `src/components/SlidePreview.tsx` | THEMES配列にSpeee追加、テーマ状態を外部props化 | 完了 |
| `src/App.tsx` | `selectedTheme`状態を管理、Chat/SlidePreviewに渡す | 完了 |

#### 3. テーマ別システムプロンプト対応

エージェントがテーマに応じたスライド構成指示を使うようにした。

| ファイル | 変更内容 | 状態 |
|----------|----------|------|
| `src/components/Chat/types.ts` | `theme` propを追加 | 完了 |
| `src/components/Chat/index.tsx` | themeを受け取りuseChatMessagesに渡す | 完了 |
| `src/components/Chat/hooks/useChatMessages.ts` | themeをinvokeAgentに渡す | 完了 |
| `src/hooks/api/agentCoreClient.ts` | APIリクエストにthemeパラメータ追加 | 完了 |
| `src/hooks/mock/mockClient.ts` | シグネチャ合わせ | 完了 |
| `amplify/agent/runtime/config.py` | `get_system_prompt(theme)` でテーマ別プロンプト生成 | 完了 |
| `amplify/agent/runtime/session/manager.py` | テーマをキャッシュキーに含めて初期化 | 完了 |
| `amplify/agent/runtime/agent.py` | themeを`get_or_create_agent`に渡す | 完了 |

全テーマで統一されたディレクティブを使用:

| 用途 | ディレクティブ |
|------|-------------|
| タイトルスライド | `<!-- _class: lead --><!-- _paginate: skip -->` |
| セクション区切り | `<!-- _class: lead -->` |
| 参考文献スライド | `<!-- _class: tinytext -->` |

### テスト結果

| テスト項目 | 結果 | 備考 |
|-----------|------|------|
| ビルド成功 | OK | `npm run build` 通過 |
| テーマセレクターにSpeee表示 | OK | 4テーマ選択可能 |
| プレビューのCSS適用 | OK | 白背景＋紺テキスト＋グラデーションバー |
| ロゴ非表示 | OK | img要素ゼロ確認済み |
| APIにtheme送信 | OK | リクエストボディに `"theme":"speee"` を確認 |
| タイトルスライドにlead適用 | OK | 紺色グラデーション背景＋白テキスト＋中央揃え |
| セクション区切りにlead適用 | OK | `_backgroundColor: #303030` の混在なし |
| 通常スライド | OK | 白背景＋紺テキスト＋上部グラデーションバー |

### 利用上の注意

- **テーマは生成後でも自由に切り替え可能**: 全テーマで統一されたCSSクラスベースのディレクティブ（`<!-- _class: lead -->`等）を使用しているため、スライド生成後にプレビューでテーマを切り替えても表示が正しく更新される
- 旧スタイルのディレクティブ（`<!-- _backgroundColor: #303030 --><!-- _color: white -->`）で生成された既存スライドも、フロントエンドで自動的に正規化される

## 既存テーマとの比較

| テーマ | 背景 | テキスト色 | 特徴 |
|--------|------|-----------|------|
| Border | グレーグラデーション | 黒 | 太枠線、シンプル |
| Gradient | 紫〜青グラデーション | 白 | 鮮やかな背景 |
| Beam | 白 | 黒 | 学会風、コーナーバー |
| **Speee** | **白（通常）/ 紺グラデーション（Lead）** | **紺（通常）/ 白（Lead）** | **ビジネス向け、2モード** |

## リスク・注意点

- SpeeeテーマはGaiaベース（`@import "default"` ではなく独自定義）のため、他テーマと比べてCSSが大きい（約200行 vs 70行）
- Google Fontsを3種類読み込むため、初回表示が若干遅くなる可能性あり（ただし既存テーマもGoogle Fonts使用済み）
- highlight.jsのCDN読み込みあり（コードブロックのハイライト用）
