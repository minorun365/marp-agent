# スライド生成UX改善提案

## 全体の処理フロー（現状）

スライド生成時の処理は、バックエンド（`agent.py`）→ フロントエンド（`useChatMessages.ts`）で以下のように流れる。

```
[ユーザーがプロンプト送信]
    ↓
[バックエンド: agent.py]
    ↓ LLMのストリーミング開始
    ↓
    ├─ "data" イベント → type:"text" として送信 → フロントのチャット欄に表示
    ├─ "current_tool_use" イベント → type:"tool_use" として送信 → フロントのステータス表示
    ├─ "result" イベント → ツール実行結果を処理
    │   ├─ result.message.text → type:"text" で送信（※ここも表示される）
    │   └─ output_slideの場合: type:"markdown" で送信 → フロントのスライドプレビューに反映
    │                          ↑ ここで reset_generated_markdown() を実行
    ↓
    ├─ LLMが引き続きテキスト生成 → type:"text" でそのまま送信（※止められない）
    ↓
[ストリーム終了後の後処理]
    ├─ get_generated_markdown() → None（既にリセット済み！）
    ├─ web_search_executed=true AND not generated_markdown → フォールバック条件が成立！
    └─ → 「Web検索結果: ... スライドを作成しますか？」を誤出力
```

---

## 改善1: スライド出力後のサマリーメッセージを廃止

### 現状の問題

2箇所で不要なテキストが出力されている。

#### 問題A: LLMの後続テキスト

`agent.py:198-201` で、LLMが生成する全テキストを無条件に `type:"text"` で送信している。
output_slide ツール完了後もLLMはテキスト生成を続けるため、要約メッセージがチャットに表示される。

```python
# agent.py 198-201行目
async for event in stream:
    if "data" in event:
        chunk = event["data"]
        yield {"type": "text", "data": chunk}  # ← 全部送ってしまう
```

システムプロンプトで「一切喋るな」と指示しても、LLMが100%従う保証はない。

#### 問題B: フォールバックの誤発動（「スライドを作成しますか？」）

`agent.py:250-258` のフォールバックロジックにバグがある。

```python
# agent.py 234-238行目（ストリーム中）
generated_markdown = get_generated_markdown()
if generated_markdown:
    yield {"type": "markdown", "data": generated_markdown}
    reset_generated_markdown()  # ← ここでリセット！

# agent.py 246-258行目（ストリーム終了後）
generated_markdown = get_generated_markdown()  # ← None（リセット済み）
# ...
if web_search_executed and not generated_markdown and last_search_result:
    # ↑ web検索した & markdownがNone → 条件成立！
    fallback_message = f"Web検索結果:\n\n{truncated_result}\n\n---\nスライドを作成しますか？"
    yield {"type": "text", "data": fallback_message}  # ← これが誤出力される
```

**原因**: 238行目で `reset_generated_markdown()` した後に、246行目で再チェックしているため、
スライドを正常に出力したのに「スライドが生成されなかった」と誤判定される。

### 修正方針

1. **スライド出力済みフラグ**（`slide_outputted`）を追加し、フォールバック判定に使う
2. **output_slide完了後のテキスト送信を抑制**するフラグを追加

```python
# 修正イメージ（agent.py）
slide_outputted = False
suppress_text = False

async for event in stream:
    if "data" in event:
        if not suppress_text:  # スライド出力後はテキストを抑制
            yield {"type": "text", "data": event["data"]}

    elif "result" in event:
        # ... 既存処理 ...
        generated_markdown = get_generated_markdown()
        if generated_markdown:
            yield {"type": "markdown", "data": generated_markdown}
            reset_generated_markdown()
            slide_outputted = True   # フラグを立てる
            suppress_text = True     # 以降のテキストを抑制

# ストリーム終了後のフォールバック
if web_search_executed and not slide_outputted and last_search_result:
    # ↑ slide_outputted で判定（generated_markdown ではなく）
    yield {"type": "text", "data": fallback_message}
```

---

## 改善2: 文字あふれ修正時のユーザーメッセージを分かりやすく

### 現状の問題

ページあふれ検出時、`output_slide.py` のツール戻り値（LLM向けのエラーメッセージ）を受けて、
LLMが「スライド5を修正します」のように簡素なメッセージしか返さない。

ユーザーには何が起きているのか分かりにくい。

### 修正方針

`config.py` のシステムプロンプトに指示追加（済み）:

```
- ページあふれ修正時は「○ページ目の文字量がはみ出していたため、内容を調整します」のように伝える
```

※ `output_slide.py` のツール戻り値は変更不要（LLMへの技術情報として現状維持）

---

## 改善3: 箇条書きスタイルの改善（太字見出し禁止）

### 現状の問題

LLMが箇条書きで「**見出し**: 説明文」形式を多用する。

```markdown
- **AWS Lambda**: サーバーレスでコードを実行できるサービス
- **Amazon S3**: オブジェクトストレージサービス
```

### 修正方針

`config.py` のシステムプロンプトに指示追加（済み）:

```
- 箇条書きは「**見出し**: 説明」形式を使わず、説明内容だけをベタ書きで書く（太字不使用）
```

期待する出力:
```markdown
- Lambdaなら、サーバーレスでコードを実行できる
- S3はオブジェクトストレージサービス
```

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `amplify/agent/runtime/config.py` | システムプロンプト修正（改善2, 3は対応済み） |
| `amplify/agent/runtime/agent.py` | スライド出力済みフラグ追加 + テキスト抑制 + フォールバック修正（改善1） |
