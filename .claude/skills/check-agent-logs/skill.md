---
name: check-agent-logs
description: AgentCoreランタイムのCloudWatchログを検索・分析する
user-invocable: true
---

# AgentCore ログ検索

AgentCoreランタイムのCloudWatchログを効率的に検索するためのガイド。

## 基本情報

| 項目 | 値 |
|------|-----|
| リージョン | us-east-1 |
| ロググループ | `/aws/bedrock-agentcore/runtime/marp_agent_*` |
| 主なストリーム | `runtime-logs`, `otel-rt-logs` |

## 手順

### 1. AWS認証

```bash
aws login
```

ブラウザで認証操作を行う。

### 2. ロググループ名の確認

sandbox identifierによってロググループ名が変わる。最新のロググループを確認：

```bash
aws logs describe-log-groups \
  --log-group-name-prefix "/aws/bedrock-agentcore/runtime/marp_agent_dev" \
  --region us-east-1 \
  --query 'logGroups[*].logGroupName' \
  --output text
```

### 3. 直近のログを取得

```bash
# 直近30分のログ（簡易版）
aws logs tail "/aws/bedrock-agentcore/runtime/marp_agent_dev-XXXXX-DEFAULT/runtime-logs" \
  --since 30m \
  --region us-east-1

# フォロー（リアルタイム監視）
aws logs tail "/aws/bedrock-agentcore/runtime/marp_agent_dev-XXXXX-DEFAULT/runtime-logs" \
  --follow \
  --region us-east-1
```

### 4. 特定のメッセージを検索

```bash
# 特定のキーワードで検索（例：エラー）
aws logs filter-log-events \
  --log-group-name "/aws/bedrock-agentcore/runtime/marp_agent_dev-XXXXX-DEFAULT/runtime-logs" \
  --filter-pattern "ERROR" \
  --start-time $(date -v-1H +%s000) \
  --region us-east-1

# 特定のユーザーメッセージを検索
aws logs filter-log-events \
  --log-group-name "/aws/bedrock-agentcore/runtime/marp_agent_dev-XXXXX-DEFAULT/otel-rt-logs" \
  --filter-pattern '"黄金の太陽"' \
  --start-time $(date -v-1H +%s000) \
  --region us-east-1
```

## 時間指定

### JST → UTC 変換

| JST | UTC | 備考 |
|-----|-----|------|
| 09:00 | 00:00 | 日本の朝 = UTCの前日深夜 |
| 12:00 | 03:00 | |
| 18:00 | 09:00 | |
| 21:00 | 12:00 | |
| 00:00 | 15:00（前日） | |

**計算式**: `UTC = JST - 9時間`

### 時間指定オプション

```bash
# 相対時間（簡単）
--since 30m          # 30分前から
--since 1h           # 1時間前から
--since 2h           # 2時間前から

# 絶対時間（ミリ秒エポック）
--start-time 1738310400000   # 2025-01-31 12:00:00 UTC
--end-time 1738314000000     # 2025-01-31 13:00:00 UTC

# Macでエポック時間を生成
date -v-1H +%s000            # 1時間前のエポック（ミリ秒）
date -j -f "%Y-%m-%d %H:%M:%S" "2025-01-31 12:00:00" +%s000  # 特定時刻
```

## よく使う検索パターン

### エラー検索

```bash
aws logs filter-log-events \
  --log-group-name "LOG_GROUP_NAME" \
  --filter-pattern "?ERROR ?Exception ?Traceback" \
  --start-time $(date -v-1H +%s000) \
  --region us-east-1 \
  --query 'events[*].message' \
  --output text
```

### Kimi K2関連の問題

```bash
# ツール名破損の検出
aws logs filter-log-events \
  --log-group-name "LOG_GROUP_NAME" \
  --filter-pattern '"Corrupted tool name"' \
  --start-time $(date -v-1H +%s000) \
  --region us-east-1

# reasoningText内ツール呼び出し
aws logs filter-log-events \
  --log-group-name "LOG_GROUP_NAME" \
  --filter-pattern '"Tool call found in reasoning"' \
  --start-time $(date -v-1H +%s000) \
  --region us-east-1
```

### 特定セッションのトレース

```bash
# OTELログからセッションIDで検索
aws logs filter-log-events \
  --log-group-name "LOG_GROUP_NAME/otel-rt-logs" \
  --filter-pattern '"session.id" "SESSION_ID"' \
  --start-time $(date -v-1H +%s000) \
  --region us-east-1
```

### finish_reason確認

```bash
# end_turnで終了したリクエスト
aws logs filter-log-events \
  --log-group-name "LOG_GROUP_NAME/otel-rt-logs" \
  --filter-pattern '"finish_reason" "end_turn"' \
  --start-time $(date -v-1H +%s000) \
  --region us-east-1
```

## ログストリームの種類

| ストリーム | 内容 |
|-----------|------|
| `runtime-logs` | アプリケーションログ（print文、INFO/ERROR等） |
| `otel-rt-logs` | OTELトレース（リクエスト/レスポンス詳細、セッションID等） |

## トラブルシューティング

### ログが見つからない

1. **ロググループ名を確認** - sandbox identifierが変わっていないか
2. **時間帯を確認** - JSTとUTCを間違えていないか
3. **ストリームを確認** - `runtime-logs`と`otel-rt-logs`の両方を確認

### 認証エラー

```bash
# 認証状態を確認
aws sts get-caller-identity

# 再認証
aws login
```

## CloudWatch Logs Insights（高度な検索）

AWS Console > CloudWatch > Logs Insights で以下のクエリを使用：

### セッション数カウント

```
parse @message /"session\.id":\s*"(?<sid>[^"]+)"/
| filter ispresent(sid)
| stats count_distinct(sid) as sessions by datefloor(@timestamp, 1h) as hour_utc
| sort hour_utc asc
```

### エラー率

```
fields @timestamp, @message
| filter @message like /ERROR|Exception/
| stats count() as errors by bin(1h)
```
