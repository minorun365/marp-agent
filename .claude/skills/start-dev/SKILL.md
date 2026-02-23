---
name: start-dev
model: sonnet
description: Amplifyサンドボックス（バックエンド）を起動し、完了後にフロントエンドもローカル起動する
argument-hint: [環境名: main (デフォルト) / kag]
allowed-tools: Bash(npm run copy-themes:*), Bash(npx ampx sandbox:*), Bash(npm run dev:*), Bash(export:*), Bash(tail:*), Bash(lsof:*), Bash(git:*), Bash(aws sts:*)
---

# ローカル開発環境の起動

Amplifyサンドボックス（バックエンド）とフロントエンド（Vite dev server）を順番に起動する。

## 使い方

```
/start-dev          # main環境（デフォルト）
/start-dev kag      # KAG環境
```

## 環境設定

`$ARGUMENTS` に応じて対象環境を決定する。

| 環境 | 引数 | リポジトリ | AWSプロファイル |
|------|------|-----------|----------------|
| main | （なし）または `main` | カレントディレクトリ（marp-agent） | `sandbox` |
| kag | `kag` | `../marp-agent-kag`（marp-agentからの相対パス） | `kag-sandbox` |

## 実行手順

### Step 0: 環境変数の決定

`$ARGUMENTS` を解析して以下の変数を決定する：

- **REPO_DIR**: 対象リポジトリのパス
  - main → カレントワーキングディレクトリ（Claude Codeのプロジェクトルート）
  - kag → カレントワーキングディレクトリから `../marp-agent-kag`
- **AWS_PROFILE**: AWSプロファイル名
  - main → `sandbox`
  - kag → `kag-sandbox`
- **ENV_LABEL**: 表示用の環境名（「main」「kag」）

### Step 1: 前提条件チェック

以下を並列で確認する：

```bash
# ポート確認
lsof -i :5173 2>/dev/null | grep LISTEN || echo "フロントエンド: 未起動"

# SSOセッション確認
aws sts get-caller-identity --profile <AWS_PROFILE>

# .env確認
test -f <REPO_DIR>/.env && echo ".env: OK" || echo ".env: 見つかりません"
```

### Step 2: 現在のブランチを確認・表示

```bash
git -C <REPO_DIR> branch --show-current
```

ユーザーに「{ENV_LABEL}環境の{ブランチ名}ブランチでサンドボックスを起動します」と報告する。

### Step 3: .env を読み込んでサンドボックスを起動

**重要**: `npm run sandbox` はプロファイルがハードコードされている（`--profile sandbox`）ため使用しない。代わりにコマンドを直接組み立てる。

以下のワンライナーをバックグラウンドで実行する：

```bash
cd <REPO_DIR> && export $(grep -v '^#' .env | grep -v '^$' | xargs) && npm run copy-themes && BRANCH=$(git branch --show-current | tr '/' '-') && npx ampx sandbox --identifier "sb-${BRANCH}" --profile <AWS_PROFILE>
```

- `run_in_background: true` で起動すること
- このプロセスのタスクIDを記録しておく

### Step 4: サンドボックスの起動完了をポーリング

**10秒間隔**でこまめにポーリングし、起動完了を素早く検知する。

```bash
tail -3 <output_file>
```

- `Watching for file changes...` が表示されたら起動完了
- Hotswapの場合は30秒程度、フルデプロイの場合は3〜5分かかる
- **TaskOutput のブロッキング待機は絶対に使わない**（ユーザーが待たされるため）
- ポーリングの合間にユーザーへ経過報告する（「まだデプロイ中です...」など）
- エラー（`Error`、`failed`、`ROLLBACK`）が出たらポーリングを中止してユーザーに報告

### Step 5: フロントエンドを起動

サンドボックスの起動完了を確認後、フロントエンドをバックグラウンドで起動する：

```bash
cd <REPO_DIR> && npm run dev
```

- `run_in_background: true` で起動すること
- 起動後、`tail -3` で `Local: http://localhost:5173/` が表示されれば成功

### Step 6: 完了報告

両方の起動が完了したら、ユーザーに以下を報告する：

```
ローカル開発環境が起動しました！（{ENV_LABEL}環境 / {ブランチ名}ブランチ）
- バックエンド: Amplify サンドボックス（起動済み）
- フロントエンド: http://localhost:5173/
```

## エラーハンドリング

| エラー | 対応 |
|--------|------|
| `.env` が存在しない | ユーザーに `.env` の作成を促す |
| SSOセッション切れ | `aws sso login --profile <AWS_PROFILE>` の実行を促す |
| ポート5173が使用中 | 既存プロセスの停止を提案する |
| サンドボックスがエラーで停止 | エラーログを表示してユーザーに報告する |
| リポジトリが存在しない | KAG用リポジトリのクローンを案内する |

## 注意事項

- **`npm run sandbox` は使わない**: プロファイルがハードコードされているため、環境に応じた柔軟な起動ができない。代わりに `npx ampx sandbox` を直接実行する
- ポーリングは必ず **10秒間隔** で行うこと（15秒以上空けない）
- Hotswap時は30秒程度で完了するので、最初のポーリングから注意深く確認する
- デプロイ中のログに `hotswapping` や `Hotswap` が含まれていればHotswapモード
- リポジトリパスはカレントディレクトリからの相対パスで解決するため、PCごとのユーザー名の違いに影響されない
- 異なるブランチで作業中の場合、そのブランチの識別子（`sb-{ブランチ名}`）で自動的に別のサンドボックスが作成される
