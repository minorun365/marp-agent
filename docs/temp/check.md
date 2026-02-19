# ページあふれチェック実装計画

> Issue: [#67 ページ溢れを厳格にチェックしたい](https://github.com/minorun365/marp-agent/issues/67)

## 問題

長いプロンプトやURLの大量情報を処理する際、以下の2パターンでスライドのページあふれが発生する。現状はユーザーが手動で修正を依頼する必要があり、UXが低下している。

1. **行数超過**: LLMがシステムプロンプトの「9行以内」制限を守れず、10行以上のコンテンツを出力
2. **折り返しによる実質超過**: 行数は9行以内だが、1行の文字数が多く折り返しが発生し、実質的に9行を超える（例: 全角40文字超の箇条書き）

## 実装案の比較

| 案 | 概要 | メリット | デメリット | 推奨度 |
|----|------|---------|-----------|--------|
| **A: output_slideツール内バリデーション** | ツール自体にチェックを組み込み、超過時はエラーを返してAgentに自動修正させる | 最小変更、自然なリトライ、テスト容易 | リトライ分のトークンコスト増 | **推奨** |
| B: 別ツール `validate_slides` | 検証専用ツールを追加 | 柔軟 | LLMが呼び忘れる、2ステップで信頼性低 | - |
| C: agent.pyで後処理ループ | ストリーム完了後に自動修正 | 100%捕捉 | コード複雑化、ネストストリーミング | - |
| D: サブエージェント方式 | 専用サブエージェントで検証 | 独立 | 品質低下が確認済み（backend.md参照） | - |

## 推奨案A: output_slideツール内バリデーション

### 仕組み

```
Agent → output_slide(markdown) → バリデーション
                                     │
                     ┌────────────────┤
                     ▼                ▼
                  OK: 出力完了     NG: エラーメッセージ返却
                                     │
                                     ▼
                              Agent が自動修正
                                     │
                                     ▼
                              output_slide 再呼び出し
                                     │
                           （最大2回リジェクト、
                            3回目は警告付き受入）
```

### 行数カウントルール

#### カウント対象（1行としてカウント）

| 要素 | 例 | 備考 |
|------|-----|------|
| 見出し | `## タイトル` | |
| 箇条書き | `- 項目` | ネスト含む |
| テキスト行 | `通常のテキスト` | |
| 表ヘッダー | `\| A \| B \|` | |
| 表データ行 | `\| 1 \| 2 \|` | 各行1カウント |
| コードブロック内の行 | `print("hello")` | ``` マーカー自体は除外 |
| 引用行 | `> テキスト` | |

#### カウント除外

| 要素 | 例 | 理由 |
|------|-----|------|
| 空行 | | 表示に影響しない |
| HTMLコメント | `<!-- _class: lead -->` | ディレクティブ |
| コードブロックマーカー | ` ``` ` | 装飾要素 |
| 表セパレーター | `\|---\|---\|` | 表示されない |

#### バリデーション対象外のスライド

以下の特殊スライドはコンテンツ量が少ないためスキップ：

- タイトルスライド（`_class: top`）
- セクション区切り（`_class: lead`）
- 裏表紙（`_class: end`）
- 参考文献（`_class: tinytext`）

### 制限値

- **9行/スライド**（システムプロンプトと統一）
- **最大リジェクト回数: 2回**（3回目は警告ログ付きで受け入れ）

### リトライ制御

| 回数 | 動作 |
|------|------|
| 1回目 | 超過スライドの詳細を返してリジェクト |
| 2回目 | 同上 |
| 3回目以降 | 警告ログを出力して受け入れ（無限ループ防止） |

リトライカウンターは `reset_generated_markdown()` 時（= 新しいリクエスト開始時）にリセット。

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `amplify/agent/runtime/tools/output_slide.py` | バリデーションロジック追加（`_check_slide_overflow`, `_count_content_lines`, `_parse_slides`） |
| `amplify/agent/runtime/config.py` | システムプロンプトに自動検証の説明を追記 |
| `tests/test_output_slide.py` | バリデーション関連テスト追加 |

### 実装コードイメージ

#### output_slide.py

```python
import re
from strands import tool

_generated_markdown: str | None = None
_overflow_retry_count: int = 0
MAX_OVERFLOW_RETRIES = 2
MAX_LINES_PER_SLIDE = 9


def _parse_slides(markdown: str) -> list[str]:
    """Marpマークダウンをスライドごとに分割（フロントマター除外）"""
    content = re.sub(r'^---\s*\n.*?\n---\s*\n', '', markdown, count=1, flags=re.DOTALL)
    slides = re.split(r'\n---\s*\n', content)
    return [s.strip() for s in slides if s.strip()]


def _count_content_lines(slide_content: str) -> int:
    """スライド内のコンテンツ行数をカウント"""
    lines = slide_content.split('\n')
    count = 0
    in_code_block = False

    for line in lines:
        stripped = line.strip()

        # コードブロック開始/終了（マーカー自体はカウントしない）
        if stripped.startswith('```'):
            in_code_block = not in_code_block
            continue

        if not stripped:
            continue  # 空行スキップ

        if re.match(r'^<!--.*-->$', stripped):
            continue  # HTMLコメントスキップ

        if re.match(r'^\|[\s\-:|]+\|$', stripped):
            continue  # 表セパレーター行スキップ

        count += 1

    return count


def _check_slide_overflow(markdown: str) -> list[dict]:
    """各スライドの行数をチェックし、制限超過スライドの情報を返す"""
    slides = _parse_slides(markdown)
    violations = []

    for i, slide in enumerate(slides, start=1):
        # 特殊スライド（top, lead, end, tinytext）はスキップ
        if re.search(r'_class:\s*(top|lead|end|tinytext)', slide):
            continue

        line_count = _count_content_lines(slide)
        if line_count > MAX_LINES_PER_SLIDE:
            violations.append({
                'slide_number': i,
                'line_count': line_count,
                'excess': line_count - MAX_LINES_PER_SLIDE,
            })

    return violations


@tool
def output_slide(markdown: str) -> str:
    """生成したスライドのマークダウンを出力します。スライドを作成・編集したら必ずこのツールを使って出力してください。

    Args:
        markdown: Marp形式のマークダウン全文（フロントマターを含む）

    Returns:
        出力完了メッセージ（行数超過時はエラーメッセージ）
    """
    global _generated_markdown, _overflow_retry_count

    violations = _check_slide_overflow(markdown)

    if violations and _overflow_retry_count < MAX_OVERFLOW_RETRIES:
        _overflow_retry_count += 1
        violation_details = "\n".join(
            f"  - スライド{v['slide_number']}: {v['line_count']}行（{v['excess']}行超過）"
            for v in violations
        )
        return (
            f"ページあふれ検出！以下のスライドが{MAX_LINES_PER_SLIDE}行を超えています：\n"
            f"{violation_details}\n"
            f"各スライドを{MAX_LINES_PER_SLIDE}行以内に修正してから再度 output_slide を呼んでください。"
            f"（内容を複数スライドに分割するか、情報を厳選してください）"
        )

    if violations:
        print(f"[WARN] Slide overflow: max retries exceeded, accepting with violations: {violations}")

    _generated_markdown = markdown
    _overflow_retry_count = 0
    return "スライドを出力しました。"


def get_generated_markdown() -> str | None:
    return _generated_markdown


def reset_generated_markdown() -> None:
    global _generated_markdown, _overflow_retry_count
    _generated_markdown = None
    _overflow_retry_count = 0
```

#### config.py（システムプロンプト追記）

```diff
- - **1スライドの行数制限**: 見出し（`##`）＋小見出し＋本文等すべて合わせて9行以内に収める（はみ出し防止）
+ - **1スライドの行数制限**: 見出し（`##`）＋小見出し＋本文等すべて合わせて9行以内に収める（はみ出し防止）。output_slideツールが行数を自動検証し、超過時はエラーを返します。指摘に従い修正してから再出力してください
```

### テストケース

| テスト | 内容 | 期待結果 |
|--------|------|---------|
| 全スライド9行以内 | 正常なマークダウン | `"スライドを出力しました。"` |
| 1スライドが10行 | 超過スライドあり | エラーメッセージ返却 |
| 特殊スライド（lead等）が10行超 | `_class: lead`付きスライド | チェックスキップ、正常出力 |
| コードブロック内の行 | ```内の行もカウント | 正しくカウント |
| HTMLコメントのみの行 | `<!-- ... -->` | カウントされない |
| 表セパレーター行 | `\|---\|---\|` | カウントされない |
| リトライ上限超過 | 3回連続で超過マークダウン | 3回目は警告付き受入 |
| リセット後のリトライカウンター | reset → 新しいリクエスト | カウンター0にリセット |

## 工数見積もり

- 実装: 1時間
- テスト: 30分
- 動作確認: 30分
