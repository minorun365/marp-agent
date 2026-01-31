# #42 Kimi K2がWeb検索後に無応答で終了する問題

## 概要

Kimi K2 ThinkingモデルでWeb検索を実行した後、output_slideツールもテキストメッセージも出力せずにend_turnで終了するケースがある。フロントエンドでは「Web検索完了」のステータス表示後に何も表示されず、アプリの不具合のように見える。

## 再現条件

- モデル: Kimi K2 Thinking
- クエリ例: 「黄金の太陽DS版はなぜ酷評されたのか」
- 発生率: 不定（同じクエリでも成功/失敗が混在）

## 調査結果

### CloudWatch Logsから確認した失敗パターン

同じ質問で6件のリクエストを調査した結果、3件が失敗。

| # | 時刻 | Web検索 | output_slide | テキスト出力 | 結果 |
|---|------|---------|--------------|-------------|------|
| 1 | 19:28 | 成功 | 呼ばれず | なし | **失敗** |
| 2 | 19:35 | 成功 | 成功 | あり | 成功 |
| 3 | 20:05 | 成功 | 成功 | あり | 成功 |
| 4 | 20:31 | 成功 | 成功 | あり | 成功 |
| 5 | 20:46 | 成功 | 呼ばれず | なし | **失敗** |
| 6 | 20:47 | 呼ばれず | 呼ばれず | あり（マークダウン直接出力） | **失敗** |

### 失敗パターンの詳細

#### パターンA: Web検索成功 → 無応答でend_turn（#1, #5）

```json
// 最終ログ
"message": "", "finish_reason": "end_turn"
```

- Web検索結果を得た後、思考プロセス（reasoning）は実行される
- しかしoutput_slideツールを呼ばない
- テキストメッセージも出力しない
- 空メッセージで`end_turn`となり終了

#### パターンB: マークダウンをテキストとして直接出力（#6）

```json
"message": " ---\nmarp: true\ntheme: kag\n..."
```

- output_slideツールを使わずマークダウンをテキストフィールドに出力
- 既存のフォールバック処理（`extract_marp_markdown_from_text`）で対応可能なはず

### 既存の対策で対応できない理由

1. **ツール名破損検出**: `current_tool_use`イベントが発火しないため検出できない
2. **reasoningText内ツール呼び出し検出**: ツール呼び出しの意図自体がreasoningTextに含まれていない

---

## 期待する動作

Web検索後にスライドを生成しない場合でも、以下のようなテキストメッセージを返す：

> 「調べた結果、○○ということがわかりました。スライドを作りましょうか？」

何も出力されないのが問題。ユーザーにはアプリの不具合に見える。

---

## 対応策の案

### 案A: 何も出力されなかった場合のフォールバックメッセージ（推奨）

**概要**: ストリーム終了時に何も出力されなかった場合、フォールバックメッセージを送信する。

**実装方法**:
```python
# agent.py

# フラグ追加
has_any_output = False

# テキスト送信時にフラグをTrue
if "data" in event:
    has_any_output = True
    yield {"type": "text", "data": chunk}

# ストリーム終了後、何も出力されなかった場合
if not has_any_output and not _generated_markdown and not fallback_markdown:
    yield {"type": "text", "data": "処理が完了しましたが、応答がありませんでした。もう一度お試しください。"}
```

**メリット**:
- シンプルな実装
- ユーザーに「何か問題があった」ことが伝わる
- リトライを促せる

**デメリット**:
- 根本解決ではない（Kimi K2の挙動は変わらない）

**工数**: 10分

---

### 案B: Web検索結果をテキストとして返す

**概要**: Web検索成功後にoutput_slideが呼ばれなかった場合、Web検索結果をテキストとして返す。

**実装方法**:
```python
# Web検索結果を保持
_last_search_result: str | None = None

@tool
def web_search(query: str) -> str:
    global _last_search_result
    result = # 検索実行
    _last_search_result = result
    return result

# ストリーム終了後
if not has_any_output and _last_search_result:
    yield {"type": "text", "data": f"Web検索結果:\n{_last_search_result[:500]}...\n\nスライドを作成しますか？"}
```

**メリット**:
- ユーザーに検索結果が見える
- 次のアクションを促せる

**デメリット**:
- 検索結果が長い場合の表示が課題
- グローバル変数が増える

**工数**: 20分

---

### 案C: end_turn検出時のリトライ

**概要**: Web検索成功後にoutput_slideが呼ばれずend_turnした場合、リトライする。

**実装方法**:
```python
# リトライ条件に追加
web_search_called = False  # Web検索が呼ばれたかフラグ

# ツール使用時
if tool_name == "web_search":
    web_search_called = True

# リトライ判定
if web_search_called and not _generated_markdown and not has_any_output and model_type == "kimi":
    retry_count += 1
    # リトライ処理
```

**メリット**:
- 自動的にリトライして成功する可能性がある

**デメリット**:
- リトライしても同じ結果になる可能性が高い
- ユーザー体験が悪化（待ち時間が増える）
- 無駄なAPI呼び出しが増える

**工数**: 30分

---

### 案D: システムプロンプト強化

**概要**: Web検索後は必ず何かしらの応答を返すようシステムプロンプトを強化。

**追加内容**:
```markdown
## Web検索後の応答ルール【必須】

Web検索を実行した後は、**必ず以下のいずれかを行ってください**：

1. スライドを作成する場合 → output_slideツールを使用
2. スライドを作成しない場合 → 検索結果の要約をテキストで返す

**禁止**: Web検索後に何も出力せずに終了すること
```

**メリット**:
- 根本的な解決に近づく可能性

**デメリット**:
- Kimi K2が指示に従わない可能性がある（既に「必ずoutput_slideを使う」指示があるのに従っていない）
- 効果が不確実

**工数**: 10分

---

### 案E: Kimi K2のfallback処理強化（パターンB対応）

**概要**: テキストストリームにマークダウンが出力された場合のフォールバック処理を確実に動作させる。

**現状確認**:
- `extract_marp_markdown_from_text`関数は存在する
- `kimi_text_buffer`でテキストを蓄積している
- ストリーム終了後に抽出処理を実行

**確認ポイント**:
- パターンBのケースで実際にフォールバックが動作しているか
- 動作していない場合、原因を特定

**工数**: 調査30分 + 修正10分

---

## 推奨する対応

### Phase 1: 最小限の対応（案A）

1. `has_any_output`フラグを追加
2. 何も出力されなかった場合にフォールバックメッセージを送信
3. ユーザーにリトライを促す

**理由**:
- 最も確実にユーザー体験を改善できる
- 実装がシンプルで副作用が少ない

### Phase 2: 追加対応（案D + 案E）

1. システムプロンプトにWeb検索後の応答ルールを追加
2. パターンBのフォールバック処理が動作しているか確認・修正

**理由**:
- 根本解決に近づく可能性がある
- 既存のフォールバック処理を活かせる

---

## 参考情報

### 関連issue

- #40: Kimiがスライド内容をチャットに出力しがち問題（パターンBと関連）

### 関連コード

- `amplify/agent/runtime/agent.py`
  - `invoke`関数（ストリーミング処理）
  - `extract_marp_markdown_from_text`関数（フォールバック）
  - `SYSTEM_PROMPT`

### 関連ナレッジ

- `~/.claude/skills/kb-strands-agentcore/skill.md`
  - Kimi K2 Thinking: ツール呼び出しがreasoningText内に埋め込まれる
  - Kimi K2 Thinking: ツール名破損とリトライ
