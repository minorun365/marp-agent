---
name: check-usage
description: 各環境（main/kag）のCognitoユーザー数とAgentCoreランタイムの利用状況を調査する
allowed-tools: Bash(aws:*)
---

# 環境利用状況チェック

各Amplify環境（main/kag）のCognitoユーザー数とBedrock AgentCoreランタイムのトレース数を調査する。

## 対象リソース

### Cognito User Pool
- **main**: `us-east-1_g9cRJWa7S`
- **kag**: `us-east-1_ELK6OhHO8`

### AgentCore Runtime ロググループ
- **main**: `/aws/bedrock-agentcore/runtimes/marp_agent_main-vE9ji6BCaL-DEFAULT`
- **kag**: `/aws/bedrock-agentcore/runtimes/marp_agent_kag-zv2wo84JJM-DEFAULT`

※ ランタイムIDが変わった場合は `aws logs describe-log-groups --log-group-name-prefix /aws/bedrock-agentcore/runtimes/marp_agent --region us-east-1` で確認すること。

## 調査手順

### 1. Cognitoユーザー数

各User Poolのユーザー数と状態を取得する。

```bash
# main
aws cognito-idp describe-user-pool --user-pool-id us-east-1_g9cRJWa7S --region us-east-1 \
  --query "UserPool.{Name:Name, EstimatedUsers:EstimatedNumberOfUsers}" --output table

# kag
aws cognito-idp describe-user-pool --user-pool-id us-east-1_ELK6OhHO8 --region us-east-1 \
  --query "UserPool.{Name:Name, EstimatedUsers:EstimatedNumberOfUsers}" --output table
```

### 2. 日次 invocation 数（過去7日間）

CloudWatch Logs Insightsで日別のAPI呼び出し回数を取得する。

```bash
# main
QUERY_ID=$(aws logs start-query \
  --log-group-name "/aws/bedrock-agentcore/runtimes/marp_agent_main-vE9ji6BCaL-DEFAULT" \
  --start-time $(date -v-7d +%s) \
  --end-time $(date +%s) \
  --query-string 'filter @message like /invocations/ or @message like /POST/ or @message like /invoke/ | stats count(*) as count by bin(1d) as day | sort day asc' \
  --region us-east-1 \
  --query 'queryId' --output text)
sleep 8
aws logs get-query-results --query-id "$QUERY_ID" --region us-east-1
```

kagも同様に実行する。

### 3. 時間別 invocation 数（直近24時間）

```bash
# main
QUERY_ID=$(aws logs start-query \
  --log-group-name "/aws/bedrock-agentcore/runtimes/marp_agent_main-vE9ji6BCaL-DEFAULT" \
  --start-time $(date -v-24H +%s) \
  --end-time $(date +%s) \
  --query-string 'filter @message like /invocations/ or @message like /POST/ or @message like /invoke/ | stats count(*) as count by bin(1h) as hour | sort hour asc' \
  --region us-east-1 \
  --query 'queryId' --output text)
sleep 8
aws logs get-query-results --query-id "$QUERY_ID" --region us-east-1
```

kagも同様に実行する。

## 出力フォーマット

結果は以下の形式でまとめること：

1. **Cognitoユーザー数**: 環境ごとのユーザー数テーブル
2. **日次invocation数**: 過去7日間の日別テーブル
3. **時間別invocation数**: 直近24時間のJST表示テーブル（簡易グラフ付き）
