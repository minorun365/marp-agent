"""スライド出力ツール（ページあふれチェック付き）"""

import math
import re
import unicodedata
from urllib.parse import urlparse

from strands import tool

from .http_request import get_url_fetched

# スライド出力用のグローバル変数
# NOTE: ContextVarはStrands Agentsがツールを別スレッドで実行するため値が共有されない
_generated_markdown: str | None = None
_overflow_retry_count: int = 0
_expected_slide_count: int | None = None
_maximum_slide_count: int | None = None
_agenda_requested: bool = False
_active_model_type: str = "grok"
_web_search_executed: bool = False
_user_quantified_claims: set[str] = set()
_required_official_source_rules: list[dict] = []
_slide_progress_message: str | None = None
# 違反ゼロで確定した後、Kimiが同じ内容でoutput_slideを呼び直すため、
# 生成1回あたりのツール呼び出しが1〜2回ぶん余計に増えていた（2026-08-19実測）。
# プロンプトの禁止だけでは守られないので、確定後の再出力はここで止める。
_slide_finalized: bool = False

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
# 2026-08-18: 1回では直りきらず、実測で全生成の54%がはみ出したまま出ていたため2回にした。
# 直しきれなかったぶんは _repair_slides_mechanically が機械で詰める。
KIMI_MAX_VALIDATION_RETRIES = 2
KIMI_RETRY_VIOLATION_TYPES = frozenset({
    'non_japanese_body',
    'line_overflow',
    'table_overflow',
    'slide_count',
    'slide_count_max',
})
KIMI_RETRY_PRIORITY = {
    'non_japanese_body': -1,
    'line_overflow': 0,
    'table_overflow': 0,
    'slide_count': 1,
    'slide_count_max': 1,
}
# 英語記事のURLを渡されると本文がそのまま英語で出てくるため、日本語率で検知する。
# 製品名・略語が多い日本語スライドを誤検知しないよう、
# 判定対象は文字数が一定以上あるスライドだけに絞る。
MIN_LETTERS_FOR_LANGUAGE_CHECK = 24
# 英語の製品名・機能名が並ぶ日本語スライド（助詞だけが日本語になる行）を
# 巻き込まないよう、閾値は「ほぼ日本語が無い」水準に置く。
MIN_JAPANESE_RATIO = 0.10
# 2026-08-19実測: border は10行でも余白が残るが、speee は10行で下端ぎりぎり、
# 12行では下端が切れる。最も狭いテーマに合わせて9行のまま据え置く。
MAX_LINES_PER_SLIDE = 9
# 1行あたりの最大表示幅（半角換算）
# 2026-08-19に全4テーマをPDFへ書き出して実測し直した値。
#   beam 全角40字OK / border・gradient 全角36字OK / speee 全角32字OK（最も狭い）
# 最も狭い speee に合わせて全角32字＝半角64とする。
# 旧値48（全角24字）は実測より3分の1ほど厳しく、全角25〜32字の行を
# 「折り返して2行」と誤って数えていた。そのため実際には余白を残して
# 収まっているスライドが「行数超過」と判定され、再生成が毎回2〜3回走っていた。
MAX_DISPLAY_WIDTH_PER_LINE = 64
# テーブル行の最大表示幅（半角換算）
# 2026-08-19実測: 表はセル内で折り返すので横にはみ出さない（旧コメントの
# 「折り返されず横にはみ出す」は誤り）。3列×1セル16字＝行全体で半角96でも
# スライド内に収まっていた。折り返した結果の高さは行数側で検出できるため、
# 横幅の判定は実測どおり96まで許容する。
MAX_TABLE_ROW_WIDTH = 96

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
    """Marpと同じ水平線ルールでスライドを分割する。"""
    lines = markdown.replace('\r\n', '\n').replace('\r', '\n').split('\n')

    # 先頭のYAMLフロントマターはスライド本文に含めない。
    if lines and re.fullmatch(r'[ \t]{0,3}---[ \t]*', lines[0]):
        for index in range(1, len(lines)):
            if re.fullmatch(r'[ \t]{0,3}(?:---|\.\.\.)[ \t]*', lines[index]):
                lines = lines[index + 1:]
                break

    slides: list[str] = []
    current_slide: list[str] = []
    fence_char: str | None = None
    fence_length = 0
    fence_pattern = re.compile(r'^[ \t]{0,3}(`{3,}|~{3,})(.*)$')
    thematic_break_pattern = re.compile(
        r'^[ \t]{0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$'
    )

    for line in lines:
        fence_match = fence_pattern.match(line)
        if fence_match:
            marker = fence_match.group(1)
            if fence_char is None:
                # バッククォートの情報文字列に同じ記号がある場合はフェンスではない。
                if marker[0] != '`' or '`' not in fence_match.group(2):
                    fence_char = marker[0]
                    fence_length = len(marker)
            elif (
                marker[0] == fence_char
                and len(marker) >= fence_length
                and not fence_match.group(2).strip()
            ):
                fence_char = None
                fence_length = 0
            current_slide.append(line)
            continue

        if fence_char is None and thematic_break_pattern.fullmatch(line):
            # 直前の通常テキストに続く連続ハイフンはSetext見出しであり、
            # Marpでもページ区切りにならない。
            previous_line = current_slide[-1] if current_slide else ''
            is_setext_heading = bool(
                re.fullmatch(r'[ \t]{0,3}-+[ \t]*', line)
                and previous_line.strip()
                and not re.match(
                    r'^[ \t]{0,3}(?:#{1,6}(?:[ \t]|$)|[-+*][ \t]+|\d+[.)][ \t]+|>|<)',
                    previous_line,
                )
            )
            if is_setext_heading:
                current_slide.append(line)
                continue

            slide = '\n'.join(current_slide).strip()
            if slide:
                slides.append(slide)
            current_slide = []
            continue

        current_slide.append(line)

    final_slide = '\n'.join(current_slide).strip()
    if final_slide:
        slides.append(final_slide)
    return slides


def _extract_frontmatter(markdown: str) -> str:
    """先頭のYAMLフロントマターを区切り行ごと取得する。"""
    normalized = markdown.replace('\r\n', '\n').replace('\r', '\n')
    lines = normalized.split('\n')
    if not lines or not re.fullmatch(r'[ \t]{0,3}---[ \t]*', lines[0]):
        return ''

    for index in range(1, len(lines)):
        if re.fullmatch(r'[ \t]{0,3}(?:---|\.\.\.)[ \t]*', lines[index]):
            return '\n'.join(lines[:index + 1]).strip()
    return ''


def _select_evenly(indices: list[int], count: int) -> list[int]:
    """先頭と末尾を含むように、指定数のインデックスを均等に選ぶ。"""
    if count <= 0:
        return []
    if count >= len(indices):
        return indices
    if count == 1:
        return [indices[len(indices) // 2]]

    last_position = len(indices) - 1
    selected_positions = [
        round(i * last_position / (count - 1)) for i in range(count)
    ]
    return [indices[position] for position in selected_positions]


def _trim_excess_slides(markdown: str, expected_count: int) -> str:
    """Kimiの過剰な本文スライドを、特殊スライドを残して指定枚数へ整える。"""
    slides = _parse_slides(markdown)
    if len(slides) <= expected_count:
        return markdown

    protected_indices = {0, len(slides) - 1}
    protected_indices.update(
        index
        for index, slide in enumerate(slides)
        if re.search(r'_class:\s*(?:top|tinytext|end)', slide)
    )
    if len(protected_indices) >= expected_count:
        return markdown

    body_indices = [
        index for index in range(len(slides)) if index not in protected_indices
    ]
    body_slots = expected_count - len(protected_indices)
    selected_indices = sorted(
        protected_indices | set(_select_evenly(body_indices, body_slots))
    )
    selected_slides = [slides[index] for index in selected_indices]
    frontmatter = _extract_frontmatter(markdown)
    content = '\n\n---\n\n'.join(selected_slides)
    return f'{frontmatter}\n\n{content}\n' if frontmatter else f'{content}\n'


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
    elif model_type in ('kimi', 'grok'):
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
        if model_type in ('kimi', 'grok')
        and any(marker.lower() in user_message.lower() for marker in rule['markers'])
    ]


def mark_web_search_executed() -> None:
    """Web検索後の出典検証を有効化する。"""
    global _web_search_executed
    _web_search_executed = True


JAPANESE_CHARACTER_PATTERN = re.compile(r'[ぁ-んァ-ヶー々〇一-龥]')
LATIN_LETTER_PATTERN = re.compile(r'[A-Za-z]')
# 「Thank you!」の裏表紙と、URLだけを並べる参考文献は日本語判定の対象外。
LANGUAGE_CHECK_EXEMPT_PATTERN = re.compile(r'_class:\s*(?:end|tinytext)')


def _extract_language_sample(slide_content: str) -> str:
    """言語判定に使う本文だけを取り出す（コード・コメント・URLを除く）。"""
    kept_lines = []
    in_code_block = False

    for line in slide_content.split('\n'):
        stripped = line.strip()

        if stripped.startswith('```'):
            in_code_block = not in_code_block
            continue
        if in_code_block or not stripped:
            continue
        if stripped.startswith('<'):
            continue  # HTMLコメント・Marpディレクティブ
        if re.fullmatch(r'\|[\s\-:|]+\|', stripped):
            continue  # 表のセパレーター行

        kept_lines.append(stripped)

    text = '\n'.join(kept_lines)
    return re.sub(r'https?://\S+', ' ', text)


def _check_slide_language(markdown: str) -> list[dict]:
    """本文が日本語で書かれているかを検証する。

    英語記事のURLを渡されたときに、記事の言語のままスライドが出てくるのを防ぐ。
    製品名・略語だけで構成された短い行を誤検知しないよう、
    文字数が MIN_LETTERS_FOR_LANGUAGE_CHECK 以上のスライドだけを見る。
    """
    non_japanese_slides = []

    for slide_number, slide in enumerate(_parse_slides(markdown), start=1):
        if LANGUAGE_CHECK_EXEMPT_PATTERN.search(slide):
            continue

        sample = _extract_language_sample(slide)
        japanese_count = len(JAPANESE_CHARACTER_PATTERN.findall(sample))
        letter_count = japanese_count + len(LATIN_LETTER_PATTERN.findall(sample))

        if letter_count < MIN_LETTERS_FOR_LANGUAGE_CHECK:
            continue
        if japanese_count / letter_count < MIN_JAPANESE_RATIO:
            non_japanese_slides.append(slide_number)

    if not non_japanese_slides:
        return []

    return [{
        'type': 'non_japanese_body',
        'slides': non_japanese_slides,
    }]


def _check_slide_structure(markdown: str) -> list[dict]:
    """指定枚数・中タイトル数・モデル固有スタイルを検証する。"""
    slides = _parse_slides(markdown)
    violations = _check_slide_language(markdown)

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

    # ユーザーが貼ったURLの本文を読んでいる場合、その記事の数値は根拠がある。
    # 検索の有無だけで判定すると、記事に書いてある割合や金額まで違反として削らせてしまう。
    if _active_model_type == 'kimi' and not _web_search_executed and not get_url_fetched():
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

    if _active_model_type in {'kimi', 'glm', 'grok'}:
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


def consume_slide_progress() -> str | None:
    """直近の検査結果をユーザー向け進捗として1回だけ取得する。"""
    global _slide_progress_message
    message = _slide_progress_message
    _slide_progress_message = None
    return message


def _format_slide_progress(violations: list[dict]) -> str:
    """詳細な内部指示を出さず、検査で確定した問題の種類だけを要約する。

    何回目の検査か・何回だけ再チェックするかは内部事情なので出さない。
    「何を見つけて、これから何をするか」だけを伝える。
    """
    violation_types = {violation['type'] for violation in violations}
    categories = []

    if 'non_japanese_body' in violation_types:
        categories.append('本文が日本語になっていない箇所')
    if violation_types & {'line_overflow', 'table_overflow'}:
        categories.append('文字や表のはみ出し')
    if violation_types & {
        'slide_count',
        'slide_count_max',
        'lead_count',
        'unrequested_agenda',
    }:
        categories.append('枚数・構成のずれ')
    if violation_types & {
        'missing_sources',
        'missing_slide_sources',
        'unlisted_slide_sources',
        'missing_official_sources',
        'non_official_slide_sources',
        'irrelevant_slide_sources',
        'unsupported_quantified_claims',
    }:
        categories.append('出典・根拠の不足')
    if violation_types & {'bold_overuse', 'pattern_repetition'}:
        categories.append('見せ方の偏り')

    summary = '、'.join(categories) if categories else '調整が必要な箇所'
    return f'{summary}を検知したので、スライドを修正します'


SPECIAL_SLIDE_PATTERN = re.compile(r'_class:\s*(?:top|lead|end|tinytext)')
SENTENCE_BOUNDARY_PATTERN = re.compile(r'(?<=[。！？])')
CLAUSE_BOUNDARY_PATTERN = re.compile(r'(?<=[、])')
MAX_BOLD_PER_SLIDE = 2
# 機械修正で必ず残す本文要素の数（これを下回るまで削らない）
MIN_BODY_ELEMENTS = 2


def _is_special_slide(slide: str) -> bool:
    """タイトル・中タイトル・参考文献・裏表紙かを判定する。"""
    return bool(SPECIAL_SLIDE_PATTERN.search(slide))


def _shorten_to_width(text: str, max_width: int) -> str:
    """表示幅が max_width 以内へ収まるよう、末尾を落として詰める。

    日本語が壊れにくい順に3段階で試す。
    1. 文（。！？）の区切りで落とす
    2. 読点（、）の区切りで落として、末尾の読点を削る
    3. どちらの区切りも無い長文は、文字単位で切って「…」を付ける
    """
    if _get_display_width(_strip_markdown_formatting(text)) <= max_width:
        return text

    for pattern, trailing in ((SENTENCE_BOUNDARY_PATTERN, ''), (CLAUSE_BOUNDARY_PATTERN, '、')):
        parts = [part for part in pattern.split(text) if part]
        while len(parts) > 1:
            parts.pop()
            candidate = ''.join(parts).rstrip()
            if trailing:
                candidate = candidate.rstrip(trailing)
            if _get_display_width(_strip_markdown_formatting(candidate)) <= max_width:
                return candidate

    # 区切りが無い長文。切り詰めた事実が読み手に分かるよう省略記号を残す。
    ellipsis_width = _get_display_width('…')
    truncated = text
    while (
        len(truncated) > 1
        and _get_display_width(_strip_markdown_formatting(truncated)) + ellipsis_width > max_width
    ):
        truncated = truncated[:-1]
    return f'{truncated.rstrip()}…' if truncated.strip() else text


def _reduce_bold(slide: str) -> str:
    """1スライドの太字を MAX_BOLD_PER_SLIDE 箇所までへ機械的に減らす。

    先頭から数えて上限を超えたものを平文に戻す。最初に出る強調ほど
    そのスライドの主題に近いという前提で、後ろから外す。
    """
    matches = list(re.finditer(r'\*\*(.+?)\*\*', slide))
    if len(matches) <= MAX_BOLD_PER_SLIDE:
        return slide

    result = []
    cursor = 0
    for index, match in enumerate(matches):
        result.append(slide[cursor:match.start()])
        if index < MAX_BOLD_PER_SLIDE:
            result.append(match.group(0))
        else:
            result.append(match.group(1))
        cursor = match.end()
    result.append(slide[cursor:])
    return ''.join(result)


def _shrink_table_rows(slide: str) -> str:
    """表の横幅超過を、セル内容の切り詰めで解消する。

    列を減らすと表の意味が変わるため、幅の広いセルから削る。
    """
    lines = slide.split('\n')
    if not any(
        line.strip().startswith('|') and line.strip().endswith('|')
        for line in lines
    ):
        return slide

    for _ in range(6):
        if _check_table_width('\n'.join(lines)) == 0:
            break
        widest_cell_width = 0
        target = None
        for line_index, line in enumerate(lines):
            stripped = line.strip()
            if not (stripped.startswith('|') and stripped.endswith('|')):
                continue
            if re.match(r'^\|[\s\-:|]+\|$', stripped):
                continue
            if _get_display_width(stripped) <= MAX_TABLE_ROW_WIDTH:
                continue
            cells = stripped.strip('|').split('|')
            for cell_index, cell in enumerate(cells):
                width = _get_display_width(cell.strip())
                if width > widest_cell_width:
                    widest_cell_width = width
                    target = (line_index, cell_index)
        if target is None:
            break
        line_index, cell_index = target
        cells = lines[line_index].strip().strip('|').split('|')
        cell = cells[cell_index].strip()
        # 表示幅で2割ずつ詰める（全角1文字＝幅2なので偶数へ丸める）
        budget = max(8, (widest_cell_width * 4 // 5) // 2 * 2)
        shortened = _shorten_to_width(cell, budget)
        if shortened == cell:
            trimmed = cell
            while _get_display_width(trimmed) > budget and len(trimmed) > 1:
                trimmed = trimmed[:-1]
            shortened = trimmed
        if shortened == cell:
            break
        cells[cell_index] = f' {shortened} '
        lines[line_index] = '|' + '|'.join(cells) + '|'

    return '\n'.join(lines)


def _shrink_slide_lines(slide: str) -> str:
    """行数超過を、長い行の短縮と末尾要素の削除で解消する。

    見出し・HTMLコメント（_class や source）は保持する。
    """
    if _count_content_lines(slide) <= MAX_LINES_PER_SLIDE:
        return slide

    lines = slide.split('\n')

    def is_protected(line: str) -> bool:
        stripped = line.strip()
        return (
            not stripped
            or stripped.startswith('#')
            or bool(re.match(r'^<!--.*-->$', stripped))
            or stripped.startswith('```')
        )

    # 1. 折り返している行を1行分の幅へ短縮する
    for index, line in enumerate(lines):
        if _count_content_lines('\n'.join(lines)) <= MAX_LINES_PER_SLIDE:
            break
        stripped = line.strip()
        if is_protected(line) or _estimate_visual_lines(stripped) <= 1:
            continue
        marker_match = re.match(r'^(\s*(?:[-*+]|\d+[.)])\s+)(.*)$', line)
        if marker_match:
            prefix, body = marker_match.group(1), marker_match.group(2)
            marker_width = _get_display_width(prefix)
            shortened = _shorten_to_width(body, MAX_DISPLAY_WIDTH_PER_LINE - marker_width)
            if shortened != body:
                lines[index] = prefix + shortened
        else:
            shortened = _shorten_to_width(line, MAX_DISPLAY_WIDTH_PER_LINE)
            if shortened != line:
                lines[index] = shortened

    # 2. まだ超えていれば、末尾の本文要素から落とす
    while _count_content_lines('\n'.join(lines)) > MAX_LINES_PER_SLIDE:
        removable = [
            index
            for index, line in enumerate(lines)
            if line.strip() and not is_protected(line)
        ]
        if len(removable) <= MIN_BODY_ELEMENTS:
            break
        lines.pop(removable[-1])

    return '\n'.join(line for line in lines).strip()


def _summarize_outline(markdown: str) -> list[str]:
    """各スライドの種別と見出しを1行ずつ並べる。

    枚数違反のとき、どこを統合・分割すればよいかをモデルが選べるようにする。
    """
    lines = []
    for index, slide in enumerate(_parse_slides(markdown), start=1):
        heading = re.search(r'^#{1,3}\s+(.+)$', slide, re.MULTILINE)
        title = heading.group(1).strip() if heading else '(見出しなし)'
        if re.search(r'_class:\s*top', slide):
            kind = 'タイトル'
        elif re.search(r'_class:\s*lead', slide):
            kind = '中タイトル'
        elif re.search(r'_class:\s*end', slide):
            kind = '裏表紙'
        elif re.search(r'_class:\s*tinytext', slide):
            kind = '参考文献'
        else:
            kind = '本文'
        lines.append(f"{index}. [{kind}] {title[:34]}")
    return lines


def _repair_table_separators(markdown: str) -> str:
    """ヘッダー行の直下に区切り行が無い表へ、区切り行を補う。

    Markdownの表は `| --- | --- |` の区切り行が無いと表として描画されず、
    パイプ付きの文字列がそのまま画面へ出る。モデルによっては数回に1回抜けるので、
    出力を受け取った時点で確定的に直す。行数・表幅の検査は区切り行を除外して
    数えているため、補っても判定結果は変わらない。
    """
    lines = markdown.replace('\r\n', '\n').replace('\r', '\n').split('\n')
    repaired: list[str] = []
    inside_code_block = False
    previous_is_row = False

    for index, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('```') or stripped.startswith('~~~'):
            inside_code_block = not inside_code_block
        is_row = (
            not inside_code_block
            and len(stripped) > 1
            and stripped.startswith('|')
            and stripped.endswith('|')
        )
        repaired.append(line)

        if is_row and not previous_is_row:
            next_line = lines[index + 1].strip() if index + 1 < len(lines) else ''
            if not re.match(r'^\|[\s\-:|]+\|$', next_line):
                column_count = len(stripped.strip('|').split('|'))
                repaired.append('|' + '|'.join([' --- '] * column_count) + '|')

        previous_is_row = is_row

    return '\n'.join(repaired)


def _repair_slides_mechanically(markdown: str) -> str:
    """LLMが直しきれなかった違反を、機械で確定的に解消する。

    行数・表幅・太字はどれも計算で判定できるので、再生成を待たずにここで詰める。
    内容は多少減るが、はみ出したスライドがそのまま利用者へ届くよりはよい。
    """
    slides = _parse_slides(markdown)
    if not slides:
        return markdown

    repaired = []
    for slide in slides:
        if _is_special_slide(slide):
            repaired.append(slide)
            continue
        fixed = _reduce_bold(slide)
        fixed = _shrink_table_rows(fixed)
        fixed = _shrink_slide_lines(fixed)
        repaired.append(fixed)

    if repaired == slides:
        return markdown

    frontmatter = _extract_frontmatter(markdown)
    content = '\n\n---\n\n'.join(repaired)
    return f'{frontmatter}\n\n{content}\n' if frontmatter else f'{content}\n'


def reset_generated_markdown() -> None:
    """マークダウンをリセット"""
    global _generated_markdown, _overflow_retry_count
    global _expected_slide_count, _maximum_slide_count
    global _agenda_requested, _active_model_type
    global _web_search_executed, _user_quantified_claims
    global _required_official_source_rules
    global _slide_progress_message, _slide_finalized
    _generated_markdown = None
    _slide_finalized = False
    _overflow_retry_count = 0
    _expected_slide_count = None
    _maximum_slide_count = None
    _agenda_requested = False
    _active_model_type = "grok"
    _web_search_executed = False
    _user_quantified_claims = set()
    _required_official_source_rules = []
    _slide_progress_message = None


@tool
def output_slide(markdown: str) -> str:
    """生成したスライドのマークダウンを出力します。スライドを作成・編集したら必ずこのツールを使って出力してください（テキストで直接書き出さない）。

    ## Marpフォーマットルール

    - **言語【最優先】**: 見出し・本文・表・図の説明はすべて日本語で書く。参考資料やユーザーが貼ったURLの記事が英語でも、内容を日本語へ訳して載せる（製品名・サービス名・引用URLは原語のまま。このツールが自動検証）
    - フロントマター: `marp: true`, `theme: {テーマ名}`, `size: 16:9`, `paginate: true`
    - スライド区切り: `---`
    - **総枚数【最優先】**: ユーザーが枚数を指定した場合、タイトル・中タイトル・参考文献・裏表紙をすべて含めて指定枚数ちょうどにする。出力前に必ず数える
    - 1枚目はタイトルスライド（`<!-- _class: top --><!-- _paginate: skip -->`付き、テキスト中央揃え）
    - **1スライドの行数**: 見出し＋本文すべて合わせて9行が上限（このツールが自動検証）
    - **行数の数え方【重要】**: 1行は全角32文字を超えると2行として数える。文字数を切り詰めて1行に収めようとせず、要素の数で収める（見出しを除いて5つまでが目安）
    - **絵文字は使用禁止**（自動改行でレイアウト崩れ）
    - ==ハイライト==記法は使用禁止（日本語と相性悪い）

    ## スライドの種類（Marpのクラス指定）

    - **見出しの階層【重要】**: タイトルスライドと中タイトル（`_class: lead`）の主題だけが `#`。通常スライドの見出しは `##`、小見出しは必要なときだけ `###`。テーマは `#` をタイトル用の大きさで描くので、通常スライドで使うと文字がはみ出す
    - **アジェンダ・目次**: ユーザーが明示した場合だけ作る。短い資料へ自動追加しない
    - **セクション区切り**: 8枚以下では作らない。10枚以上なら3〜5枚ごとに `<!-- _class: lead -->` の中タイトルスライドを挟む（12枚以下では最大2枚）
    - **1枚の形【重要】**: 箇条書きだけを続けない。比較・一覧・対応関係は表、定義や引用は `> 引用`、要点は太字を使い分ける。同じ形が3枚続かないようにする（このツールが自動検証）。どう書くかはページの中身しだいで、決まった型に当てはめない
    - **出典スライド**: Web検索時は最後に `<!-- _class: tinytext -->` 付きの参考文献スライドを追加
    - **裏表紙【必須】**: 最後のスライドは `<!-- _class: end --><!-- _paginate: skip -->` を付けて「Thank you!」とだけ表示
    - **表【重要】**: ヘッダー行の直後に `| --- | --- | --- |` の区切り行を必ず置く。無いと表として描画されない。2〜3列にし、セル内容は全角10文字以内（横幅はこのツールが自動検証）
    - **コロン**: 日本語テキストで使う場合は半角（:）ではなく全角（：）にする

    ## 出力後のふるまい

    - 出力完了後は一切喋らない。内容の説明・要約・確認メッセージは全て不要
    - ページあふれ修正時は「○ページ目の文字量がはみ出していたため、内容を調整します」のように、何が起きて何をするか分かりやすく伝える

    Args:
        markdown: Marp形式のマークダウン全文（フロントマターを含む）

    Returns:
        出力完了メッセージ（行数超過時はエラーメッセージ）
    """
    global _generated_markdown, _overflow_retry_count, _slide_progress_message
    global _slide_finalized

    if _slide_finalized:
        # 同じ依頼の中で確定済み。作り直しても内容は良くならないので受け付けない。
        return "スライドは出力済みです。同じ依頼の中で呼び直す必要はありません。"

    # 表の区切り行の欠落は、モデルへ指摘して直させるより先に機械で補う。
    markdown = _repair_table_separators(markdown)

    violations = _check_slide_overflow(markdown) + _check_slide_structure(markdown)

    if _active_model_type == 'kimi':
        # Kimiは軽微な見た目の指摘でも全文を作り直しやすい。再生成は
        # 実際のはみ出し・総枚数だけに限定し、初回後の修正は1回にする。
        # 参考文献や根拠の不足は警告に留め、再生成理由にはしない。
        retry_limit = KIMI_MAX_VALIDATION_RETRIES
        retry_violations = sorted(
            (
                violation
                for violation in violations
                if violation['type'] in KIMI_RETRY_VIOLATION_TYPES
            ),
            key=lambda violation: KIMI_RETRY_PRIORITY[violation['type']],
        )
    else:
        retry_limit = 4 if _active_model_type == 'glm' else MAX_OVERFLOW_RETRIES
        retry_violations = violations

    if retry_violations and _overflow_retry_count < retry_limit:
        _overflow_retry_count += 1
        _slide_progress_message = _format_slide_progress(retry_violations)
        details = []
        for v in retry_violations:
            if v['type'] == 'non_japanese_body':
                details.append(
                    f"  - 本文が日本語になっていないスライド: {v['slides']}。"
                    "参考資料が英語でも、スライドの見出し・本文・表はすべて日本語で書く"
                    "（製品名・サービス名・URLは原語のまま）"
                )
            elif v['type'] == 'line_overflow':
                details.append(
                    f"  - スライド{v['slide_number']}: 実質{v['line_count']}行（{v['excess']}行超過）"
                )
            elif v['type'] == 'table_overflow':
                details.append(
                    f"  - スライド{v['slide_number']}: 表の横幅超過（{v['max_width']}文字、上限{MAX_TABLE_ROW_WIDTH}文字）"
                )
            elif v['type'] == 'slide_count':
                difference = v['actual'] - v['expected']
                if difference > 0:
                    instruction = (
                        f"{difference}枚多い。隣り合う本文スライドを{difference}組"
                        "統合して減らす（表紙・裏表紙・参考文献は減らさない）"
                    )
                else:
                    instruction = (
                        f"{-difference}枚少ない。本文スライドのうち内容が多いものを"
                        f"{-difference}枚分割して増やす（内容の薄いページを足さない）"
                    )
                details.append(
                    f"  - 総枚数: {v['actual']}枚（指定は{v['expected']}枚）。{instruction}"
                )
                outline = _summarize_outline(markdown)
                if outline:
                    details.append("    現在の構成:")
                    details.extend(f"      {line}" for line in outline)
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
        language_is_broken = any(
            violation['type'] == 'non_japanese_body'
            for violation in retry_violations
        )
        overflow_is_present = any(
            violation['type'] in {'line_overflow', 'table_overflow'}
            for violation in retry_violations
        )
        if language_is_broken:
            priority_instruction = (
                "【最優先】スライド全体を日本語へ書き直してください。"
                "英語の資料を読んだ場合も、内容を日本語へ訳してスライドへ載せます。\n"
            )
        elif overflow_is_present:
            priority_instruction = (
                "【最優先】はみ出しをこの1回の修正で完全に解消してください。"
                "該当スライドの文章を削るか短くし、新しい説明・数値・出典は追加しないでください。\n"
            )
        else:
            priority_instruction = ""
        return (
            f"あふれ検出または構成違反！以下の問題があります：\n"
            f"{priority_instruction}"
            f"{violation_details}\n"
            f"修正してから再度 output_slide を呼んでください。"
            f"（行数超過→内容を減らすか分割。表の横幅超過→列数を減らすかセル内容を短くする）"
        )

    if (
        _active_model_type == 'kimi'
        and _expected_slide_count is not None
        and any(violation['type'] == 'slide_count' for violation in violations)
    ):
        normalized_markdown = _trim_excess_slides(markdown, _expected_slide_count)
        if normalized_markdown != markdown:
            markdown = normalized_markdown
            violations = _check_slide_overflow(markdown) + _check_slide_structure(markdown)

    if violations:
        print(f"[WARN] Slide overflow: max retries exceeded, repairing mechanically: {violations}")
        markdown = _repair_slides_mechanically(markdown)
        violations = _check_slide_overflow(markdown) + _check_slide_structure(markdown)
        if violations:
            print(f"[WARN] Violations remaining after mechanical repair: {violations}")
        else:
            print("[INFO] Mechanical repair resolved all violations")

    _generated_markdown = markdown
    _overflow_retry_count = 0
    _slide_finalized = True
    return "スライドを出力しました。"
