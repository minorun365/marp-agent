---
name: check-app-stats
description: このアプリの利用統計を確認（Cognitoユーザー数、AgentCore呼び出し回数）。※Tavily APIの残量は /check-tavily-credits を使用
allowed-tools: Bash(aws:*)
---

# 環境利用状況チェック

各Amplify環境（main/kag）のCognitoユーザー数とBedrock AgentCoreランタイムのトレース数を調査する。

## 対象リソース

リソースIDは動的に取得する（セキュリティ上ハードコードしない）。

### 命名規則
- **Cognito User Pool名**: `amplify-marp-agent-{env}-authUserPool...`（envは`main`または`kag`）
- **AgentCore Runtime名**: `marp_agent_{env}-...`

## 調査手順

### 0. リソースIDの取得（最初に実行）

```bash
# Cognito User Pool ID取得
POOL_MAIN=$(aws cognito-idp list-user-pools --max-results 60 --region us-east-1 \
  --query "UserPools[?contains(Name, 'marp-agent-main')].Id" --output text)
POOL_KAG=$(aws cognito-idp list-user-pools --max-results 60 --region us-east-1 \
  --query "UserPools[?contains(Name, 'marp-agent-kag')].Id" --output text)

# AgentCore ロググループ名取得
LOG_MAIN=$(aws logs describe-log-groups \
  --log-group-name-prefix /aws/bedrock-agentcore/runtimes/marp_agent_main \
  --region us-east-1 --query "logGroups[0].logGroupName" --output text)
LOG_KAG=$(aws logs describe-log-groups \
  --log-group-name-prefix /aws/bedrock-agentcore/runtimes/marp_agent_kag \
  --region us-east-1 --query "logGroups[0].logGroupName" --output text)

echo "POOL_MAIN: $POOL_MAIN"
echo "POOL_KAG: $POOL_KAG"
echo "LOG_MAIN: $LOG_MAIN"
echo "LOG_KAG: $LOG_KAG"
```

### 1. Cognitoユーザー数

各User Poolのユーザー数と状態を取得する。

```bash
# main
aws cognito-idp describe-user-pool --user-pool-id "$POOL_MAIN" --region us-east-1 \
  --query "UserPool.{Name:Name, EstimatedUsers:EstimatedNumberOfUsers}" --output table

# kag
aws cognito-idp describe-user-pool --user-pool-id "$POOL_KAG" --region us-east-1 \
  --query "UserPool.{Name:Name, EstimatedUsers:EstimatedNumberOfUsers}" --output table
```

### 2. 日次 invocation 数（過去7日間・JST）

CloudWatch Logs Insightsで日別のAPI呼び出し回数を取得する。`datefloor(@timestamp + 9h, 1d)` でJST基準に補正する。

```bash
# main
QUERY_ID=$(aws logs start-query \
  --log-group-name "$LOG_MAIN" \
  --start-time $(date -v-7d +%s) \
  --end-time $(date +%s) \
  --query-string 'filter @message like /invocations/ or @message like /POST/ or @message like /invoke/ | stats count(*) as count by datefloor(@timestamp + 9h, 1d) as day_jst | sort day_jst asc' \
  --region us-east-1 \
  --query 'queryId' --output text)
sleep 8
aws logs get-query-results --query-id "$QUERY_ID" --region us-east-1
```

kagも同様に `$LOG_KAG` で実行する。

### 3. 時間別 invocation 数（直近24時間・JST）

```bash
# main
QUERY_ID=$(aws logs start-query \
  --log-group-name "$LOG_MAIN" \
  --start-time $(date -v-24H +%s) \
  --end-time $(date +%s) \
  --query-string 'filter @message like /invocations/ or @message like /POST/ or @message like /invoke/ | stats count(*) as count by datefloor(@timestamp + 9h, 1h) as hour_jst | sort hour_jst asc' \
  --region us-east-1 \
  --query 'queryId' --output text)
sleep 8
aws logs get-query-results --query-id "$QUERY_ID" --region us-east-1
```

kagも同様に `$LOG_KAG` で実行する。

## 出力フォーマット

結果は以下の形式でまとめること：

1. **Cognitoユーザー数**: 環境ごとのユーザー数テーブル
2. **日次invocation数**: 過去7日間の日別テーブル
3. **時間別invocation数**: 直近24時間のJST表示テーブル（簡易グラフ付き）
