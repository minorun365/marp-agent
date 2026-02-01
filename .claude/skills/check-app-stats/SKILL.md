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
OUTPUT_DIR="/tmp/marp-stats"
mkdir -p "$OUTPUT_DIR"

echo "📊 Marp Agent 利用状況を取得中..."

# ========================================
# 1. リソースID取得
# ========================================
echo "🔍 リソースIDを取得中..."

# Cognito User Pool ID取得（marp-main, marp-kagで検索）
POOL_MAIN=$(aws cognito-idp list-user-pools --max-results 60 --region $REGION \
  --query "UserPools[?contains(Name, 'marp-main')].Id" --output text)
POOL_KAG=$(aws cognito-idp list-user-pools --max-results 60 --region $REGION \
  --query "UserPools[?contains(Name, 'marp-kag')].Id" --output text)

# AgentCore ロググループ名取得（main/kag/dev）
LOG_MAIN=$(aws logs describe-log-groups \
  --log-group-name-prefix /aws/bedrock-agentcore/runtimes/marp_agent_main \
  --region $REGION --query "logGroups[0].logGroupName" --output text)
LOG_KAG=$(aws logs describe-log-groups \
  --log-group-name-prefix /aws/bedrock-agentcore/runtimes/marp_agent_kag \
  --region $REGION --query "logGroups[0].logGroupName" --output text)
LOG_DEV=$(aws logs describe-log-groups \
  --log-group-name-prefix /aws/bedrock-agentcore/runtimes/marp_agent_dev \
  --region $REGION --query "logGroups[0].logGroupName" --output text 2>/dev/null || echo "None")

# ========================================
# 2. Cognitoユーザー数取得（前回値との比較用キャッシュ付き）
# ========================================
echo "👥 Cognitoユーザー数を取得中..."
USERS_MAIN=$(aws cognito-idp describe-user-pool --user-pool-id "$POOL_MAIN" --region $REGION \
  --query "UserPool.EstimatedNumberOfUsers" --output text 2>/dev/null || echo "0")
USERS_KAG=$(aws cognito-idp describe-user-pool --user-pool-id "$POOL_KAG" --region $REGION \
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
END_NOW=$(date +%s)

# OTELログからsession.idをparseしてユニークカウント（UTCで集計）
OTEL_QUERY='parse @message /"session\.id":\s*"(?<sid>[^"]+)"/ | filter ispresent(sid)'

# 日次クエリ開始（main/kag並列）
Q_DAILY_MAIN=$(aws logs start-query \
  --log-group-name "$LOG_MAIN" \
  --start-time $START_7D --end-time $END_NOW \
  --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1d) as day_utc | sort day_utc asc" \
  --region $REGION --query 'queryId' --output text)

Q_DAILY_KAG=$(aws logs start-query \
  --log-group-name "$LOG_KAG" \
  --start-time $START_7D --end-time $END_NOW \
  --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1d) as day_utc | sort day_utc asc" \
  --region $REGION --query 'queryId' --output text)

Q_DAILY_DEV=""
if [ "$LOG_DEV" != "None" ]; then
  Q_DAILY_DEV=$(aws logs start-query \
    --log-group-name "$LOG_DEV" \
    --start-time $START_7D --end-time $END_NOW \
    --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1d) as day_utc | sort day_utc asc" \
    --region $REGION --query 'queryId' --output text)
fi

# 時間別クエリ開始（main/kag/dev並列）
Q_HOURLY_MAIN=$(aws logs start-query \
  --log-group-name "$LOG_MAIN" \
  --start-time $START_24H --end-time $END_NOW \
  --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1h) as hour_utc | sort hour_utc asc" \
  --region $REGION --query 'queryId' --output text)

Q_HOURLY_KAG=$(aws logs start-query \
  --log-group-name "$LOG_KAG" \
  --start-time $START_24H --end-time $END_NOW \
  --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1h) as hour_utc | sort hour_utc asc" \
  --region $REGION --query 'queryId' --output text)

Q_HOURLY_DEV=""
if [ "$LOG_DEV" != "None" ]; then
  Q_HOURLY_DEV=$(aws logs start-query \
    --log-group-name "$LOG_DEV" \
    --start-time $START_24H --end-time $END_NOW \
    --query-string "$OTEL_QUERY | stats count_distinct(sid) as sessions by datefloor(@timestamp, 1h) as hour_utc | sort hour_utc asc" \
    --region $REGION --query 'queryId' --output text)
fi

# ========================================
# 4. Bedrockコスト取得（クエリ待機中に並列実行）
# ========================================
echo "💰 Bedrockコストを取得中..."
aws ce get-cost-and-usage \
  --time-period Start=$(date -v-7d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics "UnblendedCost" \
  --group-by Type=DIMENSION,Key=SERVICE \
  --region $REGION \
  --output json > "$OUTPUT_DIR/cost.json"

# ========================================
# 5. クエリ結果取得（10秒待機後）
# ========================================
echo "⏳ クエリ完了を待機中..."
sleep 10

echo "📥 クエリ結果を取得中..."
aws logs get-query-results --query-id "$Q_DAILY_MAIN" --region $REGION > "$OUTPUT_DIR/daily_main.json"
aws logs get-query-results --query-id "$Q_DAILY_KAG" --region $REGION > "$OUTPUT_DIR/daily_kag.json"
aws logs get-query-results --query-id "$Q_HOURLY_MAIN" --region $REGION > "$OUTPUT_DIR/hourly_main.json"
aws logs get-query-results --query-id "$Q_HOURLY_KAG" --region $REGION > "$OUTPUT_DIR/hourly_kag.json"
if [ -n "$Q_DAILY_DEV" ]; then
  aws logs get-query-results --query-id "$Q_DAILY_DEV" --region $REGION > "$OUTPUT_DIR/daily_dev.json"
  aws logs get-query-results --query-id "$Q_HOURLY_DEV" --region $REGION > "$OUTPUT_DIR/hourly_dev.json"
else
  echo '{"results":[]}' > "$OUTPUT_DIR/daily_dev.json"
  echo '{"results":[]}' > "$OUTPUT_DIR/hourly_dev.json"
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

echo "💵 Bedrockコスト（環境別内訳・推定）"
TOTAL_INV=$((TOTAL_MAIN + TOTAL_KAG + TOTAL_DEV))
if [ "$TOTAL_INV" -gt 0 ]; then
  MAIN_PCT=$((TOTAL_MAIN * 100 / TOTAL_INV))
  KAG_PCT=$((TOTAL_KAG * 100 / TOTAL_INV))
  DEV_PCT=$((TOTAL_DEV * 100 / TOTAL_INV))
  MAIN_COST=$(printf "%.2f" $(echo "$TOTAL_COST * $TOTAL_MAIN / $TOTAL_INV" | bc -l))
  KAG_COST=$(printf "%.2f" $(echo "$TOTAL_COST * $TOTAL_KAG / $TOTAL_INV" | bc -l))
  DEV_COST=$(printf "%.2f" $(echo "$TOTAL_COST * $TOTAL_DEV / $TOTAL_INV" | bc -l))
  MAIN_MONTHLY=$(printf "%.0f" $(echo "$MAIN_COST * 4" | bc -l))
  KAG_MONTHLY=$(printf "%.0f" $(echo "$KAG_COST * 4" | bc -l))
  DEV_MONTHLY=$(printf "%.0f" $(echo "$DEV_COST * 4" | bc -l))
  TOTAL_WEEKLY=$(printf "%.2f" $(echo "$TOTAL_COST" | bc -l))
  TOTAL_MONTHLY=$(printf "%.0f" $(echo "$TOTAL_COST * 4" | bc -l))
  echo "  main: 週間 \$$MAIN_COST → 月間推定 \$$MAIN_MONTHLY ($MAIN_PCT%)"
  echo "  kag:  週間 \$$KAG_COST → 月間推定 \$$KAG_MONTHLY ($KAG_PCT%)"
  echo "  dev:  週間 \$$DEV_COST → 月間推定 \$$DEV_MONTHLY ($DEV_PCT%)"
  echo "  合計: 週間 \$$TOTAL_WEEKLY → 月間推定 \$$TOTAL_MONTHLY"
else
  echo "  セッション数が0のため計算できません"
fi
echo ""
echo "✅ 完了！"
```

## 出力フォーマット

スクリプト実行後、以下の情報が出力される：

1. **Cognitoユーザー数**: 環境ごとのユーザー数（main/kag）
2. **日次セッション数**: 過去7日間の日別回数（main/kag/dev別）
3. **時間別セッション数**: 直近24時間の全時間帯（ASCIIバーグラフ・JST表示、main/kag/dev）
4. **Bedrockコスト（日別）**: 過去7日間の日別コスト
5. **Bedrockコスト（環境別内訳）**: セッション数で按分した推定コスト（週間・月間、main/kag/dev）

## 技術詳細

### OTELログ形式への対応

AgentCoreのログは `otel-rt-logs` ストリームにOTEL形式で出力される。各セッションは `session.id` フィールドで識別されるため、`count_distinct(sid)` でユニークセッション数をカウントする。

### タイムゾーン変換

CloudWatch Logs Insightsで `datefloor(@timestamp + 9h, ...)` を使うと挙動が不安定なため、UTCのまま集計してからスクリプト側でJSTに変換している。

## 注意事項

- AWS認証が切れている場合は `aws login` を先に実行すること
- CloudWatch Logsクエリは非同期のため10秒待機している（必要に応じて調整）

## 回答時の表示ルール

スクリプト実行後、ユーザーへの回答では以下を守ること：

1. **直近12時間のセッション数**: サマリーせず、スクリプト出力の表形式をそのままMarkdownテーブルとして表示する
2. その他のデータは適宜サマリーしてOK
