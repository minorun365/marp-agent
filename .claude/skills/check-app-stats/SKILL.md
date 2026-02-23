---
name: check-app-stats
model: sonnet
description: このアプリの利用統計を確認（Cognitoユーザー数、AgentCore呼び出し回数、Bedrockコスト、Tavily API残量）
allowed-tools: Bash(bash .claude/skills/check-app-stats/run.sh)
---

# 環境利用状況チェック

各Amplify環境（main/kag）のCognitoユーザー数とBedrock AgentCoreランタイムのセッション数を調査する。Bedrockコストについてはdev環境も含めて集計する。

mainとkagは別AWSアカウントで運用されているため、それぞれのプロファイルで個別にデータ取得する。

## 実行方法

以下のコマンドを実行する。スクリプト内ですべてのデータ取得を並列化している。

```bash
bash .claude/skills/check-app-stats/run.sh
```

## 出力フォーマット

スクリプト実行後、以下の情報が出力される：

1. **直近12時間のセッション数**: 時間帯別の表形式（main/kag/dev）
2. **Cognitoユーザー数**: 環境ごとのユーザー数（main/kag）。kagは旧環境（sandbox内）と新環境（kag-sandbox）の両方を取得し、メールで重複除外したユニーク数を表示 + kagユーザー一覧（新旧マージ、所属環境タグ付き）
3. **日次セッション数**: 過去7日間の日別回数（main/kag/dev別）
4. **時間別セッション数**: 直近24時間の全時間帯（ASCIIバーグラフ・JST表示、main/kag/dev）
5. **Bedrockコスト（日別）**: 過去7日間の日別コスト（main+dev/kag別）
6. **Bedrockコスト内訳（環境別 x モデル別）**: アカウント別実コストによる環境別・モデル別コスト表（週間・月間推定付き）
7. **1セッションあたりのコスト**: 日別のセッション単価（main+dev/kag/全体）と平均値。コスト削減施策の効果確認用
8. **Claudeモデル キャッシュ効果**: Sonnet 4.5 / Opus 4.6 各モデルのInput/Output/CacheRead/CacheWriteの内訳、キャッシュヒット率、節約額（両アカウント合算）
9. **週次トレンド**: リリース以降の週ごとのセッション数とコストの推移（過去4週間、両アカウント合算）
10. **Tavily API 利用状況**: キー別の使用量/上限/残り、日平均消費クレジット、枯渇予測日
11. **Tavily 日次消費推移**: 過去の記録からの消費推移テーブル、日平均消費、月間推定、必要キー数の分析（記録が2日以上ある場合のみ表示）
12. **直近のユーザー依頼内容**: 過去7日間のユーザーの依頼内容（main/kag別、日時JST表示、最大20件、50文字で切り詰め）

## アーキテクチャ

```
sandbox アカウント (715841358122)
├── Cognito: marp-main プール
├── Cognito: marp-kag プール（旧KAG環境）
├── AgentCore: marp_agent_main, marp_agent_dev
└── Bedrock: main + dev のコスト

kag-sandbox アカウント (105778051969)
├── Cognito: amplifyAuthUserPool（新KAG環境、CloudFormation出力で特定）
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

### セッション重複カウント防止

セッションは複数のログエントリに跨って記録されるため、単純に `count_distinct(sid) by datefloor(@timestamp, 1h)` で集計すると、複数時間に跨るセッションが各時間で重複カウントされる。二段階 `stats` パイプラインで初回出現時刻を基準に集計することで防止：

```
stats min(@timestamp) as first_seen by sid | stats count(*) as sessions by datefloor(first_seen, 1h) as hour_utc
```

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
4. **Tavily 日次消費推移**: サマリーせず、推移テーブルと必要キー数の分析をそのまま表示する
5. **直近のユーザー依頼内容**: サマリーせず、テーブルをそのままMarkdownテーブルとして表示する
6. その他のデータは適宜サマリーしてOK
