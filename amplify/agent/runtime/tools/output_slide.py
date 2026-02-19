"""スライド出力ツール（ページあふれチェック付き）"""

import math
import re
import unicodedata

from strands import tool

# スライド出力用のグローバル変数
# NOTE: ContextVarはStrands Agentsがツールを別スレッドで実行するため値が共有されない
_generated_markdown: str | None = None
_overflow_retry_count: int = 0

MAX_OVERFLOW_RETRIES = 2
MAX_LINES_PER_SLIDE = 9
# 1行あたりの最大表示幅（半角換算）
# Marp 16:9スライドでの実測値: 箇条書き行で半角約54文字分で折り返し発生
# 安全マージンとして全角3文字分（半角6）を引いた値
MAX_DISPLAY_WIDTH_PER_LINE = 48


def _get_display_width(text: str) -> int:
    """テキストの表示幅を半角換算で計算（全角=2, 半角=1）"""
    width = 0
    for char in text:
        eaw = unicodedata.east_asian_width(char)
        if eaw in ('F', 'W', 'A'):  # Fullwidth, Wide, Ambiguous（日本語環境では全角扱い）
            width += 2
        else:
            width += 1
    return width


def _strip_markdown_formatting(text: str) -> str:
    """マークダウンの装飾記法を除去して表示テキストを取得"""
    # 太字/斜体（** __ * _）
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'__(.+?)__', r'\1', text)
    text = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'\1', text)
    text = re.sub(r'(?<!_)_(?!_)(.+?)(?<!_)_(?!_)', r'\1', text)
    # 取り消し線
    text = re.sub(r'~~(.+?)~~', r'\1', text)
    # インラインコード
    text = re.sub(r'`(.+?)`', r'\1', text)
    # リンク [text](url) → text
    text = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', text)
    # 箇条書きマーカー
    text = re.sub(r'^[-*+]\s+', '', text)
    # 番号付きリスト
    text = re.sub(r'^\d+\.\s+', '', text)
    # 見出し
    text = re.sub(r'^#{1,6}\s+', '', text)
    # 引用
    text = re.sub(r'^>\s*', '', text)
    return text


def _estimate_visual_lines(text: str) -> int:
    """テキスト1行の表示幅から実質的な行数（折り返し考慮）を推定"""
    # テーブル行はセル幅の計算が複雑なため折り返し計算対象外
    stripped = text.strip()
    if stripped.startswith('|') and stripped.endswith('|'):
        return 1

    display_text = _strip_markdown_formatting(stripped)
    width = _get_display_width(display_text)
    if width <= MAX_DISPLAY_WIDTH_PER_LINE:
        return 1
    return math.ceil(width / MAX_DISPLAY_WIDTH_PER_LINE)


def _parse_slides(markdown: str) -> list[str]:
    """Marpマークダウンをスライドごとに分割（フロントマター除外）"""
    content = re.sub(r'^---\s*\n.*?\n---\s*\n', '', markdown, count=1, flags=re.DOTALL)
    slides = re.split(r'\n---\s*\n', content)
    return [s.strip() for s in slides if s.strip()]


def _count_content_lines(slide_content: str) -> int:
    """スライド内のコンテンツ行数をカウント（折り返し考慮）"""
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

        # 折り返しを考慮した実質行数を加算
        count += _estimate_visual_lines(stripped)

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


def get_generated_markdown() -> str | None:
    """生成されたマークダウンを取得"""
    return _generated_markdown


def reset_generated_markdown() -> None:
    """マークダウンをリセット"""
    global _generated_markdown, _overflow_retry_count
    _generated_markdown = None
    _overflow_retry_count = 0


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
            f"  - スライド{v['slide_number']}: 実質{v['line_count']}行（{v['excess']}行超過）"
            for v in violations
        )
        return (
            f"ページあふれ検出！以下のスライドが{MAX_LINES_PER_SLIDE}行を超えています（長い行の折り返しも考慮）：\n"
            f"{violation_details}\n"
            f"各スライドを{MAX_LINES_PER_SLIDE}行以内に修正してから再度 output_slide を呼んでください。"
            f"（長い文は短くするか、内容を複数スライドに分割するか、情報を厳選してください）"
        )

    if violations:
        print(f"[WARN] Slide overflow: max retries exceeded, accepting with violations: {violations}")

    _generated_markdown = markdown
    _overflow_retry_count = 0
    return "スライドを出力しました。"
