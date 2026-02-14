# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

「パワポ作るマン」- AIがMarp形式でスライドを自動生成するWebアプリ。AWS AmplifyとBedrock AgentCoreでフルサーバーレス構築。

## 開発コマンド

```bash
# AWS認証（サンドボックス起動前に必要）
aws sso login --profile sandbox

# フロントエンド起動（ローカル開発）
npm run dev

# サンドボックス起動（バックエンド込み、ブランチ名が識別子になる）
# ⚠️ 必ず .env を読み込んでから実行すること（TAVILY_API_KEYS等がCDKビルド時に必要）
export $(grep -v '^#' .env | grep -v '^$' | xargs) && npm run sandbox

# 認証スキップでUIのみ確認
VITE_USE_MOCK=true npm run dev

# リント
npm run lint

# ビルド
npm run build

# テスト（フロントエンド）
npm run test

# テスト（バックエンド）
python -m pytest tests/
```

## アーキテクチャ

```
[ブラウザ] ←→ [React + Tailwind] ←SSE→ [AgentCore Runtime]
                                              │
                                              ├── Strands Agent (Python)
                                              ├── Claude Sonnet 4.5 / Opus 4.6
                                              └── Marp CLI (PDF/PPTX/編集可能PPTX変換)
```

### ディレクトリ構成

| パス | 内容 |
|------|------|
| `src/` | Reactフロントエンド |
| `src/hooks/api/` | API呼び出し（agentCoreClient, exportClient） |
| `src/hooks/streaming/` | SSE処理（sseParser） |
| `src/hooks/mock/` | モックモード用（mockClient） |
| `src/components/Chat/` | チャットUI（index, ChatInput, ChatInput.test, MessageList, MessageBubble, StatusMessage, constants, types） |
| `src/components/Chat/hooks/` | Chat専用フック（useChatMessages, useStreamingText, useTipRotation） |
| `src/components/` | その他UIコンポーネント（SlidePreview, ShareConfirmModal, ShareResultModal） |
| `amplify/` | バックエンド定義（CDK） |
| `amplify/backend.ts` | エントリポイント（Auth, AgentCore, S3統合） |
| `amplify/agent/resource.ts` | AgentCore Runtime定義 |
| `amplify/agent/runtime/` | Pythonエージェント本体 |
| `amplify/agent/runtime/tools/` | ツール定義（output_slide, web_search, generate_tweet_url） |
| `amplify/agent/runtime/exports/` | PDF/PPTX変換（slide_exporter） |
| `amplify/agent/runtime/session/` | セッション管理（manager） |
| `amplify/agent/runtime/sharing/` | 共有機能（s3_uploader） |
| `amplify/storage/resource.ts` | 共有スライド用S3+CloudFront |
| `docs/knowledge/` | 詳細なナレッジベース（下記参照） |

### 主要な技術スタック

- **フロントエンド**: React 19 + Vite + Tailwind CSS v4
- **バックエンド**: Bedrock AgentCore + Strands Agents (Python)
- **認証**: Cognito（Amplify UI React）
- **IaC**: AWS CDK（Amplify経由）

## ナレッジベース

詳細な技術情報は `docs/knowledge/` に分割して蓄積。トラブルシューティングや実装パターンはこちらを参照。

| ファイル | 内容 |
|----------|------|
| [setup.md](docs/knowledge/setup.md) | 使用ライブラリ、Python環境管理（uv） |
| [backend.md](docs/knowledge/backend.md) | AgentCore SDK、Strands Agents、セッション管理、Observability |
| [cdk.md](docs/knowledge/cdk.md) | AgentCore CDK、Hotswap、deploy-time-build |
| [marp.md](docs/knowledge/marp.md) | Marp CLI、テーマ、Marp Core |
| [frontend.md](docs/knowledge/frontend.md) | React、Tailwind CSS、フロントエンド構成 |
| [amplify.md](docs/knowledge/amplify.md) | Amplify Gen2、Cognito認証、ビルド設定 |
| [features.md](docs/knowledge/features.md) | API接続、シェア機能、共有機能、ローカル開発 |
| [temporary-cost-reduction.md](docs/temporary-cost-reduction.md) | コスト削減計画書（施策一覧、実装ログ、効果測定） |

## CloudWatch Logs 調査

CloudWatch Logs の調査には以下の優先順位で手段を選択する：

### 1. CloudWatch MCP サーバー（推奨）

`awslabs-cloudwatch-mcp-server` の MCP ツールを使う。`mcp__awslabs-cloudwatch-mcp-server__*` で自動承認済み。
- `describe_log_groups` → `execute_log_insights_query` → `get_logs_insight_query_results` の流れで調査する
- ログ調査をサブエージェントに委任する場合は `app-test-debug-agent` や `general-purpose` など MCP アクセス可能なエージェントを使う

### 2. Bash フォールバック（MCP が disconnected の場合）

MCP サーバーが利用できない場合のみ、Bash で `aws logs` コマンドを使う。**以下のルールを必ず守ること：**

- **コマンドは必ず `aws` で始める**（先頭にコメント `#` や `sleep` を付けない）
- **1つの Bash 呼び出しに1つの aws コマンド**（複数コマンドを `&&` や改行で繋げない）
- 理由: 自動承認パターン `Bash(aws:*)` は、コマンドの**先頭が `aws` で始まる単一行コマンド**にのみマッチする。複数行コマンドやコメント付きコマンドはマッチせず手動承認になる

## AWS Amplify 環境変数の更新

**重要**: AWS CLI で Amplify のブランチ環境変数を更新する際、`--environment-variables` パラメータは**上書き**であり**マージではない**。

### 正しい手順

1. **既存の環境変数を取得**
   ```bash
   aws amplify get-branch --app-id {appId} --branch-name {branch} --region {region} \
     --query 'branch.environmentVariables' --output json
   ```

2. **既存 + 新規をすべて指定して更新**
   ```bash
   aws amplify update-branch --app-id {appId} --branch-name {branch} --region {region} \
     --environment-variables KEY1=value1,KEY2=value2,NEW_KEY=new_value
   ```

### NG例（既存変数が消える）

```bash
# これだと既存の環境変数がすべて消えてNEW_KEY=valueだけになる
aws amplify update-branch --environment-variables NEW_KEY=value
```

### 補足

- **アプリレベルの環境変数**（`aws amplify get-app`）はブランチ更新で消えない
- **ブランチレベルの環境変数**（`aws amplify get-branch`）は上書きされる

## E2Eテスト手順

コード変更後のE2Eテストは以下の手順で実施する。Chrome DevTools MCPを使用してブラウザ操作を自動化する。

### 手順

1. **SSOセッション確認**: `aws sts get-caller-identity --profile sandbox`
2. **サンドボックス起動**: `npm run sandbox` をバックグラウンド実行（`--profile sandbox` はスクリプトに内蔵済み）
3. **フロントエンド起動**: `npm run dev`（別プロセスでバックグラウンド実行）
4. **Chrome DevTools MCPで確認**:
   - `localhost:5173` にアクセス
   - ログインページの表示確認
   - テスト用ユーザーでログイン（`.env`のTEST_USER_EMAIL/TEST_USER_PASSWORD使用）
   - モデルセレクターの表示・選択肢確認
   - スライド生成の動作確認（必要に応じて）
5. **テスト完了後**: 起動したプロセスを停止

### 注意事項

- サンドボックスのデプロイには3-5分かかる（Hotswap時は30秒程度）
- `npm run sandbox` には `--profile sandbox` がスクリプトに内蔵済み（追加不要）
- **⚠️ 環境変数の読み込み【必須】**: `npm run sandbox` は `.env` を自動読み込みしない。**サンドボックス起動時は必ず以下のワンライナーを使うこと**（`npm run sandbox` を単体で実行してはならない）：
  ```bash
  export $(grep -v '^#' .env | grep -v '^$' | xargs) && npm run sandbox
  ```
- **デプロイ完了の確認**: サンドボックスをバックグラウンド起動した後は、`tail -3` で**10〜15秒間隔**でこまめにポーリングし、`Watching for file changes...` が表示されるまで確認すること。**`TaskOutput` のブロッキング待機は使わない**（ユーザーが待たされるため）

## Git コミットルール

- コミットメッセージは **1行の日本語でシンプルに**
- `Co-Authored-By: Claude` などの **AI協働の痕跡は入れない**

## kag環境（別リポジトリ）

kagは完全に別のGitHubリポジトリ（`minorun365/marp-agent-kag`）で管理されている（ローカル: `../marp-agent-kag`）。

kagに変更を反映する際は、**kagリポジトリに移動してチェリーピック** する（`/sync-to-kag` スキル参照）：

```bash
cd ../marp-agent-kag
git fetch upstream
git cherry-pick <commit-hash>
git push origin main
```

**注意**: kagのドキュメント（`docs/`）は差分のみ記載する方針。mainのドキュメント変更はチェリーピック対象外。

## リリース管理（セマンティックバージョニング）

mainブランチへの機能追加デプロイ後、リリースを作成する。

### バージョン番号の決め方

| 種類 | 例 | 用途 |
|------|-----|------|
| メジャー | v1.0.0 → v2.0.0 | 破壊的変更 |
| マイナー | v1.0.0 → v1.1.0 | 新機能追加 |
| パッチ | v1.0.0 → v1.0.1 | バグ修正 |

### リリース作成手順

1. `git log <前回タグ>..HEAD --oneline` で前回リリースからの全コミットを確認
2. コミット内容を分類してリリースノート本文を作成
3. `--notes` オプションで本文を指定してリリース作成（`--generate-notes` は使わない）

```bash
gh release create vX.Y.Z --title "vX.Y.Z 変更内容の要約" --notes "$(cat <<'EOF'
## 新機能
- 機能の説明

## 改善
- 改善の説明

## バグ修正
- 修正の説明

**Full Changelog**: https://github.com/minorun365/marp-agent/compare/v前回...vX.Y.Z
EOF
)"
```

### リリースノートのルール

- **`--generate-notes` は使わない**（中身スカスカになるため、必ず手書きする）
- **絵文字は使用しない**（シンプルに保つ）
- 「新機能」「改善」「バグ修正」のカテゴリに分類する
- 各項目は具体的に何が変わったかを書く（コミットメッセージのコピペではなく、ユーザー視点で）

### リリース対象外

- ドキュメントのみの変更
- CI/CD・開発環境の設定変更
- **kagブランチ**（リリースは作成しない）
