---
name: check-app-stats
description: このアプリの利用統計を確認（Cognitoユーザー数、AgentCore呼び出し回数、Bedrockコスト、Tavily API残量）
allowed-tools: Bash(aws:*)
---

# 環境利用状況チェック

各Amplify環境（main/kag）のCognitoユーザー数とBedrock AgentCoreランタイムのセッション数を調査する。Bedrockコストについてはdev環境も含めて集計する。

mainとkagは別AWSアカウントで運用されているため、それぞれのプロファイルで個別にデータ取得する。

## 実行方法

**重要**: 以下のBashスクリプトを**そのまま1回で実行**すること。すべてのデータ取得を並列化し、1回の承認で完了する。

```bash
#!/bin/bash
set -e

REGION="us-east-1"
PROFILE_MAIN="sandbox"
PROFILE_KAG="kag-sandbox"
OUTPUT_DIR="/tmp/marp-stats"
mkdir -p "$OUTPUT_DIR"

echo "📊 Marp Agent 利用状況を取得中..."

# SSOセッション確認（切れていたら自動ログイン）
if ! aws sts get-caller-identity --profile $PROFILE_MAIN > /dev/null 2>&1; then
  echo "🔑 sandbox のSSOセッションが無効です。ログインします..."
  aws sso login --profile $PROFILE_MAIN
fi

KAG_AVAILABLE=true
if ! aws sts get-caller-identity --profile $PROFILE_KAG > /dev/null 2>&1; then
  echo "🔑 kag-sandbox のSSOセッションが無効です。ログインします..."
  aws sso login --profile $PROFILE_KAG || true
  # ログイン後に再確認
  aws sts get-caller-identity --profile $PROFILE_KAG > /dev/null 2>&1 || KAG_AVAILABLE=false
  if [ "$KAG_AVAILABLE" = false ]; then
    echo "⚠️  kag-sandbox のログインに失敗しました。kagのデータはスキップします。"
  fi
fi

# ========================================
# 1. リソースID取得
# ========================================
echo "🔍 リソースIDを取得中..."

# Cognito User Pool ID取得
POOL_MAIN=$(aws cognito-idp list-user-pools --max-results 60 --region $REGION --profile $PROFILE_MAIN \
  --query "UserPools[?contains(Name, 'marp-main')].Id" --output text)

POOL_KAG=""
if [ "$KAG_AVAILABLE" = true ]; then
  # kag-sandbox ではプール名が汎用的なため、CloudFormation出力から特定
  POOL_KAG=$(aws cloudformation describe-stacks \
    --stack-name $(aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
      --region $REGION --profile $PROFILE_KAG \
      --query "StackSummaries[?contains(StackName, 'dt1uykzxnkuoh') && contains(StackName, 'auth')].StackName" --output text) \
    --region $REGION --profile $PROFILE_KAG \
    --query "Stacks[0].Outputs[?contains(OutputKey, 'UserPool') && !contains(OutputKey, 'AppClient')].OutputValue" --output text 2>/dev/null || echo "")
fi

# AgentCore ロググループ名取得（main/dev は sandbox、kag は kag-sandbox）
LOG_MAIN=$(aws logs describe-log-groups \
  --log-group-name-prefix /aws/bedrock-agentcore/runtimes/marp_agent_main \
  --region $REGION --profile $PROFILE_MAIN --query "logGroups[0].logGroupName" --output text)

LOG_KAG="None"
if [ "$KAG_AVAILABLE" = true ]; then
  LOG_KAG=$(aws logs describe-log-groups \
    --log-group-name-prefix /aws/bedrock-agentcore/runtimes/marp_agent \
    --region $REGION --profile $PROFILE_KAG --query "logGroups[0].logGroupName" --output text 2>/dev/null || echo "None")
fi

LOG_DEV=$(aws logs describe-log-groups \
  --log-group-name-prefix /aws/bedrock-agentcore/runtimes/marp_agent_dev \
  --region $REGION --profile $PROFILE_MAIN --query "logGroups[0].logGroupName" --output text 2>/dev/null || echo "None")

# ========================================
# 2. Cognitoユーザー数取得（前回値との比較用キャッシュ付き）
# ========================================
echo "👥 Cognitoユーザー数を取得中..."
USERS_MAIN=$(aws cognito-idp describe-user-pool --user-pool-id "$POOL_MAIN" --region $REGION --profile $PROFILE_MAIN \
  --query "UserPool.EstimatedNumberOfUsers" --output text 2>/dev/null || echo "0")

USERS_KAG=0
if [ "$KAG_AVAILABLE" = true ] && [ -n "$POOL_KAG" ]; then
  USERS_KAG=$(aws cognito-idp describe-user-pool --user-pool-id "$POOL_KAG" --region $REGION --profile $PROFILE_KAG \
    --query "UserPool.EstimatedNumberOfUsers" --output text 2>/dev/null || echo "0")
fi

# 前回値を読み込み（キャッシュファイルがあれば）
CACHE_FILE="$OUTPUT_DIR/cognito_cache.json"
PREV_MAIN=0
PREV_KAG=0
PREV_DATE=""
if [ -f "$CACHE_FILE" ]; then
  PREV_MAIN=$(jq -r '.main // 0' "$CACHE_FILE")
  PREV_KAG=$(jq -r '.kag // 0' "$CACHE_FILE")
  PREV_DATE=$(jq -r '.date // ""' "$CACHE_FILE")
fi

# 増加数を計算
DIFF_MAIN=$((USERS_MAIN - PREV_MAIN))
DIFF_KAG=$((USERS_KAG - PREV_KAG))

# 現在の値をキャッシュに保存
TODAY=$(TZ=Asia/Tokyo date +%Y-%m-%d)
echo "{\"main\": $USERS_MAIN, \"kag\": $USERS_KAG, \"date\": \"$TODAY\"}" > "$CACHE_FILE"

# kag Cognitoの最近追加ユーザー取得
if [ "$KAG_AVAILABLE" = true ] && [ -n "$POOL_KAG" ]; then
  echo "👤 kag Cognitoユーザー一覧を取得中..."
  aws cognito-idp list-users \
    --user-pool-id "$POOL_KAG" \
    --region $REGION --profile $PROFILE_KAG \
    --output json > "$OUTPUT_DIR/kag_users.json" 2>/dev/null || echo '{"Users":[]}' > "$OUTPUT_DIR/kag_users.json"
else
  echo '{"Users":[]}' > "$OUTPUT_DIR/kag_users.json"
fi

# ========================================
# 3. CloudWatch Logsクエリを並列開始
# ========================================
echo "📈 CloudWatch Logsクエリを並列開始..."
START_7D=$(date -v-7d +%s)
START_24H=$(date -v-24H +%s)
START_28D=$(date -v-28d +%s)  # 週次トレンド用（4週間）
END_NOW=$(date +%s)

# OTELログからsession.idをparseしてユニークカウント（UTCで集計）
OTEL_QUERY='parse @message /"session\.id":\s*"(?<sid>[^"]+)"/ | filter ispresent(sid)'

# 日次クエリ開始（main: sandbox, kag: kag-sandbox）
Q_DAILY_MAIN=$(aws logs start-query \
  --log-group-name "$LOG_MAIN" \
  --start-time $START_7D --end-time $END_NOW \
  --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1d) as day_utc | sort day_utc asc" \
  --region $REGION --profile $PROFILE_MAIN --query 'queryId' --output text)

Q_DAILY_KAG=""
if [ "$KAG_AVAILABLE" = true ] && [ "$LOG_KAG" != "None" ]; then
  Q_DAILY_KAG=$(aws logs start-query \
    --log-group-name "$LOG_KAG" \
    --start-time $START_7D --end-time $END_NOW \
    --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1d) as day_utc | sort day_utc asc" \
    --region $REGION --profile $PROFILE_KAG --query 'queryId' --output text)
fi

Q_DAILY_DEV=""
if [ "$LOG_DEV" != "None" ]; then
  Q_DAILY_DEV=$(aws logs start-query \
    --log-group-name "$LOG_DEV" \
    --start-time $START_7D --end-time $END_NOW \
    --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1d) as day_utc | sort day_utc asc" \
    --region $REGION --profile $PROFILE_MAIN --query 'queryId' --output text)
fi

# 時間別クエリ開始（main/kag/dev並列）
Q_HOURLY_MAIN=$(aws logs start-query \
  --log-group-name "$LOG_MAIN" \
  --start-time $START_24H --end-time $END_NOW \
  --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1h) as hour_utc | sort hour_utc asc" \
  --region $REGION --profile $PROFILE_MAIN --query 'queryId' --output text)

Q_HOURLY_KAG=""
if [ "$KAG_AVAILABLE" = true ] && [ "$LOG_KAG" != "None" ]; then
  Q_HOURLY_KAG=$(aws logs start-query \
    --log-group-name "$LOG_KAG" \
    --start-time $START_24H --end-time $END_NOW \
    --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1h) as hour_utc | sort hour_utc asc" \
    --region $REGION --profile $PROFILE_KAG --query 'queryId' --output text)
fi

Q_HOURLY_DEV=""
if [ "$LOG_DEV" != "None" ]; then
  Q_HOURLY_DEV=$(aws logs start-query \
    --log-group-name "$LOG_DEV" \
    --start-time $START_24H --end-time $END_NOW \
    --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1h) as hour_utc | sort hour_utc asc" \
    --region $REGION --profile $PROFILE_MAIN --query 'queryId' --output text)
fi

# 週次クエリ開始（過去4週間）
Q_WEEKLY_MAIN=$(aws logs start-query \
  --log-group-name "$LOG_MAIN" \
  --start-time $START_28D --end-time $END_NOW \
  --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1d) as day_utc | sort day_utc asc" \
  --region $REGION --profile $PROFILE_MAIN --query 'queryId' --output text)

Q_WEEKLY_KAG=""
if [ "$KAG_AVAILABLE" = true ] && [ "$LOG_KAG" != "None" ]; then
  Q_WEEKLY_KAG=$(aws logs start-query \
    --log-group-name "$LOG_KAG" \
    --start-time $START_28D --end-time $END_NOW \
    --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1d) as day_utc | sort day_utc asc" \
    --region $REGION --profile $PROFILE_KAG --query 'queryId' --output text)
fi

# ========================================
# 4. Bedrockコスト取得（クエリ待機中に並列実行）
# ========================================
echo "💰 Bedrockコストを取得中..."

# sandbox アカウント（main+dev）のコスト（クレジット適用前）
aws ce get-cost-and-usage \
  --time-period Start=$(date -v-7d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics "UnblendedCost" \
  --filter '{"Dimensions": {"Key": "RECORD_TYPE", "Values": ["Usage"]}}' \
  --group-by Type=DIMENSION,Key=SERVICE \
  --region $REGION --profile $PROFILE_MAIN \
  --output json > "$OUTPUT_DIR/cost.json"

# kag-sandbox アカウントのコスト（クレジット適用前）
if [ "$KAG_AVAILABLE" = true ]; then
  aws ce get-cost-and-usage \
    --time-period Start=$(date -v-7d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
    --granularity DAILY \
    --metrics "UnblendedCost" \
    --filter '{"Dimensions": {"Key": "RECORD_TYPE", "Values": ["Usage"]}}' \
    --group-by Type=DIMENSION,Key=SERVICE \
    --region $REGION --profile $PROFILE_KAG \
    --output json > "$OUTPUT_DIR/cost_kag.json"
else
  echo '{"ResultsByTime":[]}' > "$OUTPUT_DIR/cost_kag.json"
fi

# Claude Sonnet 4.5の使用タイプ別コスト（キャッシュ効果分析用）- sandbox
aws ce get-cost-and-usage \
  --time-period Start=$(date -v-7d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics "UnblendedCost" \
  --filter '{
    "And": [
      {"Dimensions": {"Key": "RECORD_TYPE", "Values": ["Usage"]}},
      {"Dimensions": {"Key": "SERVICE", "Values": ["Claude Sonnet 4.5 (Amazon Bedrock Edition)"]}}
    ]
  }' \
  --group-by Type=DIMENSION,Key=USAGE_TYPE \
  --region $REGION --profile $PROFILE_MAIN \
  --output json > "$OUTPUT_DIR/sonnet_usage.json"

# Claude Sonnet 4.5 - kag-sandbox
if [ "$KAG_AVAILABLE" = true ]; then
  aws ce get-cost-and-usage \
    --time-period Start=$(date -v-7d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
    --granularity DAILY \
    --metrics "UnblendedCost" \
    --filter '{
      "And": [
        {"Dimensions": {"Key": "RECORD_TYPE", "Values": ["Usage"]}},
        {"Dimensions": {"Key": "SERVICE", "Values": ["Claude Sonnet 4.5 (Amazon Bedrock Edition)"]}}
      ]
    }' \
    --group-by Type=DIMENSION,Key=USAGE_TYPE \
    --region $REGION --profile $PROFILE_KAG \
    --output json > "$OUTPUT_DIR/sonnet_usage_kag.json"
else
  echo '{"ResultsByTime":[]}' > "$OUTPUT_DIR/sonnet_usage_kag.json"
fi

# Claude Opus 4.6の使用タイプ別コスト - sandbox
aws ce get-cost-and-usage \
  --time-period Start=$(date -v-7d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics "UnblendedCost" \
  --filter '{
    "And": [
      {"Dimensions": {"Key": "RECORD_TYPE", "Values": ["Usage"]}},
      {"Dimensions": {"Key": "SERVICE", "Values": ["Claude Opus 4.6 (Amazon Bedrock Edition)"]}}
    ]
  }' \
  --group-by Type=DIMENSION,Key=USAGE_TYPE \
  --region $REGION --profile $PROFILE_MAIN \
  --output json > "$OUTPUT_DIR/opus_usage.json"

# Claude Opus 4.6 - kag-sandbox
if [ "$KAG_AVAILABLE" = true ]; then
  aws ce get-cost-and-usage \
    --time-period Start=$(date -v-7d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
    --granularity DAILY \
    --metrics "UnblendedCost" \
    --filter '{
      "And": [
        {"Dimensions": {"Key": "RECORD_TYPE", "Values": ["Usage"]}},
        {"Dimensions": {"Key": "SERVICE", "Values": ["Claude Opus 4.6 (Amazon Bedrock Edition)"]}}
      ]
    }' \
    --group-by Type=DIMENSION,Key=USAGE_TYPE \
    --region $REGION --profile $PROFILE_KAG \
    --output json > "$OUTPUT_DIR/opus_usage_kag.json"
else
  echo '{"ResultsByTime":[]}' > "$OUTPUT_DIR/opus_usage_kag.json"
fi

# 週次コスト取得（過去4週間）- sandbox
aws ce get-cost-and-usage \
  --time-period Start=$(date -v-28d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics "UnblendedCost" \
  --filter '{"Dimensions": {"Key": "RECORD_TYPE", "Values": ["Usage"]}}' \
  --group-by Type=DIMENSION,Key=SERVICE \
  --region $REGION --profile $PROFILE_MAIN \
  --output json > "$OUTPUT_DIR/weekly_cost.json"

# 週次コスト - kag-sandbox
if [ "$KAG_AVAILABLE" = true ]; then
  aws ce get-cost-and-usage \
    --time-period Start=$(date -v-28d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
    --granularity DAILY \
    --metrics "UnblendedCost" \
    --filter '{"Dimensions": {"Key": "RECORD_TYPE", "Values": ["Usage"]}}' \
    --group-by Type=DIMENSION,Key=SERVICE \
    --region $REGION --profile $PROFILE_KAG \
    --output json > "$OUTPUT_DIR/weekly_cost_kag.json"
else
  echo '{"ResultsByTime":[]}' > "$OUTPUT_DIR/weekly_cost_kag.json"
fi

# ========================================
# 4.5 Tavily API利用量取得
# ========================================
echo "🔍 Tavily API利用量を取得中..."

ENV_FILE="$PWD/.env"
TAVILY_KEYS=""
if [ -f "$ENV_FILE" ]; then
  TAVILY_KEYS=$(grep '^TAVILY_API_KEYS=' "$ENV_FILE" | cut -d'=' -f2)
fi

if [ -n "$TAVILY_KEYS" ]; then
  echo "$TAVILY_KEYS" | tr ',' '\n' > "$OUTPUT_DIR/tavily_keys.tmp"
  TAVILY_KEY_COUNT=0
  while IFS= read -r KEY; do
    [ -z "$KEY" ] && continue
    TAVILY_KEY_COUNT=$((TAVILY_KEY_COUNT + 1))
    curl -s --max-time 5 "https://api.tavily.com/usage" -H "Authorization: Bearer $KEY" \
      > "$OUTPUT_DIR/tavily_key${TAVILY_KEY_COUNT}.json" 2>/dev/null || echo '{}' > "$OUTPUT_DIR/tavily_key${TAVILY_KEY_COUNT}.json"
  done < "$OUTPUT_DIR/tavily_keys.tmp"
  rm -f "$OUTPUT_DIR/tavily_keys.tmp"
else
  TAVILY_KEY_COUNT=0
fi

# ========================================
# 5. クエリ結果取得（10秒待機後）
# ========================================
echo "⏳ クエリ完了を待機中..."
sleep 10

echo "📥 クエリ結果を取得中..."
aws logs get-query-results --query-id "$Q_DAILY_MAIN" --region $REGION --profile $PROFILE_MAIN > "$OUTPUT_DIR/daily_main.json"
aws logs get-query-results --query-id "$Q_HOURLY_MAIN" --region $REGION --profile $PROFILE_MAIN > "$OUTPUT_DIR/hourly_main.json"

if [ -n "$Q_DAILY_KAG" ]; then
  aws logs get-query-results --query-id "$Q_DAILY_KAG" --region $REGION --profile $PROFILE_KAG > "$OUTPUT_DIR/daily_kag.json"
  aws logs get-query-results --query-id "$Q_HOURLY_KAG" --region $REGION --profile $PROFILE_KAG > "$OUTPUT_DIR/hourly_kag.json"
else
  echo '{"results":[]}' > "$OUTPUT_DIR/daily_kag.json"
  echo '{"results":[]}' > "$OUTPUT_DIR/hourly_kag.json"
fi

if [ -n "$Q_DAILY_DEV" ]; then
  aws logs get-query-results --query-id "$Q_DAILY_DEV" --region $REGION --profile $PROFILE_MAIN > "$OUTPUT_DIR/daily_dev.json"
  aws logs get-query-results --query-id "$Q_HOURLY_DEV" --region $REGION --profile $PROFILE_MAIN > "$OUTPUT_DIR/hourly_dev.json"
else
  echo '{"results":[]}' > "$OUTPUT_DIR/daily_dev.json"
  echo '{"results":[]}' > "$OUTPUT_DIR/hourly_dev.json"
fi

aws logs get-query-results --query-id "$Q_WEEKLY_MAIN" --region $REGION --profile $PROFILE_MAIN > "$OUTPUT_DIR/weekly_main.json"
if [ -n "$Q_WEEKLY_KAG" ]; then
  aws logs get-query-results --query-id "$Q_WEEKLY_KAG" --region $REGION --profile $PROFILE_KAG > "$OUTPUT_DIR/weekly_kag.json"
else
  echo '{"results":[]}' > "$OUTPUT_DIR/weekly_kag.json"
fi

# ========================================
# 6. 結果出力
# ========================================
echo ""
echo "=========================================="
echo "📊 MARP AGENT 利用状況レポート"
echo "=========================================="
echo ""

# ========================================
# 直近12時間のセッション数を表形式で表示
# ========================================
CURRENT_JST_HOUR=$(TZ=Asia/Tokyo date +%H)

# UTCの時刻をJSTに変換してマップを作成（直近12時間用）
declare -A MAIN_MAP_12H
declare -A KAG_MAP_12H
declare -A DEV_MAP_12H

# mainのデータをJST変換してマップに格納
while IFS= read -r line; do
  if [ -n "$line" ]; then
    UTC_HOUR=$(echo "$line" | cut -d'|' -f1)
    SESSIONS=$(echo "$line" | cut -d'|' -f2)
    JST_HOUR=$(( (10#$UTC_HOUR + 9) % 24 ))
    JST_HOUR_STR=$(printf "%02d" $JST_HOUR)
    MAIN_MAP_12H[$JST_HOUR_STR]=$SESSIONS
  fi
done < <(jq -r '.results[] |
  (.[] | select(.field == "hour_utc") | .value[11:13]) as $hour |
  (.[] | select(.field == "sessions") | .value) as $sessions |
  "\($hour)|\($sessions)"
' "$OUTPUT_DIR/hourly_main.json" 2>/dev/null)

# kagのデータをJST変換してマップに格納
while IFS= read -r line; do
  if [ -n "$line" ]; then
    UTC_HOUR=$(echo "$line" | cut -d'|' -f1)
    SESSIONS=$(echo "$line" | cut -d'|' -f2)
    JST_HOUR=$(( (10#$UTC_HOUR + 9) % 24 ))
    JST_HOUR_STR=$(printf "%02d" $JST_HOUR)
    KAG_MAP_12H[$JST_HOUR_STR]=$SESSIONS
  fi
done < <(jq -r '.results[] |
  (.[] | select(.field == "hour_utc") | .value[11:13]) as $hour |
  (.[] | select(.field == "sessions") | .value) as $sessions |
  "\($hour)|\($sessions)"
' "$OUTPUT_DIR/hourly_kag.json" 2>/dev/null)

# devのデータをJST変換してマップに格納
while IFS= read -r line; do
  if [ -n "$line" ]; then
    UTC_HOUR=$(echo "$line" | cut -d'|' -f1)
    SESSIONS=$(echo "$line" | cut -d'|' -f2)
    JST_HOUR=$(( (10#$UTC_HOUR + 9) % 24 ))
    JST_HOUR_STR=$(printf "%02d" $JST_HOUR)
    DEV_MAP_12H[$JST_HOUR_STR]=$SESSIONS
  fi
done < <(jq -r '.results[] |
  (.[] | select(.field == "hour_utc") | .value[11:13]) as $hour |
  (.[] | select(.field == "sessions") | .value) as $sessions |
  "\($hour)|\($sessions)"
' "$OUTPUT_DIR/hourly_dev.json" 2>/dev/null)

echo "🔥 直近12時間のセッション数（JST）"
echo ""
echo "  時刻   | main | kag  | dev  | 合計"
echo "  -------|------|------|------|------"

SUM_MAIN_12H=0
SUM_KAG_12H=0
SUM_DEV_12H=0

# 直近12時間を古い順に表示
for i in $(seq 11 -1 0); do
  HOUR=$(( (10#$CURRENT_JST_HOUR - i + 24) % 24 ))
  HOUR_STR=$(printf "%02d" $HOUR)

  MAIN_C=${MAIN_MAP_12H[$HOUR_STR]:-0}
  KAG_C=${KAG_MAP_12H[$HOUR_STR]:-0}
  DEV_C=${DEV_MAP_12H[$HOUR_STR]:-0}
  TOTAL_C=$((MAIN_C + KAG_C + DEV_C))

  SUM_MAIN_12H=$((SUM_MAIN_12H + MAIN_C))
  SUM_KAG_12H=$((SUM_KAG_12H + KAG_C))
  SUM_DEV_12H=$((SUM_DEV_12H + DEV_C))

  printf "  %s:00 | %4d | %4d | %4d | %4d\n" "$HOUR_STR" "$MAIN_C" "$KAG_C" "$DEV_C" "$TOTAL_C"
done

SUM_TOTAL_12H=$((SUM_MAIN_12H + SUM_KAG_12H + SUM_DEV_12H))
echo "  -------|------|------|------|------"
printf "  合計   | %4d | %4d | %4d | %4d\n" "$SUM_MAIN_12H" "$SUM_KAG_12H" "$SUM_DEV_12H" "$SUM_TOTAL_12H"
echo ""

echo "👥 Cognitoユーザー数"
if [ -n "$PREV_DATE" ] && [ "$PREV_DATE" != "$TODAY" ]; then
  # 前回記録が別日の場合、増減を表示
  DIFF_MAIN_STR=""
  DIFF_KAG_STR=""
  DIFF_TOTAL=$((DIFF_MAIN + DIFF_KAG))
  if [ $DIFF_MAIN -gt 0 ]; then DIFF_MAIN_STR=" (+$DIFF_MAIN)"; elif [ $DIFF_MAIN -lt 0 ]; then DIFF_MAIN_STR=" ($DIFF_MAIN)"; fi
  if [ $DIFF_KAG -gt 0 ]; then DIFF_KAG_STR=" (+$DIFF_KAG)"; elif [ $DIFF_KAG -lt 0 ]; then DIFF_KAG_STR=" ($DIFF_KAG)"; fi
  DIFF_TOTAL_STR=""
  if [ $DIFF_TOTAL -gt 0 ]; then DIFF_TOTAL_STR=" (+$DIFF_TOTAL)"; elif [ $DIFF_TOTAL -lt 0 ]; then DIFF_TOTAL_STR=" ($DIFF_TOTAL)"; fi
  echo "  main: $USERS_MAIN 人$DIFF_MAIN_STR"
  echo "  kag:  $USERS_KAG 人$DIFF_KAG_STR"
  echo "  合計: $((USERS_MAIN + USERS_KAG)) 人$DIFF_TOTAL_STR"
  echo "  （前回記録: $PREV_DATE）"
else
  # 初回または同日の場合は増減なし
  echo "  main: $USERS_MAIN 人"
  echo "  kag:  $USERS_KAG 人"
  echo "  合計: $((USERS_MAIN + USERS_KAG)) 人"
  if [ -z "$PREV_DATE" ]; then
    echo "  （初回記録 - 次回以降増減を表示）"
  fi
fi

# kag 最近追加されたユーザー
KAG_USER_COUNT=$(jq '.Users | length' "$OUTPUT_DIR/kag_users.json" 2>/dev/null || echo 0)
if [ "$KAG_USER_COUNT" -gt 0 ]; then
  echo ""
  echo "  [kag 最近追加されたユーザー]"
  jq -r '
    .Users | sort_by(.UserCreateDate) | reverse | .[] |
    (.UserCreateDate | split("T")[0]) as $date |
    ((.Attributes // [])[] | select(.Name == "email") | .Value) as $email |
    "  \($date): \($email // "email未設定")"
  ' "$OUTPUT_DIR/kag_users.json" 2>/dev/null | head -10
fi
echo ""

echo "📈 日次セッション数（過去7日間）"
echo "[main]"
jq -r '.results[] |
  (.[] | select(.field == "day_utc") | .value | split(" ")[0]) as $date |
  (.[] | select(.field == "sessions") | .value) as $sessions |
  "  \($date): \($sessions) 回"
' "$OUTPUT_DIR/daily_main.json"
TOTAL_MAIN=$(jq '[.results[][] | select(.field == "sessions") | .value | tonumber] | add // 0' "$OUTPUT_DIR/daily_main.json")
echo "  合計: $TOTAL_MAIN 回"
echo ""
echo "[kag]"
KAG_DAILY_COUNT=$(jq '.results | length' "$OUTPUT_DIR/daily_kag.json")
if [ "$KAG_DAILY_COUNT" -gt 0 ]; then
  jq -r '.results[] |
    (.[] | select(.field == "day_utc") | .value | split(" ")[0]) as $date |
    (.[] | select(.field == "sessions") | .value) as $sessions |
    "  \($date): \($sessions) 回"
  ' "$OUTPUT_DIR/daily_kag.json"
  TOTAL_KAG=$(jq '[.results[][] | select(.field == "sessions") | .value | tonumber] | add // 0' "$OUTPUT_DIR/daily_kag.json")
else
  TOTAL_KAG=0
  echo "  （セッションなし）"
fi
echo "  合計: $TOTAL_KAG 回"
echo ""
echo "[dev]"
DEV_DAILY_COUNT=$(jq '.results | length' "$OUTPUT_DIR/daily_dev.json")
if [ "$DEV_DAILY_COUNT" -gt 0 ]; then
  jq -r '.results[] |
    (.[] | select(.field == "day_utc") | .value | split(" ")[0]) as $date |
    (.[] | select(.field == "sessions") | .value) as $sessions |
    "  \($date): \($sessions) 回"
  ' "$OUTPUT_DIR/daily_dev.json"
  TOTAL_DEV=$(jq '[.results[][] | select(.field == "sessions") | .value | tonumber] | add // 0' "$OUTPUT_DIR/daily_dev.json")
else
  TOTAL_DEV=0
  echo "  （セッションなし）"
fi
echo "  合計: $TOTAL_DEV 回"
echo ""

echo "⏰ 時間別セッション数（直近24時間・JST）"
echo ""
echo "        [main]              [kag]               [dev]"
echo "  時刻  |  グラフ     | 回数 |  グラフ     | 回数 |  グラフ     | 回数"
echo "  ------|-------------|------|-------------|------|-------------|------"

# UTCの時刻をJSTに変換してマップを作成
declare -A MAIN_MAP
declare -A KAG_MAP
declare -A DEV_MAP

# mainのデータをJST変換してマップに格納
while IFS= read -r line; do
  if [ -n "$line" ]; then
    UTC_HOUR=$(echo "$line" | cut -d'|' -f1)
    SESSIONS=$(echo "$line" | cut -d'|' -f2)
    JST_HOUR=$(( (10#$UTC_HOUR + 9) % 24 ))
    JST_HOUR_STR=$(printf "%02d" $JST_HOUR)
    MAIN_MAP[$JST_HOUR_STR]=$SESSIONS
  fi
done < <(jq -r '.results[] |
  (.[] | select(.field == "hour_utc") | .value[11:13]) as $hour |
  (.[] | select(.field == "sessions") | .value) as $sessions |
  "\($hour)|\($sessions)"
' "$OUTPUT_DIR/hourly_main.json" 2>/dev/null)

# kagのデータをJST変換してマップに格納
while IFS= read -r line; do
  if [ -n "$line" ]; then
    UTC_HOUR=$(echo "$line" | cut -d'|' -f1)
    SESSIONS=$(echo "$line" | cut -d'|' -f2)
    JST_HOUR=$(( (10#$UTC_HOUR + 9) % 24 ))
    JST_HOUR_STR=$(printf "%02d" $JST_HOUR)
    KAG_MAP[$JST_HOUR_STR]=$SESSIONS
  fi
done < <(jq -r '.results[] |
  (.[] | select(.field == "hour_utc") | .value[11:13]) as $hour |
  (.[] | select(.field == "sessions") | .value) as $sessions |
  "\($hour)|\($sessions)"
' "$OUTPUT_DIR/hourly_kag.json" 2>/dev/null)

# devのデータをJST変換してマップに格納
while IFS= read -r line; do
  if [ -n "$line" ]; then
    UTC_HOUR=$(echo "$line" | cut -d'|' -f1)
    SESSIONS=$(echo "$line" | cut -d'|' -f2)
    JST_HOUR=$(( (10#$UTC_HOUR + 9) % 24 ))
    JST_HOUR_STR=$(printf "%02d" $JST_HOUR)
    DEV_MAP[$JST_HOUR_STR]=$SESSIONS
  fi
done < <(jq -r '.results[] |
  (.[] | select(.field == "hour_utc") | .value[11:13]) as $hour |
  (.[] | select(.field == "sessions") | .value) as $sessions |
  "\($hour)|\($sessions)"
' "$OUTPUT_DIR/hourly_dev.json" 2>/dev/null)

# 現在時刻（JST）から24時間分を古い順に表示
CURRENT_HOUR=$(TZ=Asia/Tokyo date +%H)
for i in $(seq 23 -1 0); do
  HOUR=$(( (10#$CURRENT_HOUR - i + 24) % 24 ))
  HOUR_STR=$(printf "%02d" $HOUR)

  # mainのカウント取得
  MAIN_COUNT=${MAIN_MAP[$HOUR_STR]:-0}
  MAIN_BARS=$(( MAIN_COUNT / 2 ))
  [ $MAIN_BARS -gt 10 ] && MAIN_BARS=10
  if [ $MAIN_BARS -gt 0 ]; then
    MAIN_BAR=$(printf '█%.0s' $(seq 1 $MAIN_BARS))
  else
    MAIN_BAR=""
  fi

  # kagのカウント取得
  KAG_COUNT=${KAG_MAP[$HOUR_STR]:-0}
  KAG_BARS=$(( KAG_COUNT / 2 ))
  [ $KAG_BARS -gt 10 ] && KAG_BARS=10
  if [ $KAG_BARS -gt 0 ]; then
    KAG_BAR=$(printf '█%.0s' $(seq 1 $KAG_BARS))
  else
    KAG_BAR=""
  fi

  # devのカウント取得
  DEV_COUNT=${DEV_MAP[$HOUR_STR]:-0}
  DEV_BARS=$(( DEV_COUNT / 2 ))
  [ $DEV_BARS -gt 10 ] && DEV_BARS=10
  if [ $DEV_BARS -gt 0 ]; then
    DEV_BAR=$(printf '█%.0s' $(seq 1 $DEV_BARS))
  else
    DEV_BAR=""
  fi

  printf "  %s:00 | %-11s | %4d | %-11s | %4d | %-11s | %4d\n" "$HOUR_STR" "$MAIN_BAR" "$MAIN_COUNT" "$KAG_BAR" "$KAG_COUNT" "$DEV_BAR" "$DEV_COUNT"
done
echo ""

echo "💰 Bedrockコスト（過去7日間・日別・クレジット適用前）"
echo "[sandbox (main+dev)]"
jq -r '
  .ResultsByTime[] |
  .TimePeriod.Start as $date |
  [.Groups[] | select(.Keys[0] | contains("Claude") or contains("Bedrock")) | .Metrics.UnblendedCost.Amount | tonumber] |
  add // 0 |
  "  \($date): $\(. | . * 100 | floor / 100)"
' "$OUTPUT_DIR/cost.json"

TOTAL_COST_SANDBOX=$(jq -r '
  [.ResultsByTime[].Groups[] | select(.Keys[0] | contains("Claude") or contains("Bedrock")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0
' "$OUTPUT_DIR/cost.json")
echo "  小計: \$$TOTAL_COST_SANDBOX"
echo ""

TOTAL_COST_KAG=0
if [ "$KAG_AVAILABLE" = true ]; then
  echo "[kag]"
  jq -r '
    .ResultsByTime[] |
    .TimePeriod.Start as $date |
    [.Groups[] | select(.Keys[0] | contains("Claude") or contains("Bedrock")) | .Metrics.UnblendedCost.Amount | tonumber] |
    add // 0 |
    "  \($date): $\(. | . * 100 | floor / 100)"
  ' "$OUTPUT_DIR/cost_kag.json"
  TOTAL_COST_KAG=$(jq -r '
    [.ResultsByTime[].Groups[] | select(.Keys[0] | contains("Claude") or contains("Bedrock")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0
  ' "$OUTPUT_DIR/cost_kag.json")
  echo "  小計: \$$TOTAL_COST_KAG"
  echo ""
fi

TOTAL_COST=$(echo "$TOTAL_COST_SANDBOX + $TOTAL_COST_KAG" | bc)
echo "  週間合計: \$$TOTAL_COST"
echo ""

# ========================================
# 環境別 x モデル別コスト（実コスト）
# ========================================
echo "💰 Bedrockコスト内訳（過去7日間・クレジット適用前）"
echo ""

# sandbox アカウントのモデル別コスト
SONNET_COST_SANDBOX=$(jq -r '
  [.ResultsByTime[].Groups[] | select(.Keys[0] | contains("Claude Sonnet 4.5")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0
' "$OUTPUT_DIR/cost.json")
OPUS_COST_SANDBOX=$(jq -r '
  [.ResultsByTime[].Groups[] | select(.Keys[0] | contains("Claude Opus")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0
' "$OUTPUT_DIR/cost.json")
KIMI_COST_SANDBOX=$(jq -r '
  [.ResultsByTime[].Groups[] | select(.Keys[0] | contains("Kimi")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0
' "$OUTPUT_DIR/cost.json")
OTHER_COST_SANDBOX=$(jq -r '
  [.ResultsByTime[].Groups[] | select((.Keys[0] | contains("Bedrock") or contains("Claude")) and (.Keys[0] | contains("Claude Sonnet 4.5") | not) and (.Keys[0] | contains("Claude Opus") | not) and (.Keys[0] | contains("Kimi") | not)) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0
' "$OUTPUT_DIR/cost.json")

# kag-sandbox アカウントのモデル別コスト
SONNET_COST_KAG_REAL=$(jq -r '
  [.ResultsByTime[].Groups[] | select(.Keys[0] | contains("Claude Sonnet 4.5")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0
' "$OUTPUT_DIR/cost_kag.json")
OPUS_COST_KAG_REAL=$(jq -r '
  [.ResultsByTime[].Groups[] | select(.Keys[0] | contains("Claude Opus")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0
' "$OUTPUT_DIR/cost_kag.json")
KIMI_COST_KAG_REAL=$(jq -r '
  [.ResultsByTime[].Groups[] | select(.Keys[0] | contains("Kimi")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0
' "$OUTPUT_DIR/cost_kag.json")
OTHER_COST_KAG_REAL=$(jq -r '
  [.ResultsByTime[].Groups[] | select((.Keys[0] | contains("Bedrock") or contains("Claude")) and (.Keys[0] | contains("Claude Sonnet 4.5") | not) and (.Keys[0] | contains("Claude Opus") | not) and (.Keys[0] | contains("Kimi") | not)) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0
' "$OUTPUT_DIR/cost_kag.json")

# sandbox 内の main/dev 比率（dev がある場合のみ分割）
SANDBOX_SESSIONS=$((TOTAL_MAIN + TOTAL_DEV))
if [ "$SANDBOX_SESSIONS" -gt 0 ] && [ "$TOTAL_DEV" -gt 0 ]; then
  MAIN_RATIO=$(echo "scale=6; $TOTAL_MAIN / $SANDBOX_SESSIONS" | bc)
  DEV_RATIO=$(echo "scale=6; $TOTAL_DEV / $SANDBOX_SESSIONS" | bc)

  S_MAIN=$(printf "%.2f" $(echo "$SONNET_COST_SANDBOX * $MAIN_RATIO" | bc -l))
  S_DEV=$(printf "%.2f" $(echo "$SONNET_COST_SANDBOX * $DEV_RATIO" | bc -l))
  O_MAIN=$(printf "%.2f" $(echo "$OPUS_COST_SANDBOX * $MAIN_RATIO" | bc -l))
  O_DEV=$(printf "%.2f" $(echo "$OPUS_COST_SANDBOX * $DEV_RATIO" | bc -l))
  K_MAIN=$(printf "%.2f" $(echo "$KIMI_COST_SANDBOX * $MAIN_RATIO" | bc -l))
  K_DEV=$(printf "%.2f" $(echo "$KIMI_COST_SANDBOX * $DEV_RATIO" | bc -l))
  OT_MAIN=$(printf "%.2f" $(echo "$OTHER_COST_SANDBOX * $MAIN_RATIO" | bc -l))
  OT_DEV=$(printf "%.2f" $(echo "$OTHER_COST_SANDBOX * $DEV_RATIO" | bc -l))
  ENV_MAIN=$(printf "%.2f" $(echo "$TOTAL_COST_SANDBOX * $MAIN_RATIO" | bc -l))
  ENV_DEV=$(printf "%.2f" $(echo "$TOTAL_COST_SANDBOX * $DEV_RATIO" | bc -l))
else
  # dev がない場合は sandbox = main
  S_MAIN=$(printf "%.2f" $SONNET_COST_SANDBOX)
  S_DEV="0.00"
  O_MAIN=$(printf "%.2f" $OPUS_COST_SANDBOX)
  O_DEV="0.00"
  K_MAIN=$(printf "%.2f" $KIMI_COST_SANDBOX)
  K_DEV="0.00"
  OT_MAIN=$(printf "%.2f" $OTHER_COST_SANDBOX)
  OT_DEV="0.00"
  ENV_MAIN=$(printf "%.2f" $TOTAL_COST_SANDBOX)
  ENV_DEV="0.00"
fi

# kag は実コスト
S_KAG=$(printf "%.2f" $SONNET_COST_KAG_REAL)
O_KAG=$(printf "%.2f" $OPUS_COST_KAG_REAL)
K_KAG=$(printf "%.2f" $KIMI_COST_KAG_REAL)
OT_KAG=$(printf "%.2f" $OTHER_COST_KAG_REAL)
ENV_KAG=$(printf "%.2f" $TOTAL_COST_KAG)

# 合計
S_TOTAL=$(printf "%.2f" $(echo "$SONNET_COST_SANDBOX + $SONNET_COST_KAG_REAL" | bc))
O_TOTAL=$(printf "%.2f" $(echo "$OPUS_COST_SANDBOX + $OPUS_COST_KAG_REAL" | bc))
K_TOTAL=$(printf "%.2f" $(echo "$KIMI_COST_SANDBOX + $KIMI_COST_KAG_REAL" | bc))
OT_TOTAL=$(printf "%.2f" $(echo "$OTHER_COST_SANDBOX + $OTHER_COST_KAG_REAL" | bc))
ENV_TOTAL=$(printf "%.2f" $(echo "$TOTAL_COST" | bc -l))

# 月間推定
M_MAIN=$(printf "%.0f" $(echo "$ENV_MAIN * 4" | bc -l))
M_KAG=$(printf "%.0f" $(echo "$ENV_KAG * 4" | bc -l))
M_DEV=$(printf "%.0f" $(echo "$ENV_DEV * 4" | bc -l))
M_TOTAL=$(printf "%.0f" $(echo "$ENV_TOTAL * 4" | bc -l))

echo "  ※ クレジット適用前の利用コスト（RECORD_TYPE=Usageでフィルタ）"
echo ""
printf "  %-16s | %8s | %8s | %8s | %8s\n" "モデル" "main" "kag" "dev" "合計"
printf "  %-16s-|----------|----------|----------|----------\n" "----------------"
printf "  %-16s | %8s | %8s | %8s | %8s\n" "Sonnet 4.5" "\$$S_MAIN" "\$$S_KAG" "\$$S_DEV" "\$$S_TOTAL"
printf "  %-16s | %8s | %8s | %8s | %8s\n" "Opus 4.6" "\$$O_MAIN" "\$$O_KAG" "\$$O_DEV" "\$$O_TOTAL"
printf "  %-16s | %8s | %8s | %8s | %8s\n" "Kimi K2" "\$$K_MAIN" "\$$K_KAG" "\$$K_DEV" "\$$K_TOTAL"
printf "  %-16s | %8s | %8s | %8s | %8s\n" "その他" "\$$OT_MAIN" "\$$OT_KAG" "\$$OT_DEV" "\$$OT_TOTAL"
printf "  %-16s-|----------|----------|----------|----------\n" "----------------"
printf "  %-16s | %8s | %8s | %8s | %8s\n" "週間合計" "\$$ENV_MAIN" "\$$ENV_KAG" "\$$ENV_DEV" "\$$ENV_TOTAL"
printf "  %-16s | %7s | %7s | %7s | %7s\n" "月間推定" "\$$M_MAIN" "\$$M_KAG" "\$$M_DEV" "\$$M_TOTAL"
echo ""
echo "  ※ Kimi K2はクレジット適用で実質\$0"
echo ""

# ========================================
# 1セッションあたりのコスト分析
# ========================================
echo "💡 1セッションあたりのコスト（過去7日間）"
echo ""
echo "  日付       | main+dev | kag      | 全体"
echo "  -----------|----------|----------|----------"

# 日別セッション数をmapに格納
declare -A DAILY_SESSIONS_SANDBOX
declare -A DAILY_SESSIONS_KAG_MAP
declare -A DAILY_COST_SANDBOX
declare -A DAILY_COST_KAG_MAP

# main+devのセッション数をsandboxとして集計
while IFS= read -r line; do
  if [ -n "$line" ]; then
    DATE=$(echo "$line" | cut -d'|' -f1)
    SESSIONS=$(echo "$line" | cut -d'|' -f2)
    DAILY_SESSIONS_SANDBOX[$DATE]=$((${DAILY_SESSIONS_SANDBOX[$DATE]:-0} + SESSIONS))
  fi
done < <(jq -r '.results[] |
  (.[] | select(.field == "day_utc") | .value | split(" ")[0]) as $date |
  (.[] | select(.field == "sessions") | .value) as $sessions |
  "\($date)|\($sessions)"
' "$OUTPUT_DIR/daily_main.json" 2>/dev/null)

# devのセッションも加算
while IFS= read -r line; do
  if [ -n "$line" ]; then
    DATE=$(echo "$line" | cut -d'|' -f1)
    SESSIONS=$(echo "$line" | cut -d'|' -f2)
    DAILY_SESSIONS_SANDBOX[$DATE]=$((${DAILY_SESSIONS_SANDBOX[$DATE]:-0} + SESSIONS))
  fi
done < <(jq -r '.results[] |
  (.[] | select(.field == "day_utc") | .value | split(" ")[0]) as $date |
  (.[] | select(.field == "sessions") | .value) as $sessions |
  "\($date)|\($sessions)"
' "$OUTPUT_DIR/daily_dev.json" 2>/dev/null)

# kagのセッション数
while IFS= read -r line; do
  if [ -n "$line" ]; then
    DATE=$(echo "$line" | cut -d'|' -f1)
    SESSIONS=$(echo "$line" | cut -d'|' -f2)
    DAILY_SESSIONS_KAG_MAP[$DATE]=$SESSIONS
  fi
done < <(jq -r '.results[] |
  (.[] | select(.field == "day_utc") | .value | split(" ")[0]) as $date |
  (.[] | select(.field == "sessions") | .value) as $sessions |
  "\($date)|\($sessions)"
' "$OUTPUT_DIR/daily_kag.json" 2>/dev/null)

# sandboxの日別コスト
while IFS= read -r line; do
  if [ -n "$line" ]; then
    DATE=$(echo "$line" | cut -d'|' -f1)
    COST=$(echo "$line" | cut -d'|' -f2)
    DAILY_COST_SANDBOX[$DATE]=$COST
  fi
done < <(jq -r '
  .ResultsByTime[] |
  .TimePeriod.Start as $date |
  ([.Groups[] | select(.Keys[0] | contains("Claude") or contains("Bedrock")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0) as $cost |
  "\($date)|\($cost)"
' "$OUTPUT_DIR/cost.json" 2>/dev/null)

# kagの日別コスト
while IFS= read -r line; do
  if [ -n "$line" ]; then
    DATE=$(echo "$line" | cut -d'|' -f1)
    COST=$(echo "$line" | cut -d'|' -f2)
    DAILY_COST_KAG_MAP[$DATE]=$COST
  fi
done < <(jq -r '
  .ResultsByTime[] |
  .TimePeriod.Start as $date |
  ([.Groups[] | select(.Keys[0] | contains("Claude") or contains("Bedrock")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0) as $cost |
  "\($date)|\($cost)"
' "$OUTPUT_DIR/cost_kag.json" 2>/dev/null)

# 日別セッション単価表示
CPS_SUM_COST_SB=0
CPS_SUM_COST_KG=0
CPS_SUM_SESS_SB=0
CPS_SUM_SESS_KG=0

for DATE in $(jq -r '.ResultsByTime[].TimePeriod.Start' "$OUTPUT_DIR/cost.json" | sort); do
  S_SB=${DAILY_SESSIONS_SANDBOX[$DATE]:-0}
  S_KG=${DAILY_SESSIONS_KAG_MAP[$DATE]:-0}
  C_SB=${DAILY_COST_SANDBOX[$DATE]:-0}
  C_KG=${DAILY_COST_KAG_MAP[$DATE]:-0}
  S_ALL=$((S_SB + S_KG))
  C_ALL=$(echo "$C_SB + $C_KG" | bc)

  if [ "$S_SB" -gt 0 ]; then
    CPS_SB=$(printf "%.2f" $(echo "scale=4; $C_SB / $S_SB" | bc))
  else
    CPS_SB="-"
  fi
  if [ "$S_KG" -gt 0 ]; then
    CPS_KG=$(printf "%.2f" $(echo "scale=4; $C_KG / $S_KG" | bc))
  else
    CPS_KG="-"
  fi
  if [ "$S_ALL" -gt 0 ]; then
    CPS_ALL=$(printf "%.2f" $(echo "scale=4; $C_ALL / $S_ALL" | bc))
  else
    CPS_ALL="-"
  fi

  printf "  %s | \$%-6s | \$%-6s | \$%-6s\n" "$DATE" "$CPS_SB" "$CPS_KG" "$CPS_ALL"

  CPS_SUM_COST_SB=$(echo "$CPS_SUM_COST_SB + $C_SB" | bc)
  CPS_SUM_COST_KG=$(echo "$CPS_SUM_COST_KG + $C_KG" | bc)
  CPS_SUM_SESS_SB=$((CPS_SUM_SESS_SB + S_SB))
  CPS_SUM_SESS_KG=$((CPS_SUM_SESS_KG + S_KG))
done

echo "  -----------|----------|----------|----------"

CPS_SUM_SESS_ALL=$((CPS_SUM_SESS_SB + CPS_SUM_SESS_KG))
CPS_SUM_COST_ALL=$(echo "$CPS_SUM_COST_SB + $CPS_SUM_COST_KG" | bc)
if [ "$CPS_SUM_SESS_SB" -gt 0 ]; then
  AVG_SB=$(printf "%.2f" $(echo "scale=4; $CPS_SUM_COST_SB / $CPS_SUM_SESS_SB" | bc))
else
  AVG_SB="-"
fi
if [ "$CPS_SUM_SESS_KG" -gt 0 ]; then
  AVG_KG=$(printf "%.2f" $(echo "scale=4; $CPS_SUM_COST_KG / $CPS_SUM_SESS_KG" | bc))
else
  AVG_KG="-"
fi
if [ "$CPS_SUM_SESS_ALL" -gt 0 ]; then
  AVG_ALL=$(printf "%.2f" $(echo "scale=4; $CPS_SUM_COST_ALL / $CPS_SUM_SESS_ALL" | bc))
else
  AVG_ALL="-"
fi
printf "  平均       | \$%-6s | \$%-6s | \$%-6s\n" "$AVG_SB" "$AVG_KG" "$AVG_ALL"
echo ""
echo "  ※ 施策前参考値: \$0.58/回"
echo ""

# ========================================
# Claudeモデル キャッシュ効果（両アカウント合算）
# ========================================

# --- Sonnet 4.5 ---
echo "📊 Claude Sonnet 4.5 キャッシュ効果"

S_INPUT_COST=$(echo \
  "$(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("InputToken") and (test("Cache") | not)) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/sonnet_usage.json")" \
  "+ $(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("InputToken") and (test("Cache") | not)) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/sonnet_usage_kag.json")" \
  | bc)
S_OUTPUT_COST=$(echo \
  "$(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("OutputToken")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/sonnet_usage.json")" \
  "+ $(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("OutputToken")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/sonnet_usage_kag.json")" \
  | bc)
S_CACHE_READ_COST=$(echo \
  "$(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("CacheReadInputToken")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/sonnet_usage.json")" \
  "+ $(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("CacheReadInputToken")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/sonnet_usage_kag.json")" \
  | bc)
S_CACHE_WRITE_COST=$(echo \
  "$(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("CacheWriteInputToken")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/sonnet_usage.json")" \
  "+ $(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("CacheWriteInputToken")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/sonnet_usage_kag.json")" \
  | bc)

printf "  通常Input:   \$%.2f\n" $S_INPUT_COST
printf "  Output:      \$%.2f\n" $S_OUTPUT_COST
printf "  CacheRead:   \$%.2f\n" $S_CACHE_READ_COST
printf "  CacheWrite:  \$%.2f\n" $S_CACHE_WRITE_COST

# Sonnet キャッシュヒット率計算（Input: $3/1M, CacheRead: $0.30/1M）
if (( $(echo "$S_INPUT_COST > 0 || $S_CACHE_READ_COST > 0" | bc -l) )); then
  S_INPUT_TOKENS=$(echo "scale=0; $S_INPUT_COST / 0.000003" | bc)
  S_CACHE_READ_TOKENS=$(echo "scale=0; $S_CACHE_READ_COST / 0.0000003" | bc)
  S_TOTAL_INPUT_TOKENS=$(echo "$S_INPUT_TOKENS + $S_CACHE_READ_TOKENS" | bc)
  if [ "$S_TOTAL_INPUT_TOKENS" != "0" ]; then
    S_CACHE_HIT_RATE=$(echo "scale=1; $S_CACHE_READ_TOKENS * 100 / $S_TOTAL_INPUT_TOKENS" | bc)
    echo "  📈 キャッシュヒット率: ${S_CACHE_HIT_RATE}%"
    S_WOULD_HAVE_COST=$(echo "scale=2; $S_CACHE_READ_TOKENS * 0.000003" | bc)
    S_SAVINGS=$(echo "scale=2; $S_WOULD_HAVE_COST - $S_CACHE_READ_COST" | bc)
    S_NET_SAVINGS=$(echo "scale=2; $S_SAVINGS - $S_CACHE_WRITE_COST" | bc)
    printf "  💰 キャッシュ節約額: \$%.2f（CacheWrite考慮後: \$%.2f）\n" $S_SAVINGS $S_NET_SAVINGS
  fi
fi
echo ""

# --- Opus 4.6 ---
O_INPUT_COST2=$(echo \
  "$(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("InputToken") and (test("Cache") | not)) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/opus_usage.json")" \
  "+ $(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("InputToken") and (test("Cache") | not)) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/opus_usage_kag.json")" \
  | bc)
O_OUTPUT_COST2=$(echo \
  "$(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("OutputToken")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/opus_usage.json")" \
  "+ $(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("OutputToken")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/opus_usage_kag.json")" \
  | bc)
O_CACHE_READ_COST2=$(echo \
  "$(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("CacheReadInputToken")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/opus_usage.json")" \
  "+ $(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("CacheReadInputToken")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/opus_usage_kag.json")" \
  | bc)
O_CACHE_WRITE_COST2=$(echo \
  "$(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("CacheWriteInputToken")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/opus_usage.json")" \
  "+ $(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("CacheWriteInputToken")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/opus_usage_kag.json")" \
  | bc)
O_TOTAL2=$(echo "$O_INPUT_COST2 + $O_OUTPUT_COST2 + $O_CACHE_READ_COST2 + $O_CACHE_WRITE_COST2" | bc)

if (( $(echo "$O_TOTAL2 > 0" | bc -l) )); then
  echo "📊 Claude Opus 4.6 キャッシュ効果"
  printf "  通常Input:   \$%.2f\n" $O_INPUT_COST2
  printf "  Output:      \$%.2f\n" $O_OUTPUT_COST2
  printf "  CacheRead:   \$%.2f\n" $O_CACHE_READ_COST2
  printf "  CacheWrite:  \$%.2f\n" $O_CACHE_WRITE_COST2

  # Opus キャッシュヒット率計算（Input: $15/1M, CacheRead: $1.50/1M）
  if (( $(echo "$O_INPUT_COST2 > 0 || $O_CACHE_READ_COST2 > 0" | bc -l) )); then
    O_INPUT_TOKENS=$(echo "scale=0; $O_INPUT_COST2 / 0.000015" | bc)
    O_CACHE_READ_TOKENS=$(echo "scale=0; $O_CACHE_READ_COST2 / 0.0000015" | bc)
    O_TOTAL_INPUT_TOKENS=$(echo "$O_INPUT_TOKENS + $O_CACHE_READ_TOKENS" | bc)
    if [ "$O_TOTAL_INPUT_TOKENS" != "0" ]; then
      O_CACHE_HIT_RATE=$(echo "scale=1; $O_CACHE_READ_TOKENS * 100 / $O_TOTAL_INPUT_TOKENS" | bc)
      echo "  📈 キャッシュヒット率: ${O_CACHE_HIT_RATE}%"
      O_WOULD_HAVE_COST=$(echo "scale=2; $O_CACHE_READ_TOKENS * 0.000015" | bc)
      O_SAVINGS=$(echo "scale=2; $O_WOULD_HAVE_COST - $O_CACHE_READ_COST2" | bc)
      O_NET_SAVINGS=$(echo "scale=2; $O_SAVINGS - $O_CACHE_WRITE_COST2" | bc)
      printf "  💰 キャッシュ節約額: \$%.2f（CacheWrite考慮後: \$%.2f）\n" $O_SAVINGS $O_NET_SAVINGS
    fi
  fi
  echo ""
fi

# ========================================
# 週次トレンド（v0.1リリース以降）
# ========================================
echo "📅 週次トレンド（リリース以降）"
echo ""

# jqで日次データに週番号を付けてファイルに保存
jq -r '.results[] |
  (.[] | select(.field == "day_utc") | .value | split(" ")[0]) as $date |
  (.[] | select(.field == "sessions") | .value) as $sessions |
  "\($date)|\($sessions)"
' "$OUTPUT_DIR/weekly_main.json" 2>/dev/null | while read line; do
  DATE=$(echo "$line" | cut -d'|' -f1)
  SESSIONS=$(echo "$line" | cut -d'|' -f2)
  WEEK=$(date -j -f "%Y-%m-%d" "$DATE" "+%Y-W%W" 2>/dev/null)
  echo "$WEEK|main|$SESSIONS"
done > "$OUTPUT_DIR/weekly_sessions.tmp"

jq -r '.results[] |
  (.[] | select(.field == "day_utc") | .value | split(" ")[0]) as $date |
  (.[] | select(.field == "sessions") | .value) as $sessions |
  "\($date)|\($sessions)"
' "$OUTPUT_DIR/weekly_kag.json" 2>/dev/null | while read line; do
  DATE=$(echo "$line" | cut -d'|' -f1)
  SESSIONS=$(echo "$line" | cut -d'|' -f2)
  WEEK=$(date -j -f "%Y-%m-%d" "$DATE" "+%Y-W%W" 2>/dev/null)
  echo "$WEEK|kag|$SESSIONS"
done >> "$OUTPUT_DIR/weekly_sessions.tmp"

# sandbox アカウントのコスト
jq -r '
  .ResultsByTime[] |
  .TimePeriod.Start as $date |
  ([.Groups[] | select(.Keys[0] | contains("Claude") or contains("Bedrock")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0) as $cost |
  "\($date)|\($cost)"
' "$OUTPUT_DIR/weekly_cost.json" 2>/dev/null | while read line; do
  DATE=$(echo "$line" | cut -d'|' -f1)
  COST=$(echo "$line" | cut -d'|' -f2)
  WEEK=$(date -j -f "%Y-%m-%d" "$DATE" "+%Y-W%W" 2>/dev/null)
  echo "$WEEK|cost|$COST"
done >> "$OUTPUT_DIR/weekly_sessions.tmp"

# kag-sandbox アカウントのコスト
jq -r '
  .ResultsByTime[] |
  .TimePeriod.Start as $date |
  ([.Groups[] | select(.Keys[0] | contains("Claude") or contains("Bedrock")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0) as $cost |
  "\($date)|\($cost)"
' "$OUTPUT_DIR/weekly_cost_kag.json" 2>/dev/null | while read line; do
  DATE=$(echo "$line" | cut -d'|' -f1)
  COST=$(echo "$line" | cut -d'|' -f2)
  WEEK=$(date -j -f "%Y-%m-%d" "$DATE" "+%Y-W%W" 2>/dev/null)
  echo "$WEEK|cost|$COST"
done >> "$OUTPUT_DIR/weekly_sessions.tmp"

echo "  週        | main | kag  | 合計 |  コスト"
echo "  ----------|------|------|------|--------"

# 週ごとに集計して表示
cat "$OUTPUT_DIR/weekly_sessions.tmp" | cut -d'|' -f1 | sort -u | while read WEEK; do
  if [ -n "$WEEK" ]; then
    W_MAIN=$(grep "^$WEEK|main|" "$OUTPUT_DIR/weekly_sessions.tmp" | cut -d'|' -f3 | tr '\n' '+' | sed 's/+$/\n/' | bc 2>/dev/null || echo 0)
    W_MAIN=${W_MAIN:-0}
    W_KAG=$(grep "^$WEEK|kag|" "$OUTPUT_DIR/weekly_sessions.tmp" | cut -d'|' -f3 | tr '\n' '+' | sed 's/+$/\n/' | bc 2>/dev/null || echo 0)
    W_KAG=${W_KAG:-0}
    W_COST=$(grep "^$WEEK|cost|" "$OUTPUT_DIR/weekly_sessions.tmp" | cut -d'|' -f3 | tr '\n' '+' | sed 's/+$/\n/' | bc 2>/dev/null || echo 0)
    W_COST=$(printf "%.0f" ${W_COST:-0})
    W_TOTAL=$((W_MAIN + W_KAG))
    printf "  %-9s | %4d | %4d | %4d | \$%s\n" "$WEEK" "$W_MAIN" "$W_KAG" "$W_TOTAL" "$W_COST"
  fi
done

rm -f "$OUTPUT_DIR/weekly_sessions.tmp"
echo ""

# ========================================
# Tavily API 利用状況
# ========================================
if [ "$TAVILY_KEY_COUNT" -gt 0 ]; then
  echo "🔍 Tavily API 利用状況"
  echo ""
  echo "  キー  | 使用量 | 上限   | 残り   | 状態"
  echo "  ------|--------|--------|--------|------"

  TAVILY_TOTAL_USED=0
  TAVILY_TOTAL_LIMIT=0

  for i in $(seq 1 $TAVILY_KEY_COUNT); do
    FILE="$OUTPUT_DIR/tavily_key${i}.json"
    if [ -f "$FILE" ] && [ -s "$FILE" ]; then
      USED=$(jq -r '.key.usage // 0' "$FILE" 2>/dev/null)
      LIMIT=$(jq -r '.account.plan_limit // 0' "$FILE" 2>/dev/null)
      [ "$USED" = "null" ] && USED=0
      [ "$LIMIT" = "null" ] && LIMIT=1000
      REMAINING=$((LIMIT - USED))
      [ $REMAINING -lt 0 ] && REMAINING=0

      if [ $REMAINING -le 0 ]; then
        STATUS="枯渇"
      elif [ $REMAINING -le 100 ]; then
        STATUS="残少"
      else
        STATUS="OK"
      fi

      printf "  KEY%-2d | %6d | %6d | %6d | %s\n" "$i" "$USED" "$LIMIT" "$REMAINING" "$STATUS"

      TAVILY_TOTAL_USED=$((TAVILY_TOTAL_USED + USED))
      TAVILY_TOTAL_LIMIT=$((TAVILY_TOTAL_LIMIT + LIMIT))
    fi
  done

  TAVILY_TOTAL_REMAINING=$((TAVILY_TOTAL_LIMIT - TAVILY_TOTAL_USED))
  [ $TAVILY_TOTAL_REMAINING -lt 0 ] && TAVILY_TOTAL_REMAINING=0
  echo "  ------|--------|--------|--------|------"
  printf "  合計  | %6d | %6d | %6d |\n" "$TAVILY_TOTAL_USED" "$TAVILY_TOTAL_LIMIT" "$TAVILY_TOTAL_REMAINING"

  # 日平均消費の推定（全体セッション数から逆算: セッション≒検索回数）
  TOTAL_SESSIONS_ALL=$((TOTAL_MAIN + TOTAL_KAG + TOTAL_DEV))
  if [ "$TOTAL_SESSIONS_ALL" -gt 0 ]; then
    DAYS_WITH_DATA=$(jq '.ResultsByTime | length' "$OUTPUT_DIR/cost.json")
    [ "$DAYS_WITH_DATA" -lt 1 ] && DAYS_WITH_DATA=1
    DAILY_CREDITS=$(echo "scale=0; $TOTAL_SESSIONS_ALL / $DAYS_WITH_DATA" | bc)
    [ "$DAILY_CREDITS" -lt 1 ] && DAILY_CREDITS=1
  else
    DAILY_CREDITS=53  # フォールバック値（最適化後実測値）
  fi

  if [ $TAVILY_TOTAL_REMAINING -gt 0 ] && [ "$DAILY_CREDITS" -gt 0 ]; then
    DAYS_LEFT=$((TAVILY_TOTAL_REMAINING / DAILY_CREDITS))
    EXHAUST_DATE=$(date -v+${DAYS_LEFT}d +%Y-%m-%d)
    echo ""
    echo "  日平均消費: ${DAILY_CREDITS}クレジット/日（直近7日間のセッション数ベース）"
    echo "  枯渇予測: 約${DAYS_LEFT}日後（${EXHAUST_DATE}頃）"
  elif [ $TAVILY_TOTAL_REMAINING -le 0 ]; then
    echo ""
    echo "  ⚠️  全キーが枯渇しています"
  fi
  echo ""
fi

echo "✅ 完了！"
```

## 出力フォーマット

スクリプト実行後、以下の情報が出力される：

1. **直近12時間のセッション数**: 時間帯別の表形式（main/kag/dev）
2. **Cognitoユーザー数**: 環境ごとのユーザー数（main/kag）+ kag最近追加ユーザーのEmail一覧
3. **日次セッション数**: 過去7日間の日別回数（main/kag/dev別）
4. **時間別セッション数**: 直近24時間の全時間帯（ASCIIバーグラフ・JST表示、main/kag/dev）
5. **Bedrockコスト（日別）**: 過去7日間の日別コスト（main+dev/kag別）
6. **Bedrockコスト内訳（環境別 x モデル別）**: アカウント別実コストによる環境別・モデル別コスト表（週間・月間推定付き）
7. **1セッションあたりのコスト**: 日別のセッション単価（main+dev/kag/全体）と平均値。コスト削減施策の効果確認用
8. **Claudeモデル キャッシュ効果**: Sonnet 4.5 / Opus 4.6 各モデルのInput/Output/CacheRead/CacheWriteの内訳、キャッシュヒット率、節約額（両アカウント合算）
9. **週次トレンド**: リリース以降の週ごとのセッション数とコストの推移（過去4週間、両アカウント合算）
10. **Tavily API 利用状況**: キー別の使用量/上限/残り、日平均消費クレジット、枯渇予測日

## アーキテクチャ

```
sandbox アカウント (715841358122)
├── Cognito: marp-main プール
├── AgentCore: marp_agent_main, marp_agent_dev
└── Bedrock: main + dev のコスト

kag-sandbox アカウント (105778051969)
├── Cognito: amplifyAuthUserPool（CloudFormation出力で特定）
├── AgentCore: marp_agent_main（kagリポのmainブランチ）
└── Bedrock: kag のコスト
```

## 技術詳細

### マルチアカウント対応

mainとkagは異なるAWSアカウントで運用されている。スクリプトは `PROFILE_MAIN` と `PROFILE_KAG` の2つのプロファイルを使い分ける。

- **sandbox**: main環境 + dev環境のリソースとコスト
- **kag-sandbox**: kag環境のリソースとコスト

SSOセッションが切れている場合、スクリプトが自動的に `aws sso login` を実行する。kag-sandboxのログインに失敗した場合のみ、kagのデータはスキップされる。

### コスト計算方法

- **クレジット除外**: Cost Explorer APIで `RECORD_TYPE=Usage` フィルターを適用し、AWSクレジット適用前の実利用コストを取得
- **kag**: kag-sandboxアカウントの実コスト（推定なし）
- **main/dev**: sandboxアカウントのコストをセッション比率で按分（devセッションがない場合は全額main）

### OTELログ形式への対応

AgentCoreのログは `otel-rt-logs` ストリームにOTEL形式で出力される。各セッションは `session.id` フィールドで識別されるため、`count_distinct(sid)` でユニークセッション数をカウントする。

### タイムゾーン変換

CloudWatch Logs Insightsで `datefloor(@timestamp + 9h, ...)` を使うと挙動が不安定なため、UTCのまま集計してからスクリプト側でJSTに変換している。

### kag-sandbox の Cognito プール特定

kag-sandboxアカウントではCognitoプール名が汎用的（`amplifyAuthUserPool*`）なため、`marp-kag` のような名前検索ができない。代わりにCloudFormation出力からAmplifyアプリ `dt1uykzxnkuoh` に紐づくプールIDを取得している。

## 注意事項

- SSOセッションが切れている場合はスクリプトが自動的に `aws sso login` を実行する（ブラウザ認証が必要）
- kag-sandbox のログインに失敗した場合のみ、kagのデータはスキップされる
- CloudWatch Logsクエリは非同期のため10秒待機している（必要に応じて調整）

## 回答時の表示ルール

スクリプト実行後、ユーザーへの回答では以下を守ること：

1. **直近12時間のセッション数**: サマリーせず、スクリプト出力の表形式をそのままMarkdownテーブルとして表示する
2. **1セッションあたりのコスト**: サマリーせず、日別テーブルをそのままMarkdownテーブルとして表示する
3. **Tavily API 利用状況**: サマリーせず、キー別テーブルと枯渇予測をそのまま表示する
4. その他のデータは適宜サマリーしてOK
