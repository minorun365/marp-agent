# プロンプトキャッシュ 調査・修正記録（2026-03-01〜02）

## 結論：修正完了・動作確認済み ✅

**2026-02-21のコミット「http_requestツールにHaiku要約ラッパーを導入」**によってBedrockのtools cache機能が機能停止した問題を、**ツールdocstringの再設計**で解決した。

---

## 根本原因

Bedrockのprompt cachingには**ツール定義の合計トークン数が1024以上**という最低ラインがある。

| 状態 | http_requestのtoken数 | ツール合計 | 1024超え？ | キャッシュ |
|------|----------------------|-----------|-----------|----------|
| **変更前**（strands_tools版） | ~884 tokens（21パラメータ） | ~1096 tokens | ✅ YES | **動作** |
| **変更後**（カスタム版） | ~90 tokens（2パラメータ） | ~302 tokens | ❌ NO | **停止** |

- `strands_tools.http_request`：21パラメータ / 3,536文字 / ~884トークン
- カスタム `http_request`：2パラメータ（url, method） / 775文字 / ~90トークン
- 差分：~794トークン削減 → 合計が1024を割り込んでキャッシュ無効化

---

## データで見るキャッシュ停止の証拠

### 日別コスト（sandbox / Sonnet 4.6）

| 日付 | Input($) | CacheRead($) | CacheWrite($) | CacheWriteRate |
|------|---------|-------------|--------------|---------------|
| 2026-02-17 | 0.21 | 0.007 | 0.021 | **8%** |
| 2026-02-18 | 19.04 | 0.227 | 0.371 | **2%** |
| 2026-02-19 | 29.39 | 0.307 | 0.413 | **1%** |
| 2026-02-20 | 17.16 | 0.231 | 0.399 | **2%** |
| **2026-02-21** | 15.03 | **0** | **0** | **0%** ← ここから停止 |
| 2026-02-22〜 | 各$10-17 | **0** | **0** | **0%** |

**2/21 00:05のコミット**と停止タイミングが完全一致。

### Sonnet 4.5 vs 4.6 の28日間累計比較

| モデル | Input($) | CacheRead($) | CacheWrite($) | ヒット率 |
|-------|---------|-------------|--------------|---------|
| **Sonnet 4.5** | $158.06 | $2.28 | $8.64 | **~12.6%** |
| **Sonnet 4.6** | $171.36 | $0.78 | $1.22 | **~4.4%**（2/17-2/20のみ） |

4.5時代は一貫して10%超のキャッシュヒット率があった。

---

## その他の発見

### 1. `cache_prompt` の廃止警告（2,735件）
```
UserWarning: cache_prompt is deprecated. Use SystemContentBlock with cachePoint instead.
```
- `cache_prompt="default"` は deprecated だが、内部でcachePointに変換されているため現時点では動作している
- ただしsystem promptのトークン数が~403 tokens（1024未満）なので、systemキャッシュも効いていない可能性あり

### 2. `output_slide` の "tool result too large" エラー（3,547件）
- 24枚・19枚など大きいスライドを生成すると AgentCore のツール結果サイズ上限超過
- 別途対処が必要

### 3. 正しいAgentCoreロググループ名
- 古い記録: `/aws/bedrock-agentcore/runtimes/marp_agent_main-prwJIX55ac-DEFAULT`
- 正しい値: `/aws/bedrock-agentcore/runtimes/marp_agent_main-vE9ji6BCaL-DEFAULT`

---

## 実施した修正

### 修正1: http_requestのdocstring拡充（当初案・後に置き換え）

- コミット: `b3d5679`「http_requestのdocstringを拡充してBedrockキャッシュを復活」
- http_request単体のdocstringを ~90 → ~700トークンに拡充
- 懸念: 「キャッシュ確保のため水増し」という本来目的外の書き方になっていた

### 修正2: スライドルールをtool docstringに分散（本命・2026-03-02）

システムプロンプトに集中していたスライド作成ルールを各ツールのdocstringに移動する設計変更を実施。

- コミット: `429be94`「スライドルールをツールdocstringに移動してシステムプロンプトを簡素化」

| ファイル | 変更内容 |
|---------|---------|
| `config.py` | システムプロンプトをペルソナ+テーマ変数のみ（~50トークン）に大幅短縮 |
| `output_slide.py` | Marpフォーマットルール・構成テクニックA〜Eをdocstringに移動（~500トークン） |
| `web_search.py` | 使い方ルール・エラー対応をdocstringに移動 |
| `http_request.py` | 本来の用途説明のみのシンプルなdocstringに戻す |
| `generate_tweet.py` | Xシェアのフォーマットをdocstringに移動 |

**設計意図**: Bedrockのprompt cachingを確実に有効化するため、ツール定義合計を1024トークン以上に保ちつつ、docstringを本来の意図（そのツールを使うときのルール）で記述できるようにした。詳細は `docs/knowledge/backend.md` の「⚠️ Prompt cachingの最低ライン」セクションを参照。

### サンドボックス動作確認（2026-03-02）

- スライド13枚が正常生成
- 自動修正（ページあふれ検出→修正→再出力）も動作
- エラーなし

### kagへの反映

- コミット: `1a39145`（marp-agent-kag）でチェリーピック済み

---

## 残タスク

1. [x] キャッシュ復活修正のデプロイ（サンドボックス動作確認済み）
2. [ ] Cost ExplorerでCacheWriteが再開することを確認（数日後に確認）
3. [ ] `cache_prompt` deprecation対応（優先度低・現在も動作中）
4. [ ] `output_slide` の tool result サイズ問題の対処（別タスク）
