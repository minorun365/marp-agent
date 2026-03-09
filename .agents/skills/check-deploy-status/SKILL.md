---
name: check-deploy-status
model: sonnet
description: Amplifyに存在するすべてのブランチのデプロイ状況を確認（直近5件ずつ、所要時間付き）
allowed-tools: Bash
---

# Amplify デプロイ状況チェック

存在するすべてのブランチのデプロイ状況を確認し、表形式で出力する。

## 対象アプリ

| 環境 | AWSプロファイル | アプリ名 | リージョン |
|------|----------------|----------|-----------|
| main（個人AWS） | `sandbox` | `marp-agent` | `us-east-1` |
| kag（社内AWS） | `kag-sandbox` | `marp-agent-kag` | `us-east-1` |

## 調査手順

### ステップ1: SSOセッション確認（必須・毎回実行）

**両方のプロファイルのSSOセッションを必ず事前に確認する。** 以下を1つのBashコマンドで実行:

```bash
aws sts get-caller-identity --profile sandbox 2>&1; echo "---"; aws sts get-caller-identity --profile kag-sandbox 2>&1
```

- 出力に `Token has expired` や `Error` が含まれるプロファイルがあれば、**ステップ2でSSOログインを実行**する
- 両方成功していればステップ2をスキップしてステップ3へ進む

### ステップ2: SSOログイン（セッション切れの場合）

期限切れのプロファイルごとに `aws sso login` を実行する。ユーザーがブラウザで承認するのを待つ。

```bash
aws sso login --profile sandbox
```

```bash
aws sso login --profile kag-sandbox
```

- **1プロファイルずつ実行**する（ブラウザ承認が必要なため並列実行は不可）
- ログイン完了後、再度 `aws sts get-caller-identity` で成功を確認してからステップ3へ進む

### ステップ3: デプロイ状況取得

**以下を1つのBashコマンドとして実行する（承認1回で済むように）。**

両環境を `;` で連結し、一方のSSOが切れていてももう一方は正常に実行される:

```bash
(APP_ID=$(aws amplify list-apps --region us-east-1 --profile sandbox --query "apps[?name=='marp-agent'].appId" --output text) && \
echo "=== main環境 (sandbox) ===" && \
aws amplify list-branches --app-id "$APP_ID" --region us-east-1 --profile sandbox --query "branches[].branchName" --output text | tr '\t' '\n' | while read BRANCH; do \
  echo "--- $BRANCH ---" && \
  aws amplify list-jobs --app-id "$APP_ID" --branch-name "$BRANCH" --max-items 5 --region us-east-1 --profile sandbox \
    --query "jobSummaries[].{jobId:jobId, status:status, commitMessage:commitMessage, startTime:startTime, endTime:endTime}" \
    --output json; \
done) ; \
(APP_ID=$(aws amplify list-apps --region us-east-1 --profile kag-sandbox --query "apps[?name=='marp-agent-kag'].appId" --output text) && \
echo "=== kag環境 (kag-sandbox) ===" && \
aws amplify list-branches --app-id "$APP_ID" --region us-east-1 --profile kag-sandbox --query "branches[].branchName" --output text | tr '\t' '\n' | while read BRANCH; do \
  echo "--- $BRANCH ---" && \
  aws amplify list-jobs --app-id "$APP_ID" --branch-name "$BRANCH" --max-items 5 --region us-east-1 --profile kag-sandbox \
    --query "jobSummaries[].{jobId:jobId, status:status, commitMessage:commitMessage, startTime:startTime, endTime:endTime}" \
    --output json; \
done)
```

## 出力フォーマット

取得したデータを以下の表形式で整形すること:

### ステータスの表示

| ステータス | 表示 |
|-----------|------|
| SUCCEED | ✅ 成功 |
| FAILED | ❌ 失敗 |
| RUNNING | 🔄 実行中 |
| PENDING | ⏳ 保留中 |
| CANCELLED | 🚫 キャンセル |

### 所要時間の計算

1. **RUNNING（実行中）の場合**: `現在時刻 - startTime` で経過時間を計算
2. **SUCCEED/FAILED（完了済み）の場合**: `endTime - startTime` で所要時間を計算
3. 時間は「X分Y秒」形式で表示

### 出力テーブル例

取得したすべてのブランチについて、以下の形式で出力:

```
🏠 main環境（個人AWS）

📦 main ブランチ（直近5件）
| # | ステータス | コミットメッセージ | 所要時間 |
|---|---|---|---|
| 198 | 🔄 実行中 | カスタムMETRICSログを削除... | 3分12秒経過 |
| 197 | ✅ 成功 | 会話履歴トリミングのwindow... | 5分23秒 |

🏢 kag環境（社内AWS）

📦 main ブランチ（直近5件）
| # | ステータス | コミットメッセージ | 所要時間 |
|---|---|---|---|
| 45 | ✅ 成功 | プレースホルダー更新 | 5分42秒 |

... 以下、各環境に存在するブランチすべてを出力
```

### コミットメッセージの省略

コミットメッセージが25文字を超える場合は `...` で省略する。

## 注意事項

- 両環境とも AWS SSO 認証が必要（`sandbox` / `kag-sandbox` プロファイル）
- **SSOセッション確認は毎回必ず実施**する（ステップ1をスキップしない）
- セッション切れの場合は `aws sso login` を実行してユーザーのブラウザ承認を待つ
- 時刻はJST（日本時間）で表示
