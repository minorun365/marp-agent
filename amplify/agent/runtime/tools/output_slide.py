"""スライド出力ツール（ページあふれチェック付き）"""

import math
import re
import unicodedata
from urllib.parse import urlparse

from strands import tool

# スライド出力用のグローバル変数
# NOTE: ContextVarはStrands Agentsがツールを別スレッドで実行するため値が共有されない
_generated_markdown: str | None = None
_overflow_retry_count: int = 0
_expected_slide_count: int | None = None
_maximum_slide_count: int | None = None
_agenda_requested: bool = False
_active_model_type: str = "sonnet"
_web_search_executed: bool = False
_user_quantified_claims: set[str] = set()
_required_official_source_rules: list[dict] = []

OFFICIAL_SOURCE_RULES = (
    {
        'name': 'Amazon Bedrock AgentCore',
        'markers': ('AgentCore', 'Bedrock AgentCore'),
        'domains': ('aws.amazon.com', 'docs.aws.amazon.com'),
        'url_keywords': ('agentcore',),
    },
    {
        'name': 'Claude Code',
        'markers': ('Claude Code',),
        'domains': ('anthropic.com', 'claude.com'),
        'url_keywords': ('claude-code',),
    },
    {
        'name': 'Codex',
        'markers': ('Codex',),
        'domains': ('openai.com',),
        'url_keywords': ('codex',),
    },
)

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

QUANTIFIED_CLAIM_PATTERN = re.compile(
    r'(?:\$\s*\d[\d,.]*|\d[\d,.]*\s*(?:%|％|円|ドル|USD|万円|億円|ヶ月|か月|カ月|年|日|時間|人|倍))',
    re.IGNORECASE,
)


def _url_matches_domains(url: str, domains: tuple[str, ...]) -> bool:
    """URLが指定した公式ドメインまたはそのサブドメインかを判定する。"""
    hostname = (urlparse(url).hostname or '').lower()
    return any(hostname == domain or hostname.endswith(f'.{domain}') for domain in domains)


def _url_matches_official_rule(url: str, rule: dict) -> bool:
    """公式ドメインかつ対象製品を明示するURLかを判定する。"""
    normalized_url = url.lower()
    return (
        _url_matches_domains(url, rule['domains'])
        and any(keyword in normalized_url for keyword in rule['url_keywords'])
    )


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


def configure_slide_validation(user_message: str, model_type: str) -> None:
    """ユーザー指示とモデル種別に応じた出力検証を設定する。"""
    global _expected_slide_count, _maximum_slide_count
    global _agenda_requested, _active_model_type, _user_quantified_claims
    global _required_official_source_rules
    slide_counts = re.findall(r'(\d{1,2})\s*枚', user_message)
    if slide_counts:
        _expected_slide_count = int(slide_counts[-1])
        _maximum_slide_count = None
    elif model_type == 'kimi':
        # Sonnet実測と同等の情報量を許容しつつ、際限なく増えないようにする。
        _expected_slide_count = None
        _maximum_slide_count = 20
    elif model_type == 'sol':
        _expected_slide_count = None
        _maximum_slide_count = 10
    else:
        _expected_slide_count = None
        _maximum_slide_count = None
    _agenda_requested = bool(
        re.search(r'(アジェンダ|目次).{0,12}(作|追加|含)', user_message)
    )
    _active_model_type = model_type
    _user_quantified_claims = set(QUANTIFIED_CLAIM_PATTERN.findall(user_message))
    _required_official_source_rules = [
        rule
        for rule in OFFICIAL_SOURCE_RULES
        if model_type == 'kimi'
        and any(marker.lower() in user_message.lower() for marker in rule['markers'])
    ]


def mark_web_search_executed() -> None:
    """Web検索後の出典検証を有効化する。"""
    global _web_search_executed
    _web_search_executed = True


def _check_slide_structure(markdown: str) -> list[dict]:
    """指定枚数・中タイトル数・モデル固有スタイルを検証する。"""
    slides = _parse_slides(markdown)
    violations = []

    if _expected_slide_count is not None and len(slides) != _expected_slide_count:
        violations.append({
            'type': 'slide_count',
            'expected': _expected_slide_count,
            'actual': len(slides),
        })

    if _maximum_slide_count is not None and len(slides) > _maximum_slide_count:
        violations.append({
            'type': 'slide_count_max',
            'maximum': _maximum_slide_count,
            'actual': len(slides),
        })

    lead_count = sum(bool(re.search(r'_class:\s*lead', slide)) for slide in slides)
    validation_count = _expected_slide_count or _maximum_slide_count
    if validation_count is not None and validation_count <= 12 and lead_count > 2:
        violations.append({
            'type': 'lead_count',
            'actual': lead_count,
            'maximum': 2,
        })

    if not _agenda_requested:
        agenda_slides = [
            index
            for index, slide in enumerate(slides, start=1)
            if re.search(r'^#{1,3}\s+.*(アジェンダ|目次)', slide, re.MULTILINE)
        ]
        if agenda_slides:
            violations.append({
                'type': 'unrequested_agenda',
                'slides': agenda_slides,
            })

    if _web_search_executed:
        source_slides = [
            slide
            for slide in slides
            if re.search(r'_class:\s*tinytext', slide)
            and re.search(r'^#{1,3}\s+.*(参考文献|出典|Sources?)', slide, re.MULTILINE | re.IGNORECASE)
        ]
        source_urls = re.findall(r'https?://[^\s)>]+', '\n'.join(source_slides))
        if not source_slides or len(source_urls) < 3:
            violations.append({
                'type': 'missing_sources',
                'url_count': len(source_urls),
                'minimum': 3,
            })
        source_url_set = {url.rstrip('.,、。') for url in source_urls}
        missing_official_sources = [
            rule['name']
            for rule in _required_official_source_rules
            if not any(
                _url_matches_official_rule(url, rule)
                for url in source_url_set
            )
        ]
        if missing_official_sources:
            violations.append({
                'type': 'missing_official_sources',
                'products': missing_official_sources,
            })
        missing_slide_sources = []
        unlisted_slide_sources = []
        non_official_slide_sources = []
        irrelevant_slide_sources = []
        for index, slide in enumerate(slides, start=1):
            if re.search(r'_class:\s*(top|lead|end|tinytext)', slide):
                continue
            slide_source_urls = [
                url.rstrip('.,、。')
                for url in re.findall(
                    r'<!--\s*source:\s*(https?://[^\s>]+)\s*-->',
                    slide,
                    re.IGNORECASE,
                )
            ]
            if not slide_source_urls:
                missing_slide_sources.append(index)
            else:
                unlisted_slide_sources.extend(
                    {'slide': index, 'url': url}
                    for url in slide_source_urls
                    if url not in source_url_set
                )
                active_slide_rules = [
                    rule
                    for rule in _required_official_source_rules
                    if any(marker.lower() in slide.lower() for marker in rule['markers'])
                ]
                for rule in active_slide_rules:
                    if (
                        not any(
                            _url_matches_official_rule(url, rule)
                            for url in slide_source_urls
                        )
                    ):
                        non_official_slide_sources.append({
                            'slide': index,
                            'product': rule['name'],
                        })
                if active_slide_rules:
                    irrelevant_slide_sources.extend(
                        {'slide': index, 'url': url}
                        for url in slide_source_urls
                        if not any(
                            _url_matches_official_rule(url, rule)
                            for rule in active_slide_rules
                        )
                    )
        if missing_slide_sources:
            violations.append({
                'type': 'missing_slide_sources',
                'slides': missing_slide_sources,
            })
        if unlisted_slide_sources:
            violations.append({
                'type': 'unlisted_slide_sources',
                'sources': unlisted_slide_sources,
            })
        if non_official_slide_sources:
            violations.append({
                'type': 'non_official_slide_sources',
                'sources': non_official_slide_sources,
            })
        if irrelevant_slide_sources:
            violations.append({
                'type': 'irrelevant_slide_sources',
                'sources': irrelevant_slide_sources,
            })

    if _active_model_type == 'kimi' and not _web_search_executed:
        unsupported_claims = sorted(
            claim
            for claim in set(QUANTIFIED_CLAIM_PATTERN.findall(markdown))
            if claim not in _user_quantified_claims
        )
        if unsupported_claims:
            violations.append({
                'type': 'unsupported_quantified_claims',
                'claims': unsupported_claims,
            })

    if _active_model_type in {'kimi', 'glm'}:
        previous_pattern = None
        consecutive_pattern_count = 0
        for index, slide in enumerate(slides, start=1):
            if re.search(r'_class:\s*(top|lead|end|tinytext)', slide):
                previous_pattern = None
                consecutive_pattern_count = 0
                continue
            bold_count = len(re.findall(r'\*\*.+?\*\*', slide))
            if bold_count > 2:
                violations.append({
                    'type': 'bold_overuse',
                    'slide_number': index,
                    'count': bold_count,
                })
            if re.search(r'^\|.*\|$', slide, re.MULTILINE):
                pattern = 'table'
            elif re.search(r'^###\s+', slide, re.MULTILINE):
                pattern = 'subheading'
            elif len(re.findall(r'^[-*+]\s+', slide, re.MULTILINE)) >= 3:
                pattern = 'bullets'
            else:
                pattern = 'prose'
            if pattern == previous_pattern:
                consecutive_pattern_count += 1
            else:
                previous_pattern = pattern
                consecutive_pattern_count = 1
            if consecutive_pattern_count >= 3:
                violations.append({
                    'type': 'pattern_repetition',
                    'slide_number': index,
                    'pattern': pattern,
                })

    return violations


def get_generated_markdown() -> str | None:
    """生成されたマークダウンを取得"""
    return _generated_markdown


def reset_generated_markdown() -> None:
    """マークダウンをリセット"""
    global _generated_markdown, _overflow_retry_count
    global _expected_slide_count, _maximum_slide_count
    global _agenda_requested, _active_model_type
    global _web_search_executed, _user_quantified_claims
    global _required_official_source_rules
    _generated_markdown = None
    _overflow_retry_count = 0
    _expected_slide_count = None
    _maximum_slide_count = None
    _agenda_requested = False
    _active_model_type = "sonnet"
    _web_search_executed = False
    _user_quantified_claims = set()
    _required_official_source_rules = []


@tool
def output_slide(markdown: str) -> str:
    """生成したスライドのマークダウンを出力します。スライドを作成・編集したら必ずこのツールを使って出力してください（テキストで直接書き出さない）。

    ## Marpフォーマットルール

    - フロントマター: `marp: true`, `theme: {テーマ名}`, `size: 16:9`, `paginate: true`
    - スライド区切り: `---`
    - **総枚数【最優先】**: ユーザーが枚数を指定した場合、タイトル・中タイトル・参考文献・裏表紙をすべて含めて指定枚数ちょうどにする。出力前に必ず数える
    - 1枚目はタイトルスライド（`<!-- _class: top --><!-- _paginate: skip -->`付き、テキスト中央揃え）
    - **1スライドの行数**: 見出し＋本文すべて合わせて7〜8行を目標（9行が上限、このツールが自動検証）。3〜4行で終わらせない。1行が長いと折り返しで実質2行になるため、全角24文字（半角48文字）程度に抑える
    - **絵文字は使用禁止**（自動改行でレイアウト崩れ）
    - ==ハイライト==記法は使用禁止（日本語と相性悪い）

    ## 構成テクニック

    - **アジェンダ・目次**: ユーザーが明示した場合だけ作る。短い資料へ自動追加しない
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

    violations = _check_slide_overflow(markdown) + _check_slide_structure(markdown)

    retry_limit = 4 if _active_model_type in {'kimi', 'glm'} else MAX_OVERFLOW_RETRIES
    blocking_kimi_types = {
        'slide_count',
        'slide_count_max',
        'missing_sources',
        'missing_slide_sources',
        'unlisted_slide_sources',
        'missing_official_sources',
        'non_official_slide_sources',
        'irrelevant_slide_sources',
        'unsupported_quantified_claims',
    }
    has_blocking_kimi_violation = (
        _active_model_type == 'kimi'
        and any(v['type'] in blocking_kimi_types for v in violations)
    )
    if violations and (
        _overflow_retry_count < retry_limit or has_blocking_kimi_violation
    ):
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
            elif v['type'] == 'slide_count':
                details.append(
                    f"  - 総枚数: {v['actual']}枚（指定は{v['expected']}枚）。内容を統合・分割して指定枚数ちょうどにする"
                )
            elif v['type'] == 'slide_count_max':
                details.append(
                    f"  - 総枚数: {v['actual']}枚（上限は{v['maximum']}枚）。内容を統合して上限以内にする"
                )
            elif v['type'] == 'lead_count':
                details.append(
                    f"  - 中タイトル: {v['actual']}枚（上限{v['maximum']}枚）。余分な中タイトルを本文スライドへ統合する"
                )
            elif v['type'] == 'unrequested_agenda':
                details.append(
                    f"  - アジェンダ・目次は指定されていません（該当スライド: {v['slides']}）。削除する"
                )
            elif v['type'] == 'bold_overuse':
                details.append(
                    f"  - スライド{v['slide_number']}: 太字が{v['count']}か所。太字ラベルを外し、太字は最大2か所にする"
                )
            elif v['type'] == 'pattern_repetition':
                details.append(
                    f"  - スライド{v['slide_number']}: {v['pattern']}型が3枚連続。表・小見出し・本文型のいずれかへ変更する"
                )
            elif v['type'] == 'missing_sources':
                details.append(
                    f"  - Web検索を使ったため参考文献スライドが必要。実在URLを最低{v['minimum']}件記載する（現在{v['url_count']}件）"
                )
            elif v['type'] == 'unsupported_quantified_claims':
                details.append(
                    f"  - 根拠のない数値表現: {', '.join(v['claims'])}。ユーザー入力にも検索結果にもないため削除し、定性的に言い換える"
                )
            elif v['type'] == 'missing_slide_sources':
                details.append(
                    f"  - 根拠URLコメントがない本文スライド: {v['slides']}。見出し直下に <!-- source: 検索結果URL --> を追加する"
                )
            elif v['type'] == 'unlisted_slide_sources':
                details.append(
                    "  - 本文の根拠URLが参考文献に未掲載: "
                    + ", ".join(
                        f"スライド{source['slide']}={source['url']}"
                        for source in v['sources']
                    )
                )
            elif v['type'] == 'missing_official_sources':
                details.append(
                    "  - 公式情報が参考文献にない製品: "
                    + ", ".join(v['products'])
                    + "。各ベンダーの公式ドメインを検索し、参考文献へ追加する"
                )
            elif v['type'] == 'non_official_slide_sources':
                details.append(
                    "  - 公式URLを根拠にしていない製品スライド: "
                    + ", ".join(
                        f"スライド{source['slide']}={source['product']}"
                        for source in v['sources']
                    )
                    + "。該当製品の公式URLを source コメントへ指定する"
                )
            elif v['type'] == 'irrelevant_slide_sources':
                details.append(
                    "  - 対象製品ページではない根拠URL: "
                    + ", ".join(
                        f"スライド{source['slide']}={source['url']}"
                        for source in v['sources']
                    )
                    + "。顧客事例・採用・汎用ページを外し、該当製品名を含む公式URLだけにする"
                )
        violation_details = "\n".join(details)
        return (
            f"あふれ検出または構成違反！以下の問題があります：\n"
            f"{violation_details}\n"
            f"修正してから再度 output_slide を呼んでください。"
            f"（行数超過→内容を減らすか分割。表の横幅超過→列数を減らすかセル内容を短くする）"
        )

    if violations:
        print(f"[WARN] Slide overflow: max retries exceeded, accepting with violations: {violations}")

    _generated_markdown = markdown
    _overflow_retry_count = 0
    return "スライドを出力しました。"
