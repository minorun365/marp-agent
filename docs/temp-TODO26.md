# 引き継ぎファイル（一時）

作成日時: 2026-01-30 22:00頃
更新日時: 2026-01-31 02:10頃

## 現在のタスク

**#26 Kimiに変えてみる** - ✅ 実装完了、Amplifyデプロイ済み

## 状況サマリー

Strands AgentsでMoonshot AI (Kimi K2 Thinking) の動作確認完了。フロントエンドUIでモデル切り替え機能を実装し、feature/kimiブランチでAmplifyデプロイ完了。

## 今回のセッションで対応した内容

### 1. モデルセレクターUIの改善
- ドロップダウンメニューに▾が表示される問題を修正
- `<option>`から▾を削除し、別の`<span>`で表示
- 矢印のサイズ調整（`text-xl`）、間隔調整

### 2. 会話中のモデル切り替え無効化
- モデルを変えると別Agentになり履歴が引き継がれない
- ユーザー発言があったらセレクターを無効化
- `messages.some(m => m.role === 'user')` で判定（初期メッセージ除外）

### 3. ブランチ名のサニタイズ
- `feature/kimi` のスラッシュがRuntime名エラーの原因に
- `branchName.replace(/[^a-zA-Z0-9_]/g, '_')` で `feature_kimi` に変換

### 4. スマホ表示の送信ボタン調整
- モデルセレクター追加で送信ボタンが狭くなる問題
- `whitespace-nowrap` で折り返し防止
- `px-4 sm:px-6` でスマホ時のパディングを小さく
- ※ `shrink-0` は画面からはみ出すので使用しない

### 5. スマホ表示でモデルセレクターを簡略化
- スマホではモデル名が幅を取りすぎる問題
- スマホ（sm未満）: 矢印▾のみ表示
- PC（sm以上）: モデル名+矢印を表示
- `w-0 sm:w-auto` でレスポンシブ切り替え

## 解決済みの問題

### 1. cache_prompt/cache_tools非対応 ✅ 解決済み

**症状**: `AccessDeniedException: You invoked an unsupported model or your request did not allow prompt caching.`

**原因**: Kimi K2 ThinkingはBedrockModelの`cache_prompt`と`cache_tools`をサポートしていない

**解決策**: BedrockModelの設定からキャッシュオプションを削除

### 2. 環境変数がコンテナに反映されない ✅ 解決済み

**原因**: AgentCore Hotswapは環境変数の変更を反映しない

**解決策**: sandbox deleteで完全削除してから再起動

### 3. TypeScript型インポートエラー ✅ 解決済み

**原因**: Vite + esbuild + TypeScriptの型エクスポートの相性問題

**解決策**: Chat.tsx内でローカルに型定義

### 4. AgentCore Runtime重複エラー ✅ 解決済み

**原因**: 前回のsandboxで作成されたAgentCore Runtimeが残っている

**解決策**: CLIでRuntimeを削除してからsandbox再起動

### 5. ブランチ名にスラッシュが含まれる場合のRuntime名エラー ✅ 解決済み

**症状**: `[ValidationError] Runtime name must start with a letter and contain only letters, numbers, and underscores`

**原因**: `feature/kimi` の `/` がRuntime名に使えない

**解決策**: ブランチ名をサニタイズ（`/` → `_`）

## 実装詳細

### バックエンド（agent.py）
- リクエストペイロードから `model_type` を取得（デフォルト: `"claude"`）
- `_get_model_config(model_type)`: モデルごとの設定を返す
- `_create_bedrock_model(model_type)`: BedrockModelを作成
- `get_or_create_agent(session_id, model_type)`: キャッシュキーに `session_id:model_type` を使用

### フロントエンド（Chat.tsx）
- `modelType` state を追加（`"claude"` | `"kimi"`）
- 入力欄の左端にセレクター配置（矢印は別要素）
- 会話中（ユーザー発言後）はセレクター無効化
- `invokeAgent` に `modelType` を渡す

### インフラ（backend.ts）
- ブランチ名をサニタイズしてRuntime名に使用

## 関連ファイル

| ファイル | 状態 |
|---------|------|
| `amplify/agent/runtime/agent.py` | ✅ 変更済み |
| `amplify/backend.ts` | ✅ 変更済み（ブランチ名サニタイズ追加） |
| `src/components/Chat.tsx` | ✅ 変更済み（モデル選択UI、無効化ロジック） |
| `src/hooks/useAgentCore.ts` | ✅ 変更済み |
| `docs/KNOWLEDGE.md` | ✅ 更新済み |

## ブランチ状況

| ブランチ | 状態 | 用途 |
|---------|------|------|
| `feature/kimi` | ✅ デプロイ済み | #26 Kimi K2テスト |
| `main` | 未反映 | 本番（PRマージ待ち） |
| `kag` | 未反映 | Kimi専用環境 |

## 次のステップ

1. feature/kimiで動作確認
2. 問題なければmainにPRマージ
3. 必要に応じてkagにも反映
