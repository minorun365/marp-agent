---
name: check-app-stats
description: このアプリの利用統計を確認（Cognitoユーザー数、AgentCore呼び出し回数、Bedrockコスト）。※Tavily APIの残量は /check-tavily-credits を使用
allowed-tools: Bash(aws:*)
---

# 環境利用状況チェック

各Amplify環境（main/kag）のCognitoユーザー数とBedrock AgentCoreランタイムのセッション数を調査する。Bedrockコストについてはdev環境も含めて集計する。

## 実行方法

**重要**: 以下のBashスクリプトを**そのまま1回で実行**すること。すべてのデータ取得を並列化し、1回の承認で完了する。

```bash
#!/bin/bash
set -e

REGION="us-east-1"
PROFILE="sandbox"
OUTPUT_DIR="/tmp/marp-stats"
mkdir -p "$OUTPUT_DIR"

echo "📊 Marp Agent 利用状況を取得中..."

# ========================================
# 1. リソースID取得
# ========================================
echo "🔍 リソースIDを取得中..."

# Cognito User Pool ID取得（marp-main, marp-kagで検索）
POOL_MAIN=$(aws cognito-idp list-user-pools --max-results 60 --region $REGION --profile $PROFILE \
  --query "UserPools[?contains(Name, 'marp-main')].Id" --output text)
POOL_KAG=$(aws cognito-idp list-user-pools --max-results 60 --region $REGION --profile $PROFILE \
  --query "UserPools[?contains(Name, 'marp-kag')].Id" --output text)

# AgentCore ロググループ名取得（main/kag/dev）
LOG_MAIN=$(aws logs describe-log-groups \
  --log-group-name-prefix /aws/bedrock-agentcore/runtimes/marp_agent_main \
  --region $REGION --profile $PROFILE --query "logGroups[0].logGroupName" --output text)
LOG_KAG=$(aws logs describe-log-groups \
  --log-group-name-prefix /aws/bedrock-agentcore/runtimes/marp_agent_kag \
  --region $REGION --profile $PROFILE --query "logGroups[0].logGroupName" --output text)
LOG_DEV=$(aws logs describe-log-groups \
  --log-group-name-prefix /aws/bedrock-agentcore/runtimes/marp_agent_dev \
  --region $REGION --profile $PROFILE --query "logGroups[0].logGroupName" --output text 2>/dev/null || echo "None")

# ========================================
# 2. Cognitoユーザー数取得（前回値との比較用キャッシュ付き）
# ========================================
echo "👥 Cognitoユーザー数を取得中..."
USERS_MAIN=$(aws cognito-idp describe-user-pool --user-pool-id "$POOL_MAIN" --region $REGION --profile $PROFILE \
  --query "UserPool.EstimatedNumberOfUsers" --output text 2>/dev/null || echo "0")
USERS_KAG=$(aws cognito-idp describe-user-pool --user-pool-id "$POOL_KAG" --region $REGION --profile $PROFILE \
  --query "UserPool.EstimatedNumberOfUsers" --output text 2>/dev/null || echo "0")

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

# 日次クエリ開始（main/kag並列）
Q_DAILY_MAIN=$(aws logs start-query \
  --log-group-name "$LOG_MAIN" \
  --start-time $START_7D --end-time $END_NOW \
  --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1d) as day_utc | sort day_utc asc" \
  --region $REGION --profile $PROFILE --query 'queryId' --output text)

Q_DAILY_KAG=$(aws logs start-query \
  --log-group-name "$LOG_KAG" \
  --start-time $START_7D --end-time $END_NOW \
  --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1d) as day_utc | sort day_utc asc" \
  --region $REGION --profile $PROFILE --query 'queryId' --output text)

Q_DAILY_DEV=""
if [ "$LOG_DEV" != "None" ]; then
  Q_DAILY_DEV=$(aws logs start-query \
    --log-group-name "$LOG_DEV" \
    --start-time $START_7D --end-time $END_NOW \
    --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1d) as day_utc | sort day_utc asc" \
    --region $REGION --profile $PROFILE --query 'queryId' --output text)
fi

# 時間別クエリ開始（main/kag/dev並列）
Q_HOURLY_MAIN=$(aws logs start-query \
  --log-group-name "$LOG_MAIN" \
  --start-time $START_24H --end-time $END_NOW \
  --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1h) as hour_utc | sort hour_utc asc" \
  --region $REGION --profile $PROFILE --query 'queryId' --output text)

Q_HOURLY_KAG=$(aws logs start-query \
  --log-group-name "$LOG_KAG" \
  --start-time $START_24H --end-time $END_NOW \
  --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1h) as hour_utc | sort hour_utc asc" \
  --region $REGION --profile $PROFILE --query 'queryId' --output text)

Q_HOURLY_DEV=""
if [ "$LOG_DEV" != "None" ]; then
  Q_HOURLY_DEV=$(aws logs start-query \
    --log-group-name "$LOG_DEV" \
    --start-time $START_24H --end-time $END_NOW \
    --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1h) as hour_utc | sort hour_utc asc" \
    --region $REGION --profile $PROFILE --query 'queryId' --output text)
fi

# 週次クエリ開始（過去4週間、main/kag並列）
Q_WEEKLY_MAIN=$(aws logs start-query \
  --log-group-name "$LOG_MAIN" \
  --start-time $START_28D --end-time $END_NOW \
  --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1d) as day_utc | sort day_utc asc" \
  --region $REGION --profile $PROFILE --query 'queryId' --output text)

Q_WEEKLY_KAG=$(aws logs start-query \
  --log-group-name "$LOG_KAG" \
  --start-time $START_28D --end-time $END_NOW \
  --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1d) as day_utc | sort day_utc asc" \
  --region $REGION --profile $PROFILE --query 'queryId' --output text)

# ========================================
# 4. Bedrockコスト取得（クエリ待機中に並列実行）
# ========================================
echo "💰 Bedrockコストを取得中..."

# サービス別コスト（Claude/Kimi/Bedrock全体）
aws ce get-cost-and-usage \
  --time-period Start=$(date -v-7d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics "UnblendedCost" \
  --group-by Type=DIMENSION,Key=SERVICE \
  --region $REGION --profile $PROFILE \
  --output json > "$OUTPUT_DIR/cost.json"

# Claude Sonnet 4.5の使用タイプ別コスト（キャッシュ効果分析用）
aws ce get-cost-and-usage \
  --time-period Start=$(date -v-7d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics "UnblendedCost" \
  --filter '{
    "Dimensions": {
      "Key": "SERVICE",
      "Values": ["Claude Sonnet 4.5 (Amazon Bedrock Edition)"]
    }
  }' \
  --group-by Type=DIMENSION,Key=USAGE_TYPE \
  --region $REGION --profile $PROFILE \
  --output json > "$OUTPUT_DIR/sonnet_usage.json"

# Claude Opus 4.6の使用タイプ別コスト（キャッシュ効果分析用）
aws ce get-cost-and-usage \
  --time-period Start=$(date -v-7d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics "UnblendedCost" \
  --filter '{
    "Dimensions": {
      "Key": "SERVICE",
      "Values": ["Claude Opus 4.6 (Amazon Bedrock Edition)"]
    }
  }' \
  --group-by Type=DIMENSION,Key=USAGE_TYPE \
  --region $REGION --profile $PROFILE \
  --output json > "$OUTPUT_DIR/opus_usage.json"

# 週次コスト取得（過去4週間）
aws ce get-cost-and-usage \
  --time-period Start=$(date -v-28d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics "UnblendedCost" \
  --group-by Type=DIMENSION,Key=SERVICE \
  --region $REGION --profile $PROFILE \
  --output json > "$OUTPUT_DIR/weekly_cost.json"

# ========================================
# 5. クエリ結果取得（10秒待機後）
# ========================================
echo "⏳ クエリ完了を待機中..."
sleep 10

echo "📥 クエリ結果を取得中..."
aws logs get-query-results --query-id "$Q_DAILY_MAIN" --region $REGION --profile $PROFILE > "$OUTPUT_DIR/daily_main.json"
aws logs get-query-results --query-id "$Q_DAILY_KAG" --region $REGION --profile $PROFILE > "$OUTPUT_DIR/daily_kag.json"
aws logs get-query-results --query-id "$Q_HOURLY_MAIN" --region $REGION --profile $PROFILE > "$OUTPUT_DIR/hourly_main.json"
aws logs get-query-results --query-id "$Q_HOURLY_KAG" --region $REGION --profile $PROFILE > "$OUTPUT_DIR/hourly_kag.json"
if [ -n "$Q_DAILY_DEV" ]; then
  aws logs get-query-results --query-id "$Q_DAILY_DEV" --region $REGION --profile $PROFILE > "$OUTPUT_DIR/daily_dev.json"
  aws logs get-query-results --query-id "$Q_HOURLY_DEV" --region $REGION --profile $PROFILE > "$OUTPUT_DIR/hourly_dev.json"
else
  echo '{"results":[]}' > "$OUTPUT_DIR/daily_dev.json"
  echo '{"results":[]}' > "$OUTPUT_DIR/hourly_dev.json"
fi
aws logs get-query-results --query-id "$Q_WEEKLY_MAIN" --region $REGION --profile $PROFILE > "$OUTPUT_DIR/weekly_main.json"
aws logs get-query-results --query-id "$Q_WEEKLY_KAG" --region $REGION --profile $PROFILE > "$OUTPUT_DIR/weekly_kag.json"

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
echo ""

# UTC→JST変換関数（日付用：+9時間で日付が変わる場合を考慮）
utc_to_jst_date() {
  local utc_date="$1"
  # UTCの日付に9時間加算（日本時間では15:00以降が翌日扱い）
  # ただしCloudWatch Logsのdatefloorは00:00基準なので、そのままでOK
  echo "$utc_date"
}

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

echo "💰 Bedrockコスト（過去7日間・日別）"
jq -r '
  .ResultsByTime[] |
  .TimePeriod.Start as $date |
  [.Groups[] | select(.Keys[0] | contains("Claude") or contains("Bedrock")) | .Metrics.UnblendedCost.Amount | tonumber] |
  add // 0 |
  "  \($date): $\(. | . * 100 | floor / 100)"
' "$OUTPUT_DIR/cost.json"

TOTAL_COST=$(jq -r '
  [.ResultsByTime[].Groups[] | select(.Keys[0] | contains("Claude") or contains("Bedrock")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0
' "$OUTPUT_DIR/cost.json")
echo "  週間合計: \$$TOTAL_COST"
echo ""

# ========================================
# 環境別 x モデル別コスト（表形式）
# ========================================
echo "💰 Bedrockコスト内訳（過去7日間・セッション比率で環境按分）"
echo ""

# モデル別コスト取得
CLAUDE_SONNET_COST=$(jq -r '
  [.ResultsByTime[].Groups[] | select(.Keys[0] | contains("Claude Sonnet 4.5")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0
' "$OUTPUT_DIR/cost.json")

CLAUDE_OPUS_COST=$(jq -r '
  [.ResultsByTime[].Groups[] | select(.Keys[0] | contains("Claude Opus")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0
' "$OUTPUT_DIR/cost.json")

KIMI_COST=$(jq -r '
  [.ResultsByTime[].Groups[] | select(.Keys[0] | contains("Kimi")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0
' "$OUTPUT_DIR/cost.json")

OTHER_BEDROCK_COST=$(jq -r '
  [.ResultsByTime[].Groups[] | select((.Keys[0] | contains("Bedrock") or contains("Claude")) and (.Keys[0] | contains("Claude Sonnet 4.5") | not) and (.Keys[0] | contains("Claude Opus") | not) and (.Keys[0] | contains("Kimi") | not)) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0
' "$OUTPUT_DIR/cost.json")

# セッション比率で環境別に按分
TOTAL_INV=$((TOTAL_MAIN + TOTAL_KAG + TOTAL_DEV))
if [ "$TOTAL_INV" -gt 0 ]; then
  # 比率計算（小数）
  MAIN_RATIO=$(echo "scale=6; $TOTAL_MAIN / $TOTAL_INV" | bc)
  KAG_RATIO=$(echo "scale=6; $TOTAL_KAG / $TOTAL_INV" | bc)
  DEV_RATIO=$(echo "scale=6; $TOTAL_DEV / $TOTAL_INV" | bc)
  MAIN_PCT=$((TOTAL_MAIN * 100 / TOTAL_INV))
  KAG_PCT=$((TOTAL_KAG * 100 / TOTAL_INV))
  DEV_PCT=$((TOTAL_DEV * 100 / TOTAL_INV))

  # 各モデルの環境別コスト計算
  S_MAIN=$(printf "%.2f" $(echo "$CLAUDE_SONNET_COST * $MAIN_RATIO" | bc -l))
  S_KAG=$(printf "%.2f" $(echo "$CLAUDE_SONNET_COST * $KAG_RATIO" | bc -l))
  S_DEV=$(printf "%.2f" $(echo "$CLAUDE_SONNET_COST * $DEV_RATIO" | bc -l))
  S_TOTAL=$(printf "%.2f" $CLAUDE_SONNET_COST)

  O_MAIN=$(printf "%.2f" $(echo "$CLAUDE_OPUS_COST * $MAIN_RATIO" | bc -l))
  O_KAG=$(printf "%.2f" $(echo "$CLAUDE_OPUS_COST * $KAG_RATIO" | bc -l))
  O_DEV=$(printf "%.2f" $(echo "$CLAUDE_OPUS_COST * $DEV_RATIO" | bc -l))
  O_TOTAL=$(printf "%.2f" $CLAUDE_OPUS_COST)

  K_MAIN=$(printf "%.2f" $(echo "$KIMI_COST * $MAIN_RATIO" | bc -l))
  K_KAG=$(printf "%.2f" $(echo "$KIMI_COST * $KAG_RATIO" | bc -l))
  K_DEV=$(printf "%.2f" $(echo "$KIMI_COST * $DEV_RATIO" | bc -l))
  K_TOTAL=$(printf "%.2f" $KIMI_COST)

  OT_MAIN=$(printf "%.2f" $(echo "$OTHER_BEDROCK_COST * $MAIN_RATIO" | bc -l))
  OT_KAG=$(printf "%.2f" $(echo "$OTHER_BEDROCK_COST * $KAG_RATIO" | bc -l))
  OT_DEV=$(printf "%.2f" $(echo "$OTHER_BEDROCK_COST * $DEV_RATIO" | bc -l))
  OT_TOTAL=$(printf "%.2f" $OTHER_BEDROCK_COST)

  # 環境別合計
  ENV_MAIN=$(printf "%.2f" $(echo "$TOTAL_COST * $MAIN_RATIO" | bc -l))
  ENV_KAG=$(printf "%.2f" $(echo "$TOTAL_COST * $KAG_RATIO" | bc -l))
  ENV_DEV=$(printf "%.2f" $(echo "$TOTAL_COST * $DEV_RATIO" | bc -l))
  ENV_TOTAL=$(printf "%.2f" $(echo "$TOTAL_COST" | bc -l))

  # 月間推定
  M_MAIN=$(printf "%.0f" $(echo "$ENV_MAIN * 4" | bc -l))
  M_KAG=$(printf "%.0f" $(echo "$ENV_KAG * 4" | bc -l))
  M_DEV=$(printf "%.0f" $(echo "$ENV_DEV * 4" | bc -l))
  M_TOTAL=$(printf "%.0f" $(echo "$ENV_TOTAL * 4" | bc -l))

  echo "  セッション比率: main=$MAIN_PCT% kag=$KAG_PCT% dev=$DEV_PCT%"
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
else
  printf "  %-16s | %8s\n" "モデル" "合計"
  printf "  %-16s-|----------\n" "----------------"
  printf "  %-16s | %8s\n" "Sonnet 4.5" "\$$(printf '%.2f' $CLAUDE_SONNET_COST)"
  printf "  %-16s | %8s\n" "Opus 4.6" "\$$(printf '%.2f' $CLAUDE_OPUS_COST)"
  printf "  %-16s | %8s\n" "Kimi K2" "\$$(printf '%.2f' $KIMI_COST)"
  printf "  %-16s | %8s\n" "その他" "\$$(printf '%.2f' $OTHER_BEDROCK_COST)"
  printf "  %-16s-|----------\n" "----------------"
  printf "  %-16s | %8s\n" "週間合計" "\$$(printf '%.2f' $TOTAL_COST)"
  echo ""
  echo "  ※ セッション数が0のため環境別按分なし"
fi
echo ""

# ========================================
# Claudeモデル キャッシュ効果
# ========================================

# --- Sonnet 4.5 ---
echo "📊 Claude Sonnet 4.5 キャッシュ効果"

S_INPUT_COST=$(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("InputToken") and (test("Cache") | not)) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/sonnet_usage.json")
S_OUTPUT_COST=$(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("OutputToken")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/sonnet_usage.json")
S_CACHE_READ_COST=$(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("CacheReadInputToken")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/sonnet_usage.json")
S_CACHE_WRITE_COST=$(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("CacheWriteInputToken")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/sonnet_usage.json")

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
O_INPUT_COST2=$(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("InputToken") and (test("Cache") | not)) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/opus_usage.json")
O_OUTPUT_COST2=$(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("OutputToken")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/opus_usage.json")
O_CACHE_READ_COST2=$(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("CacheReadInputToken")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/opus_usage.json")
O_CACHE_WRITE_COST2=$(jq -r '[.ResultsByTime[].Groups[] | select(.Keys[0] | test("CacheWriteInputToken")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0' "$OUTPUT_DIR/opus_usage.json")
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

echo "✅ 完了！"
```

## 出力フォーマット

スクリプト実行後、以下の情報が出力される：

1. **直近12時間のセッション数**: 時間帯別の表形式（main/kag/dev）
2. **Cognitoユーザー数**: 環境ごとのユーザー数（main/kag）
3. **日次セッション数**: 過去7日間の日別回数（main/kag/dev別）
4. **時間別セッション数**: 直近24時間の全時間帯（ASCIIバーグラフ・JST表示、main/kag/dev）
5. **Bedrockコスト（日別）**: 過去7日間の日別コスト
6. **Bedrockコスト内訳（環境別 x モデル別）**: セッション比率で按分した環境別・モデル別コスト表（週間・月間推定付き）
7. **Claudeモデル キャッシュ効果**: Sonnet 4.5 / Opus 4.6 各モデルのInput/Output/CacheRead/CacheWriteの内訳、キャッシュヒット率、節約額
8. **週次トレンド**: リリース以降の週ごとのセッション数とコストの推移（過去4週間）

## 技術詳細

### OTELログ形式への対応

AgentCoreのログは `otel-rt-logs` ストリームにOTEL形式で出力される。各セッションは `session.id` フィールドで識別されるため、`count_distinct(sid)` でユニークセッション数をカウントする。

### タイムゾーン変換

CloudWatch Logs Insightsで `datefloor(@timestamp + 9h, ...)` を使うと挙動が不安定なため、UTCのまま集計してからスクリプト側でJSTに変換している。

## 注意事項

- AWS認証が切れている場合は `aws sso login --profile sandbox` を先に実行すること
- CloudWatch Logsクエリは非同期のため10秒待機している（必要に応じて調整）

## 回答時の表示ルール

スクリプト実行後、ユーザーへの回答では以下を守ること：

1. **直近12時間のセッション数**: サマリーせず、スクリプト出力の表形式をそのままMarkdownテーブルとして表示する
2. その他のデータは適宜サマリーしてOK
