---
name: check-deploy-status
description: Amplifyのmain/kagブランチのデプロイ状況を確認（直近5件ずつ、所要時間付き）
allowed-tools: Bash(aws:*)
---

# Amplify デプロイ状況チェック

main と kag ブランチのデプロイ状況を確認し、表形式で出力する。

## 対象アプリ

- アプリ名: `marp-agent`
- リージョン: `us-east-1`
- 対象ブランチ: `main`, `kag`

## 調査手順

### 1. アプリIDの取得

```bash
APP_ID=$(aws amplify list-apps --region us-east-1 \
  --query "apps[?name=='marp-agent'].appId" --output text)
echo "App ID: $APP_ID"
```

### 2. 各ブランチのデプロイジョブを取得（直近5件）

```bash
# main ブランチ
aws amplify list-jobs --app-id "$APP_ID" --branch-name main --max-items 5 --region us-east-1 \
  --query "jobSummaries[].{jobId:jobId, status:status, commitMessage:commitMessage, startTime:startTime, endTime:endTime}" \
  --output json

# kag ブランチ
aws amplify list-jobs --app-id "$APP_ID" --branch-name kag --max-items 5 --region us-east-1 \
  --query "jobSummaries[].{jobId:jobId, status:status, commitMessage:commitMessage, startTime:startTime, endTime:endTime}" \
  --output json
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

```
📦 main ブランチ（直近5件）
┌────┬──────────┬────────────────────────────┬───────────┐
│ #  │ ステータス │ コミットメッセージ           │ 所要時間   │
├────┼──────────┼────────────────────────────┼───────────┤
│ 103│ 🔄 実行中 │ スキルファイルを追加         │ 3分12秒経過│
│ 102│ ✅ 成功   │ セッションID管理のドキュメ... │ 5分23秒    │
│ 101│ ✅ 成功   │ セッションIDをHTTPヘッダー... │ 9分25秒    │
└────┴──────────┴────────────────────────────┴───────────┘

📦 kag ブランチ（直近5件）
（同様の形式）
```

### コミットメッセージの省略

コミットメッセージが25文字を超える場合は `...` で省略する。

## 注意事項

- AWS認証が必要（`aws login` でIAM Identity Center認証）
- 時刻はJST（日本時間）で表示
