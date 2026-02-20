# セッション単価改善（2026-02-20）

## 背景

2/19のセッション単価が $1.03（平均 $0.64）と高く、原因を分析して改善を実施。

## 原因分析

### 根本原因: http_request のWebページ全文がコンテキストを肥大化

セッション `1f6c9f13` で以下が判明:
- `http_request` が1回あたり 15,000〜19,000文字のWebページ全文を返していた
- 2件のhttp_request結果（合計約34,000文字）がコンテキストに累積
- `output_slide` のページあふれリトライで毎回LLMに再送信
- ピーク時 69,728文字（約35,000トークン）のinput、31回のLLMコール

## 実施した改善

### 改善1: http_request ツールにHaiku要約を導入 ✅

**ファイル**: `amplify/agent/runtime/tools/http_request.py`（新規）、`tools/__init__.py`（変更）

- `strands_tools` のビルトイン `http_request` → カスタムラッパーに差し替え
- HTMLレスポンスはタグ除去してテキスト化
- 5,000文字以上のレスポンスは Claude Haiku（`us.anthropic.claude-haiku-4-5-20251001-v1:0`）で要約
- 要約失敗時は5,000文字で切り詰め（フォールバック）

**コスト試算**: Haiku要約1回 ~$0.015 vs Sonnetでの再送コスト ~$0.108 → 約85%削減

### 改善2: per_turn=True の導入 → 即座に撤回 ❌

**ファイル**: `amplify/agent/runtime/session/manager.py`

- `SlidingWindowConversationManager(window_size=6, per_turn=True)` に変更
- **Strands の並列ツール実行と非互換**: ツール結果が1件ずつ追加される際にトリミングが走り、LLMが情報不足と判断して再検索を繰り返す正のフィードバックループが発生
- 1セッションで web_search 16〜20回に増殖、Tavily APIレートリミットに抵触
- `output_slide` で "The tool result was too large!" エラーも発生
- **即座に `per_turn=False` に戻して解消**

## 残課題

### Tavily検索回数がやや多い

- per_turn問題は解消したが、http_request ツール導入以前と比べて検索回数がやや多い印象
- システムプロンプトで「http_requestでページ内容を直接取得すること（Tavily APIクレジット節約のため）」と指示しているが、十分に効いていない可能性
- 対策案:
  - システムプロンプトで検索回数の上限を明示（例: 「1リクエストで検索は最大3回まで」）
  - web_search ツール内にリクエスト単位の呼び出し回数ガードを実装

## 変更ファイル一覧

| ファイル | 変更内容 | 状態 |
|----------|----------|------|
| `amplify/agent/runtime/tools/http_request.py` | Haiku要約付きHTTPラッパー（新規） | ✅ |
| `amplify/agent/runtime/tools/__init__.py` | import先を strands_tools → ローカルに変更 | ✅ |
| `amplify/agent/runtime/session/manager.py` | per_turn=True → False に戻し（変更なし） | ✅ |
| `docs/knowledge/backend.md` | ナレッジ反映 | ✅ |

## 効果測定（2/20 23:30〜23:59 JST サンドボックステスト）

### テスト結果

| セッション | web_search | http_request | inputピーク | 結果 |
|-----------|-----------|-------------|-----------|------|
| `db9d3972` | 3回 | 0回 | ~7,000文字 | 情報収集のみ（正常） |
| `8cf7a652` | 20回 | 5回 | ~3,900文字 | Tavily API枯渇で途中終了 |
| `7a2beb47` | 15回 | 3回 | ~9,600文字 | スライド正常完了 |

### 改善効果の評価

- **per_turn問題は解消**: フィードバックループは発生せず ✅
- **inputトークンはコンパクト**: 各スパンのピークが ~9,600文字（改善前ピーク69,728文字から大幅減） ✅
- **Haiku要約は未発動**: テストページが全て5,000文字未満のため発動しなかった（大きなページでの別途テストが必要）
- **web_search回数は改善されず**: 15〜20回/セッション（改善前と同水準） ❌

### 結論

http_requestのHaiku要約は**コンテキスト肥大化の防止策**として有効だが、**web_search回数の削減**は別のアプローチが必要。検索回数が多い問題は http_request ツール導入以前からの傾向であり、LLMの検索行動パターン自体を制御する必要がある。

### 次のアクション

1. **web_search回数の制御**: システムプロンプトに検索回数の上限を明示 or ツール内にガードを実装
2. **Haiku要約の動作確認**: 大きなWebページ（企業サイト等）を対象にしたテスト
3. **cache_prompt 警告**: Strands SDK更新に伴い `SystemContentBlock.cachePoint` への移行を検討（機能影響なし）
