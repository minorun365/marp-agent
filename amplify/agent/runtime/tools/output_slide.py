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
# テーブル行の最大表示幅（半角換算）
# テーブルはテキスト折り返しされず横にはみ出すため、行全体の幅をチェック
# Marp 16:9での実測: 3列テーブルで全角10文字/セル程度が上限
MAX_TABLE_ROW_WIDTH = 64


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


def _check_table_width(slide_content: str) -> int:
    """テーブル行の横幅をチェックし、最大幅を返す（超過なしなら0）"""
    max_width = 0
    for line in slide_content.split('\n'):
        stripped = line.strip()
        if not (stripped.startswith('|') and stripped.endswith('|')):
            continue
        # セパレーター行はスキップ
        if re.match(r'^\|[\s\-:|]+\|$', stripped):
            continue
        width = _get_display_width(stripped)
        if width > MAX_TABLE_ROW_WIDTH:
            max_width = max(max_width, width)
    return max_width


def _check_slide_overflow(markdown: str) -> list[dict]:
    """各スライドの行数・テーブル横幅をチェックし、制限超過スライドの情報を返す"""
    slides = _parse_slides(markdown)
    violations = []

    for i, slide in enumerate(slides, start=1):
        # 特殊スライド（top, lead, end, tinytext）はスキップ
        if re.search(r'_class:\s*(top|lead|end|tinytext)', slide):
            continue

        # 行数チェック（縦方向）
        line_count = _count_content_lines(slide)
        if line_count > MAX_LINES_PER_SLIDE:
            violations.append({
                'slide_number': i,
                'type': 'line_overflow',
                'line_count': line_count,
                'excess': line_count - MAX_LINES_PER_SLIDE,
            })

        # テーブル横幅チェック
        table_max_width = _check_table_width(slide)
        if table_max_width > 0:
            violations.append({
                'slide_number': i,
                'type': 'table_overflow',
                'max_width': table_max_width,
                'excess': table_max_width - MAX_TABLE_ROW_WIDTH,
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
    """生成したスライドのマークダウンを出力します。スライドを作成・編集したら必ずこのツールを使って出力してください（テキストで直接書き出さない）。

    ## Marpフォーマットルール

    - フロントマター: `marp: true`, `theme: {テーマ名}`, `size: 16:9`, `paginate: true`
    - スライド区切り: `---`
    - 1枚目はタイトルスライド（`<!-- _class: top --><!-- _paginate: skip -->`付き、テキスト中央揃え）
    - **1スライドの行数**: 見出し＋本文すべて合わせて7〜8行を目標（9行が上限、このツールが自動検証）。3〜4行で終わらせない。1行が長いと折り返しで実質2行になるため、全角24文字（半角48文字）程度に抑える
    - **絵文字は使用禁止**（自動改行でレイアウト崩れ）
    - ==ハイライト==記法は使用禁止（日本語と相性悪い）

    ## 構成テクニック

    - **セクション区切り【必須】**: 3〜4枚ごとに `<!-- _class: lead -->` の中タイトルスライドを挿入
    - **スライドの表現パターン【重要】**: 同じパターンが2枚連続しないよう、以下A〜Eをローテーションする:
      - A. **箇条書き型**: `##` + 箇条書き5〜6項目
      - B. **小見出し型**: `##` + `###` + 説明文2〜3行 + 箇条書き2〜3項目
      - C. **テーブル型**: `##` + リード文1行 + 2〜3列テーブル（セル内容は全角10文字以内。横幅もこのツールが自動検証）
      - D. **本文+箇条書き型**: `##` + 説明文1〜2行 + 箇条書き4〜5項目
      - E. **まとめ型**: `##` + 箇条書き3〜4項目 + `**太字のワンライナーまとめ**`
    - **箇条書きスタイル**: 太字は使用OK。日本語テキストでコロンを使う場合は半角（:）ではなく全角（：）にする
    - **出典スライド**: Web検索時は最後に `<!-- _class: tinytext -->` 付きの参考文献スライドを追加
    - **裏表紙【必須】**: 最後のスライドは `<!-- _class: end --><!-- _paginate: skip -->` を付けて「Thank you!」とだけ表示

    ## 出力後のふるまい

    - 出力完了後は一切喋らない。内容の説明・要約・確認メッセージは全て不要
    - ページあふれ修正時は「○ページ目の文字量がはみ出していたため、内容を調整します」のように、何が起きて何をするか分かりやすく伝える

    Args:
        markdown: Marp形式のマークダウン全文（フロントマターを含む）

    Returns:
        出力完了メッセージ（行数超過時はエラーメッセージ）
    """
    global _generated_markdown, _overflow_retry_count

    violations = _check_slide_overflow(markdown)

    if violations and _overflow_retry_count < MAX_OVERFLOW_RETRIES:
        _overflow_retry_count += 1
        details = []
        for v in violations:
            if v['type'] == 'line_overflow':
                details.append(
                    f"  - スライド{v['slide_number']}: 実質{v['line_count']}行（{v['excess']}行超過）"
                )
            elif v['type'] == 'table_overflow':
                details.append(
                    f"  - スライド{v['slide_number']}: 表の横幅超過（{v['max_width']}文字、上限{MAX_TABLE_ROW_WIDTH}文字）"
                )
        violation_details = "\n".join(details)
        return (
            f"あふれ検出！以下のスライドに問題があります：\n"
            f"{violation_details}\n"
            f"修正してから再度 output_slide を呼んでください。"
            f"（行数超過→内容を減らすか分割。表の横幅超過→列数を減らすかセル内容を短くする）"
        )

    if violations:
        print(f"[WARN] Slide overflow: max retries exceeded, accepting with violations: {violations}")

    _generated_markdown = markdown
    _overflow_retry_count = 0
    return "スライドを出力しました。"
