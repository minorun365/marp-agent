# Bedrock LLM推論コスト削減計画

## 背景

- AWS利用料の99%がBedrock LLM推論コスト（主にClaude Sonnet）
- 代替モデル（Haiku, Kimi K2.5等）は品質低下やツールユース不安定で単純置換が困難
  - Haikuはスライド出力品質が低下、Kimi K2.5はツールユースが不安定でアプリが途中停止する
  - DeepSeek V3.2はツールユース安定・Haikuと同等の賢さだが、スライド品質はSonnetに劣る
- アプローチを変えて、アーキテクチャレベルでトークン消費を最適化する

## 現状分析（CloudWatch Logs実測データ）

### コスト概要

| 指標 | 数値 |
|------|------|
| 1日のコスト | 約$30/日（月約$900） |
| Claude Sonnet 4.5 | $26.45/日（88.7%） |
| Claude Opus 4.6 | $3.37/日（11.3%） |
| 入力トークン比率 | **95.7%** ← 削減ターゲット |
| 出力トークン比率 | 4.3% |
| キャッシュヒット率 | 約9%（ピーク時26%） |
| 推定セッション数 | 約1,300/日 |

### 1セッションあたりのトークン内訳

| 要素 | トークン数 | 備考 |
|------|-----------|------|
| System prompt + ツール定義 | ~1,500 | キャッシュ対象 |
| Web検索結果 | ~2,000 | **最大の削減ポイント** |
| 会話履歴 | ~700 | ターンが増えると累積 |
| ユーザーメッセージ | ~300 | |
| **入力合計** | **~4,500** | |
| 出力（スライドMD） | ~1,200 | |

### ピーク時の消費

- ピーク時（日本時間17:57）: 2,539,025 tokens → $8.50/時間
- 平均時間帯: 362,179 tokens → $1.33/時間
- 全日のトークンの**35%を1時間**で消費

### 現在のキャッシュ設定

- `cache_prompt="default"`, `cache_tools="default"` で System prompt + ツール定義をキャッシュ
- セッション再利用率が高い時間帯ではキャッシュ率26%を達成
- ただし全体平均は9%にとどまり、履歴が膨らむと「キャッシュされない新規部分」も増大

---

## モデル料金比較（2026年2月時点）

### 入出力トークン単価（/1M tokens）

| モデル | 入力 | 出力 | キャッシュRead | キャッシュWrite(5m) | Sonnet比（入力） |
|--------|------|------|---------------|-------------------|-----------------|
| **Claude Sonnet 4.5** | $3.00 | $15.00 | $0.30 | $3.75 | 1.0x |
| **Claude Opus 4.6** | $5.00 | $25.00 | $0.50 | $6.25 | 1.7x |
| **Claude Haiku 4.5** | $1.00 | $5.00 | $0.10 | $1.25 | **0.33x** |
| **Amazon Nova Pro** | $0.80 | $3.20 | - | - | **0.27x** |
| **DeepSeek V3.2** (Bedrock) | ~$0.28 | ~$0.42 | - | - | **0.09x** |

> 出典: [Claude Pricing](https://platform.claude.com/docs/en/about-claude/pricing), [Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/), [Nova Pricing](https://aws.amazon.com/nova/pricing/)

### 重要な料金メカニズム

| 機能 | 割引率 | 備考 |
|------|--------|------|
| **プロンプトキャッシュ（Read）** | **-90%** | 入力$3.00 → $0.30 |
| **バッチ推論** | **-50%** | 非リアルタイム処理向け |
| **グローバルエンドポイント** | 基準価格 | リージョナルは+10%プレミアム |

---

## 施策一覧

### 【既存施策】施策1: Web検索サブエージェント（マルチエージェント化）⭐ 最優先

- **効果**: 大（入力トークン約33%削減）
- **工数**: 大
- **対象**: `amplify/agent/runtime/` 配下に新規ファイル追加

#### 構成

```
[メインAgent: Sonnet]
    |
    +-- search_and_summarize ツール呼び出し
    |       |
    |       [サブAgent: DeepSeek V3.2 or Haiku]
    |           +-- web_search x N回（advanced / 5件のまま品質維持）
    |           +-- 検索結果を要約（重要ポイントだけ抽出）
    |           +-- 要約テキストを返す（~500トークン）
    |
    +-- メイン履歴には要約のみが入る（2,000 → 500トークンに圧縮）
    +-- output_slide でスライド生成
```

#### モデル選択の再検討

| サブエージェント候補 | 入力単価 | ツールユース | コスト効率 |
|---------------------|---------|------------|-----------|
| **DeepSeek V3.2** | ~$0.28/M | 安定 | Sonnet比 **1/11** |
| **Nova Pro** | $0.80/M | 対応 | Sonnet比 **1/3.75** |
| **Claude Haiku** | $1.00/M | 安定 | Sonnet比 **1/3** |

#### 期待効果

- 1セッションあたり**1,500トークン削減**（Web検索結果 2,000 → 要約 500）
- 会話が複数ターン続くと、この差がターンごとに累積
- Tavilyの検索パラメータ（advanced/5件）はそのまま → **スライド品質を維持**

---

### 【既存施策】施策2: 会話履歴のトリミング ✅ 実装済み

- **効果**: 大
- **工数**: **小**（Strands Agents組み込み機能を活用）
- **対象**: `amplify/agent/runtime/session/manager.py`

#### 変更内容

- Strands Agentsの `SlidingWindowConversationManager` を導入（`window_size=10`）
- Agent生成時に `conversation_manager` 引数を追加するだけで実現
- フロントエンドが修正リクエスト時に最新Markdown全文を毎回送信するため、古い履歴が消えても会話は成立する

```python
from strands.agent.conversation_manager import SlidingWindowConversationManager

agent = Agent(
    model=model,
    system_prompt=SYSTEM_PROMPT,
    tools=tools,
    conversation_manager=SlidingWindowConversationManager(window_size=10),
)
```

---

### 【既存施策】施策3: Markdown二重送信の解消 ✅ 実装済み

- **効果**: 中
- **工数**: 小
- **対象**: `amplify/agent/runtime/agent.py`

#### 変更内容

- 既存セッション（`agent.messages` に前回のスライド内容が残っている）ではMarkdown付加をスキップ
- 新規セッションまたは履歴がない場合のみ、フロントからのMarkdownをメッセージに結合
- フロントエンド側は変更なし（`markdown` フィールドは引き続き送信し、PDF/PPTX/共有機能で使用）

---

### 【新規施策】施策4: キャッシュヒット率の向上 ⭐ 即効性あり

- **効果**: 大（キャッシュ率9%→50%で入力コスト約40%削減）
- **工数**: 中
- **対象**: `amplify/agent/runtime/session/manager.py`, `amplify/agent/runtime/config.py`

#### 現状の問題

- キャッシュヒット率が平均9%と極めて低い
- キャッシュRead単価は通常入力の**10分の1**（$3.00 → $0.30/MTok）
- キャッシュがもっと効けば、入力トークンコストの大幅削減が可能

#### 改善策

1. **1時間キャッシュの活用**: デフォルトの5分キャッシュ→1時間キャッシュに変更。ピーク時（1時間で全体の35%消費）に効果大
   - Write: $3.75 → $6.00/MTok（高くなる）
   - Read: $0.30/MTok（変わらず）
   - セッション数が多い時間帯では、Write1回→Read多数回でペイする
2. **System Promptの固定化**: 動的要素をSystem Promptの末尾にまとめ、冒頭部分のキャッシュを安定化
3. **会話履歴のプレフィックス安定化**: 施策2と組み合わせて、履歴を短く保つことでキャッシュプレフィックスの一致率を上げる

#### 期待効果

- キャッシュ率を9% → 40-50%に向上できれば
- 入力トークンのうちキャッシュReadで処理される分: コスト**90%削減**
- 全体で**約20-30%のコスト削減**

> 参考: [Effectively use prompt caching on Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/effectively-use-prompt-caching-on-amazon-bedrock/)

---

### 【新規施策】施策5: System Prompt & ツール定義の圧縮 ✅ 実装済み

- **効果**: 中（入力トークン10-15%削減）
- **工数**: 小
- **対象**: `amplify/agent/runtime/config.py`, ツール定義各ファイル

#### 現状分析

現在の`SYSTEM_PROMPT`（`config.py:22-112`）は約1,500トークン。内訳:
- Marp記法のサンプルコード（コードブロック）が大部分を占める
- 類似の指示が重複している箇所あり
- ツール使用時の隠しシステムプロンプト: +346トークン（Claude自動付加）

#### 改善策

1. **コードサンプルの簡略化**: Marpフォーマットの例を最小限に
2. **重複指示の統合**: 検索エラー時の対応など、冗長な記述を圧縮
3. **不要ツールの条件付きロード**: `generate_tweet_url`は利用頻度が低い → 必要時のみロードすればツール定義のトークンを節約
4. **ツール説明文の最適化**: 各ツールの`docstring`を簡潔に

#### 期待効果

- System prompt: 1,500 → 1,000トークン（-500）
- 毎リクエストで500トークン × 1,300セッション/日 = 65万トークン/日削減
- コスト: 約$2/日削減

---

### 【新規施策】施策6: ユーザーごとの利用制限

- **効果**: 大（ピーク時コストの直接制御）
- **工数**: 中
- **対象**: `amplify/agent/runtime/agent.py`

#### 概要

- 1ユーザーあたりの日次リクエスト上限を設定（例: 20回/日）
- ピーク時の爆発的利用を防止
- 全体の35%が1時間に集中している現状を緩和

#### 実装方法

- AgentCore Memoryまたはシンプルなインメモリカウンターで利用回数を追跡
- 上限到達時に「本日の利用上限に達しました」とメッセージ表示

#### 期待効果

- ピーク時のコスト上限を設定可能
- ヘビーユーザーによるコスト集中を防止

---

## 施策の優先順位（更新版）

| 順番 | 施策 | 工数 | 期待効果 | 即効性 | 備考 |
|------|------|------|----------|--------|------|
| 1 | **施策2: 会話履歴トリミング** | 小 | 大 | 即 | ConversationManager導入のみ。施策4の前提 |
| 2 | **施策5: System Prompt圧縮** | 小 | 中 | 即 | 施策4の前提（キャッシュ安定化） |
| 3 | **施策3: Markdown二重送信の解消** | 小 | 中 | 即 | ⚠️ バックエンド側の二重付加のみ削除（※） |
| 4 | **施策4: キャッシュヒット率向上** | 中 | 大（-20~30%） | 中 | 施策2,5の後だと効果最大 |
| 5 | **施策6: ユーザー利用制限** | 中 | 大 | 即 | 独立して実施可能 |
| 6 | **施策1: Web検索サブエージェント** | 大 | 大（-33%） | 中 | 最も工数が大きいので最後 |

> **方針**: 工数「小」の施策（2, 5, 3）を先に片付けて即効性のあるコスト削減を実現。
> 施策2→5→4の順は相乗効果あり（履歴が短い＋System Prompt安定 → キャッシュヒット率が最大化）。
> 工数が大きい施策1は小さな施策で成果を出してから着手。
>
> ※施策3の注意: 施策2は「フロントから毎回Markdownが送られる」ことを前提としている。
> 施策3でフロント側のMarkdown送信をスキップするとこの前提が崩れるため、
> バックエンド側（`agent.py:74-75`）の二重付加のみ削除し、フロントからの送信は維持する。

## 全施策のコスト削減効果（試算）

| 施策 | 個別効果 | 累積後の日額 |
|------|---------|-------------|
| 現状 | - | $30/日 |
| 施策2: 会話履歴トリミング | -$2/日 | $28/日 |
| 施策5: System Prompt圧縮 | -$2/日 | $26/日 |
| 施策3: Markdown二重送信解消 | -$2/日 | $24/日 |
| 施策4: キャッシュヒット率向上 | -$5/日 | $19/日 |
| 施策1: Web検索サブエージェント | -$4/日 | $15/日 |
| **全施策実施後** | **-50%** | **$15/日（月$450）** |

> 注: 各施策の効果は独立ではなく、組み合わせで重複する部分がある。上記は保守的な見積もり。
> 施策6（利用制限）は上記に含まず、追加で削減可能。

---

## 効果測定

### メトリクスログ

`agent.py` でリクエストごとにトークン使用量をJSON形式でログ出力（`version` タグ付き）。

```json
{"type": "METRICS", "version": "cost_opt_v1", "session_id": "xxx", "model_type": "sonnet", "input_tokens": 4500, "output_tokens": 1200, "cache_read_tokens": 500, "cache_write_tokens": 1500}
```

### CloudWatch Log Insights クエリ

```
# 施策前後の比較（バージョン別の平均トークン数）
filter type = "METRICS"
| stats avg(input_tokens) as 平均入力, avg(output_tokens) as 平均出力,
        avg(cache_read_tokens) as 平均キャッシュRead, count(*) as セッション数
  by version, bin(1h)
```

```
# キャッシュヒット率の確認
filter type = "METRICS"
| stats sum(cache_read_tokens) / sum(input_tokens) * 100 as キャッシュ率,
        count(*) as リクエスト数
  by version, bin(1h)
```

### バージョン履歴

| version | 内容 | デプロイ日 |
|---------|------|-----------|
| (なし) | 施策前（ログ出力なし） | - |
| `cost_opt_v1` | 施策2,3,5 実施 | TBD |

---

## スコープ外

### Web検索パラメータの変更（施策1で不要に）

- `max_results` や `search_depth` の変更はスライド品質低下リスクがある
- 施策1（サブエージェント）により、検索はフルパワーのまま要約で圧縮できるため不要

### バッチ推論（50%割引）

- バッチAPIは非同期処理向け（50%割引）だが、本アプリはリアルタイムストリーミングが必須のため適用不可

### AgentCore Runtime自体のコスト最適化

- AgentCore Runtimeは消費ベース課金（CPU/メモリの秒単位）
- I/O待機中（LLMレスポンス待ち）はCPU課金なし
- 現状のアーキテクチャではLLMコストが99%を占めるため、Runtime側の最適化は優先度低

## 参考情報

- [Amazon Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/)
- [Claude Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Amazon Nova Pricing](https://aws.amazon.com/nova/pricing/)
- [Bedrock Cost Optimization](https://aws.amazon.com/bedrock/cost-optimization/)
- [Effectively use prompt caching on Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/effectively-use-prompt-caching-on-amazon-bedrock/)
- [Effective cost optimization strategies for Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/effective-cost-optimization-strategies-for-amazon-bedrock/)
- [AgentCore Pricing](https://aws.amazon.com/bedrock/agentcore/pricing/)
- [AgentDiet: Token Reduction Framework](https://arxiv.org/html/2601.14470) - 入力トークン40-60%削減の研究
- [Agentic Plan Caching](https://arxiv.org/abs/2506.14852) - 類似タスクのプラン再利用
