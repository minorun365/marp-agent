"""output_slide ツールのユニットテスト"""
import pytest

from tools.output_slide import (
    configure_slide_validation,
    mark_web_search_executed,
    output_slide,
    get_generated_markdown,
    reset_generated_markdown,
    _parse_slides,
    _count_content_lines,
    _check_slide_overflow,
    _get_display_width,
    _strip_markdown_formatting,
    _estimate_visual_lines,
    MAX_LINES_PER_SLIDE,
    MAX_DISPLAY_WIDTH_PER_LINE,
)


def test_output_slide_stores_markdown():
    """output_slideがマークダウンを保存する"""
    reset_generated_markdown()
    markdown = "---\nmarp: true\n---\n# テスト"

    result = output_slide(markdown=markdown)

    assert result == "スライドを出力しました。"
    assert get_generated_markdown() == markdown


def test_get_generated_markdown_initial_none():
    """初期状態ではNone"""
    reset_generated_markdown()
    assert get_generated_markdown() is None


def test_reset_generated_markdown():
    """リセット後はNoneに戻る"""
    output_slide(markdown="# test")
    reset_generated_markdown()
    assert get_generated_markdown() is None


def test_output_slide_overwrites():
    """連続呼び出しで最新のマークダウンが保持される"""
    reset_generated_markdown()
    output_slide(markdown="# first")
    output_slide(markdown="# second")
    assert get_generated_markdown() == "# second"


# --- 表示幅計算テスト ---


class TestGetDisplayWidth:
    """_get_display_width のテスト"""

    def test_ascii_only(self):
        """半角英数字のみ"""
        assert _get_display_width("Hello") == 5

    def test_fullwidth_only(self):
        """全角文字のみ"""
        assert _get_display_width("こんにちは") == 10

    def test_mixed(self):
        """全角・半角混在"""
        # "ABC" = 3, "あいう" = 6 → 合計9
        assert _get_display_width("ABCあいう") == 9

    def test_real_world_long_line(self):
        """実際にはみ出した長い日本語スライド行（装飾除去後）"""
        text = "2022年設立、企業グループのDX推進専門会社（母体は2016年発足の事業組織）"
        width = _get_display_width(text)
        # 半角48を超えるはず
        assert width > MAX_DISPLAY_WIDTH_PER_LINE

    def test_short_bullet(self):
        """短い箇条書き（折り返し不要）"""
        text = "短い項目"
        width = _get_display_width(text)
        assert width <= MAX_DISPLAY_WIDTH_PER_LINE


class TestStripMarkdownFormatting:
    """_strip_markdown_formatting のテスト"""

    def test_bold(self):
        """太字の除去"""
        assert _strip_markdown_formatting("**太字**テスト") == "太字テスト"

    def test_italic(self):
        """斜体の除去"""
        assert _strip_markdown_formatting("*斜体*テスト") == "斜体テスト"

    def test_bullet_marker(self):
        """箇条書きマーカーの除去"""
        assert _strip_markdown_formatting("- 箇条書き") == "箇条書き"

    def test_heading(self):
        """見出しマーカーの除去"""
        assert _strip_markdown_formatting("## 見出し") == "見出し"

    def test_link(self):
        """リンクのURL除去"""
        assert _strip_markdown_formatting("[テキスト](https://example.com)") == "テキスト"

    def test_inline_code(self):
        """インラインコードのバッククォート除去"""
        assert _strip_markdown_formatting("`code`テスト") == "codeテスト"

    def test_combined(self):
        """複合装飾"""
        result = _strip_markdown_formatting("- **2022年設立**、企業グループ")
        assert result == "2022年設立、企業グループ"

    def test_quote(self):
        """引用マーカーの除去"""
        assert _strip_markdown_formatting("> 引用テキスト") == "引用テキスト"


class TestEstimateVisualLines:
    """_estimate_visual_lines のテスト"""

    def test_short_line(self):
        """短い行は1行"""
        assert _estimate_visual_lines("- 短い項目") == 1

    def test_long_japanese_line(self):
        """長い日本語行は折り返しで2行以上"""
        long_text = "- **2022年設立**、企業グループのDX推進専門会社（母体は2016年発足の事業組織）"
        assert _estimate_visual_lines(long_text) >= 2

    def test_table_row_no_wrap(self):
        """テーブル行は折り返し計算対象外（常に1行）"""
        assert _estimate_visual_lines("| 長い長い長い長い長い長い長い長いテキスト | 長い長い長い長い長い長い長い長いテキスト |") == 1

    def test_heading_short(self):
        """短い見出しは1行"""
        assert _estimate_visual_lines("## 短い見出し") == 1


# --- ページあふれチェック関連テスト ---


class TestParseSlides:
    """_parse_slides のテスト"""

    def test_basic_slides(self):
        """フロントマター付きの基本的なスライド分割"""
        md = "---\nmarp: true\ntheme: border\n---\n\n## Slide 1\n\n- Item 1\n\n---\n\n## Slide 2\n\n- Item 2"
        slides = _parse_slides(md)
        assert len(slides) == 2
        assert "Slide 1" in slides[0]
        assert "Slide 2" in slides[1]

    def test_no_frontmatter(self):
        """フロントマターなしのマークダウン"""
        md = "## Slide 1\n\n- Item 1\n\n---\n\n## Slide 2"
        slides = _parse_slides(md)
        assert len(slides) >= 1

    def test_empty_markdown(self):
        """空のマークダウン"""
        slides = _parse_slides("")
        assert slides == []


class TestCountContentLines:
    """_count_content_lines のテスト"""

    def test_basic_content(self):
        """見出し+箇条書きの基本カウント（短い行）"""
        content = "## タイトル\n\n- 項目1\n- 項目2\n- 項目3"
        assert _count_content_lines(content) == 4

    def test_skip_empty_lines(self):
        """空行はカウントしない"""
        content = "## タイトル\n\n\n\n- 項目1"
        assert _count_content_lines(content) == 2

    def test_skip_html_comments(self):
        """HTMLコメントはカウントしない"""
        content = "<!-- _class: lead -->\n## タイトル\n- 項目1"
        assert _count_content_lines(content) == 2

    def test_skip_table_separator(self):
        """表のセパレーター行はカウントしない"""
        content = "## 比較表\n\n| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |"
        # 見出し(1) + ヘッダー(1) + データ行2つ(2) = 4（セパレーターはスキップ）
        assert _count_content_lines(content) == 4

    def test_code_block_lines_counted(self):
        """コードブロック内の行はカウントする"""
        content = "## コード例\n\n```python\nprint('hello')\nprint('world')\n```"
        # 見出し(1) + コード2行(2) = 3（```マーカーはスキップ）
        assert _count_content_lines(content) == 3

    def test_code_block_markers_not_counted(self):
        """```マーカー自体はカウントしない"""
        content = "```\nline1\n```"
        assert _count_content_lines(content) == 1

    def test_nine_lines_exactly(self):
        """ちょうど9行のスライド（短い行）"""
        lines = ["## 見出し"] + [f"- 項目{i}" for i in range(1, 9)]
        content = "\n".join(lines)
        assert _count_content_lines(content) == 9

    def test_quote_block(self):
        """引用ブロックの行もカウント"""
        content = "## 引用\n\n> 引用文1\n> 引用文2"
        assert _count_content_lines(content) == 3

    def test_table_with_alignment(self):
        """アライメント付き表セパレーターもスキップ"""
        content = "| Left | Center | Right |\n|:-----|:------:|------:|\n| a | b | c |"
        # ヘッダー(1) + データ行(1) = 2（セパレーターはスキップ）
        assert _count_content_lines(content) == 2

    def test_long_line_counts_as_multiple(self):
        """長い行は折り返しで複数行としてカウント"""
        # 7行だが、各行が長くて折り返しが入るケース
        long_bullet = "- **2022年設立**、企業グループのDX推進専門会社（母体は2016年発足の事業組織）"
        content = f"## DX支援会社とは\n\n{long_bullet}\n- 短い項目\n- 短い項目2"
        line_count = _count_content_lines(content)
        # 見出し(1) + 長い行(2) + 短い行(1) + 短い行(1) = 5
        assert line_count > 4  # 折り返しで4行より多くなるはず


class TestCheckSlideOverflow:
    """_check_slide_overflow のテスト"""

    def test_no_overflow(self):
        """全スライド9行以内 → 違反なし"""
        md = "---\nmarp: true\n---\n\n## Slide 1\n\n- Item 1\n- Item 2\n\n---\n\n## Slide 2\n\n- Item 1"
        violations = _check_slide_overflow(md)
        assert violations == []

    def test_overflow_detected(self):
        """10行のスライド → 違反検出"""
        lines = ["## 見出し"] + [f"- 項目{i}" for i in range(1, 10)]  # 10行
        slide_content = "\n".join(lines)
        md = f"---\nmarp: true\n---\n\n{slide_content}"
        violations = _check_slide_overflow(md)
        assert len(violations) == 1
        assert violations[0]['line_count'] == 10
        assert violations[0]['excess'] == 1

    def test_overflow_by_long_lines(self):
        """行数は少ないが長い行の折り返しで超過するケース"""
        content = "\n".join([
            "## DX支援会社とは？",
            "",
            "> TRANSFORM YOUR BUSINESS",
            "",
            "- **2022年設立**、企業グループのDX推進専門会社（母体は2016年発足の事業組織）",
            "- 全社員がアジャイル認定資格を保有、経営層を含む全員がスクラムの実践者",
            "- 「サービスデザイン」「アジャイル開発」「クラウドネイティブ」の3本柱でDXを一貫支援",
            "- 開発期間1/2・コスト1/3を実現した実績（エネルギー系アプリ開発事例）",
            "- 高輪ゲートウェイシティ都市OS開発など、社会インフラ規模のプロジェクトも担う",
        ])
        md = f"---\nmarp: true\n---\n\n{content}"
        violations = _check_slide_overflow(md)
        # 折り返し考慮で9行を超えるはず
        assert len(violations) == 1
        assert violations[0]['line_count'] > MAX_LINES_PER_SLIDE

    def test_skip_top_slide(self):
        """タイトルスライド（_class: top）はスキップ"""
        lines = ["<!-- _class: top -->", "## タイトル"] + [f"- 項目{i}" for i in range(1, 15)]
        slide_content = "\n".join(lines)
        md = f"---\nmarp: true\n---\n\n{slide_content}"
        violations = _check_slide_overflow(md)
        assert violations == []

    def test_skip_lead_slide(self):
        """セクション区切り（_class: lead）はスキップ"""
        lines = ["<!-- _class: lead -->", "## セクション"] + [f"- 項目{i}" for i in range(1, 15)]
        slide_content = "\n".join(lines)
        md = f"---\nmarp: true\n---\n\n{slide_content}"
        violations = _check_slide_overflow(md)
        assert violations == []

    def test_skip_end_slide(self):
        """裏表紙（_class: end）はスキップ"""
        slide_content = "<!-- _class: end -->\n## Thank you!\n" + "\n".join(f"- {i}" for i in range(15))
        md = f"---\nmarp: true\n---\n\n{slide_content}"
        violations = _check_slide_overflow(md)
        assert violations == []

    def test_skip_tinytext_slide(self):
        """参考文献（_class: tinytext）はスキップ"""
        lines = ["<!-- _class: tinytext -->", "## 参考文献"] + [f"- https://example.com/{i}" for i in range(15)]
        slide_content = "\n".join(lines)
        md = f"---\nmarp: true\n---\n\n{slide_content}"
        violations = _check_slide_overflow(md)
        assert violations == []

    def test_multiple_violations(self):
        """複数スライドが超過"""
        slide1 = "\n".join(["## S1"] + [f"- 項目{i}" for i in range(1, 11)])  # 11行
        slide2 = "\n".join(["## S2"] + [f"- 項目{i}" for i in range(1, 12)])  # 12行
        md = f"---\nmarp: true\n---\n\n{slide1}\n\n---\n\n{slide2}"
        violations = _check_slide_overflow(md)
        assert len(violations) == 2


class TestOutputSlideOverflowValidation:
    """output_slide のバリデーション統合テスト"""

    def test_valid_slide_accepted(self):
        """9行以内のスライドは正常出力"""
        reset_generated_markdown()
        md = "---\nmarp: true\n---\n\n## Title\n\n- Item 1\n- Item 2\n- Item 3"
        result = output_slide(markdown=md)
        assert result == "スライドを出力しました。"
        assert get_generated_markdown() == md

    def test_overflow_rejected_first_time(self):
        """超過スライドは1回目リジェクト"""
        reset_generated_markdown()
        lines = ["## 見出し"] + [f"- 項目{i}" for i in range(1, 11)]  # 11行
        slide_content = "\n".join(lines)
        md = f"---\nmarp: true\n---\n\n{slide_content}"

        result = output_slide(markdown=md)
        assert "あふれ検出" in result
        assert get_generated_markdown() is None

    def test_overflow_rejected_second_time(self):
        """2回目もリジェクト"""
        reset_generated_markdown()
        lines = ["## 見出し"] + [f"- 項目{i}" for i in range(1, 11)]
        slide_content = "\n".join(lines)
        md = f"---\nmarp: true\n---\n\n{slide_content}"

        output_slide(markdown=md)  # 1回目
        result = output_slide(markdown=md)  # 2回目
        assert "あふれ検出" in result
        assert get_generated_markdown() is None

    def test_overflow_accepted_after_max_retries(self):
        """3回目は警告付きで受け入れ"""
        reset_generated_markdown()
        lines = ["## 見出し"] + [f"- 項目{i}" for i in range(1, 11)]
        slide_content = "\n".join(lines)
        md = f"---\nmarp: true\n---\n\n{slide_content}"

        output_slide(markdown=md)  # 1回目リジェクト
        output_slide(markdown=md)  # 2回目リジェクト
        result = output_slide(markdown=md)  # 3回目は受入
        assert result == "スライドを出力しました。"
        assert get_generated_markdown() == md

    def test_retry_counter_resets_on_success(self):
        """正常出力後にリトライカウンターがリセットされる"""
        reset_generated_markdown()
        valid_md = "---\nmarp: true\n---\n\n## Title\n\n- Item 1"
        output_slide(markdown=valid_md)  # 正常出力（カウンターリセット）

        # 次の超過スライドは1回目としてリジェクトされるはず
        lines = ["## 見出し"] + [f"- 項目{i}" for i in range(1, 11)]
        overflow_md = f"---\nmarp: true\n---\n\n" + "\n".join(lines)
        result = output_slide(markdown=overflow_md)
        assert "あふれ検出" in result

    def test_retry_counter_resets_on_reset(self):
        """reset_generated_markdown でリトライカウンターもリセット"""
        reset_generated_markdown()
        lines = ["## 見出し"] + [f"- 項目{i}" for i in range(1, 11)]
        md = f"---\nmarp: true\n---\n\n" + "\n".join(lines)

        output_slide(markdown=md)  # 1回目リジェクト
        output_slide(markdown=md)  # 2回目リジェクト

        reset_generated_markdown()  # リセット

        # リセット後は1回目リジェクトとして扱われる（受入ではない）
        result = output_slide(markdown=md)
        assert "あふれ検出" in result

    def test_long_lines_overflow_rejected(self):
        """折り返しによる超過もリジェクトされる"""
        reset_generated_markdown()
        content = "\n".join([
            "## DX支援会社とは？",
            "",
            "> TRANSFORM YOUR BUSINESS",
            "",
            "- **2022年設立**、企業グループのDX推進専門会社（母体は2016年発足の事業組織）",
            "- 全社員がアジャイル認定資格を保有、経営層を含む全員がスクラムの実践者",
            "- 「サービスデザイン」「アジャイル開発」「クラウドネイティブ」の3本柱でDXを一貫支援",
            "- 開発期間1/2・コスト1/3を実現した実績（エネルギー系アプリ開発事例）",
            "- 高輪ゲートウェイシティ都市OS開発など、社会インフラ規模のプロジェクトも担う",
        ])
        md = f"---\nmarp: true\n---\n\n{content}"
        result = output_slide(markdown=md)
        assert "あふれ検出" in result


class TestOutputSlideStructureValidation:
    def test_rejects_wrong_requested_slide_count(self):
        reset_generated_markdown()
        configure_slide_validation("タイトル込み10枚で作って", "kimi")
        slides = [f"## スライド{i}\n\n- 項目" for i in range(1, 12)]
        md = "---\nmarp: true\n---\n" + "\n---\n".join(slides)

        result = output_slide(markdown=md)

        assert "11枚（指定は10枚）" in result
        assert get_generated_markdown() is None

    def test_kimi_limits_unspecified_count_to_twenty_slides(self):
        reset_generated_markdown()
        configure_slide_validation("AWS AgentCore", "kimi")
        slides = [f"## スライド{i}\n\n- 項目" for i in range(1, 22)]
        md = "---\nmarp: true\n---\n" + "\n---\n".join(slides)

        result = output_slide(markdown=md)

        assert "21枚（上限は20枚）" in result
        assert get_generated_markdown() is None

    def test_sol_keeps_ten_slide_limit_when_count_is_unspecified(self):
        reset_generated_markdown()
        configure_slide_validation("AWS AgentCore", "sol")
        slides = [f"## スライド{i}\n\n- 項目" for i in range(1, 12)]
        md = "---\nmarp: true\n---\n" + "\n---\n".join(slides)

        result = output_slide(markdown=md)

        assert "11枚（上限は10枚）" in result
        assert get_generated_markdown() is None

    @pytest.mark.parametrize("model_type", ["kimi", "sol"])
    def test_non_sonnet_models_accept_nine_slides_when_count_is_unspecified(self, model_type):
        reset_generated_markdown()
        configure_slide_validation("AWS AgentCore", model_type)
        slides = [
            f"## スライド{i}\n\n- 項目1\n- 項目2\n- 項目3"
            if i % 2 == 0
            else f"## スライド{i}\n\n本文"
            for i in range(1, 10)
        ]
        md = "---\nmarp: true\n---\n" + "\n---\n".join(slides)

        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"

    def test_sonnet_keeps_slide_count_flexible_when_unspecified(self):
        reset_generated_markdown()
        configure_slide_validation("AWS AgentCore", "sonnet")
        md = "---\nmarp: true\n---\n## 1枚だけ"

        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"

    def test_rejects_unrequested_agenda(self):
        reset_generated_markdown()
        configure_slide_validation("提案資料を作って", "kimi")
        md = "---\nmarp: true\n---\n## 本日のアジェンダ\n\n- 項目"

        result = output_slide(markdown=md)

        assert "アジェンダ・目次は指定されていません" in result

    def test_allows_explicitly_requested_agenda(self):
        reset_generated_markdown()
        configure_slide_validation("1枚でアジェンダを含めて作って", "kimi")
        md = "---\nmarp: true\n---\n## 本日のアジェンダ\n\n- 項目"

        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"

    def test_rejects_three_kimi_bold_areas_but_allows_sonnet(self):
        md = "---\nmarp: true\n---\n## 課題\n\n- **項目1**：説明\n- **項目2**：説明\n- **項目3**：説明"
        reset_generated_markdown()
        configure_slide_validation("資料を作って", "kimi")
        kimi_result = output_slide(markdown=md)

        reset_generated_markdown()
        configure_slide_validation("資料を作って", "sonnet")
        sonnet_result = output_slide(markdown=md)

        assert "太字が3か所" in kimi_result
        assert sonnet_result == "スライドを出力しました。"

    def test_allows_two_kimi_bold_areas(self):
        reset_generated_markdown()
        configure_slide_validation("資料を作って", "kimi")
        md = "---\nmarp: true\n---\n## 課題\n\n- **項目1**：説明\n- **項目2**：説明"

        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"

    def test_web_search_requires_source_slide_with_three_urls(self):
        reset_generated_markdown()
        configure_slide_validation("最新情報を調べて資料を作って", "kimi")
        mark_web_search_executed()
        md = "---\nmarp: true\n---\n## 最新情報\n\n- 項目"

        result = output_slide(markdown=md)

        assert "実在URLを最低3件" in result

    def test_web_search_accepts_source_slide_with_three_urls(self):
        reset_generated_markdown()
        configure_slide_validation("最新情報を調べて資料を作って", "kimi")
        mark_web_search_executed()
        md = """---
marp: true
---
## 最新情報
<!-- source: https://example.com/1 -->

- 項目

---
<!-- _class: tinytext -->
## 参考文献

- https://example.com/1
- https://example.com/2
- https://example.com/3
"""

        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"

    def test_web_search_requires_source_comment_on_each_content_slide(self):
        reset_generated_markdown()
        configure_slide_validation("最新情報を調べて資料を作って", "kimi")
        mark_web_search_executed()
        md = """---
marp: true
---
## 最新情報

- 項目

---
<!-- _class: tinytext -->
## 参考文献

- https://example.com/1
- https://example.com/2
- https://example.com/3
"""

        result = output_slide(markdown=md)

        assert "根拠URLコメントがない本文スライド: [1]" in result

    def test_web_search_rejects_source_comment_missing_from_references(self):
        reset_generated_markdown()
        configure_slide_validation("最新情報を調べて資料を作って", "kimi")
        mark_web_search_executed()
        md = """---
marp: true
---
## 最新情報
<!-- source: https://example.com/unlisted -->

- 項目

---
<!-- _class: tinytext -->
## 参考文献

- https://example.com/1
- https://example.com/2
- https://example.com/3
"""

        result = output_slide(markdown=md)

        assert "本文の根拠URLが参考文献に未掲載" in result

    def test_kimi_web_search_requires_official_source_for_named_product(self):
        reset_generated_markdown()
        configure_slide_validation("AgentCoreの最新情報を調べて", "kimi")
        mark_web_search_executed()
        md = """---
marp: true
---
## AgentCore
<!-- source: https://example.com/1 -->

- 最新情報

---
<!-- _class: tinytext -->
## 参考文献

- https://example.com/1
- https://example.com/2
- https://example.com/3
"""

        result = output_slide(markdown=md)

        assert "公式情報が参考文献にない製品: Amazon Bedrock AgentCore" in result

    def test_kimi_product_slide_requires_its_official_source_comment(self):
        reset_generated_markdown()
        configure_slide_validation("AgentCoreの最新情報を調べて", "kimi")
        mark_web_search_executed()
        md = """---
marp: true
---
## AgentCore
<!-- source: https://example.com/analysis -->

- 最新情報

---
<!-- _class: tinytext -->
## 参考文献

- https://example.com/analysis
- https://aws.amazon.com/bedrock/agentcore/
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/
"""

        result = output_slide(markdown=md)

        assert "スライド1=Amazon Bedrock AgentCore" in result

    def test_kimi_rejects_unrelated_page_on_official_domain(self):
        reset_generated_markdown()
        configure_slide_validation("Codexの最新情報を調べて", "kimi")
        mark_web_search_executed()
        md = """---
marp: true
---
## Codex
<!-- source: https://openai.com/index/cisco -->

- 最新情報

---
<!-- _class: tinytext -->
## 参考文献

- https://openai.com/index/cisco
- https://openai.com/pricing
- https://openai.com/careers/software-engineer
"""

        result = output_slide(markdown=md)

        assert "公式情報が参考文献にない製品: Codex" in result

    def test_kimi_rejects_unrelated_extra_source_on_product_slide(self):
        reset_generated_markdown()
        configure_slide_validation("Codexの最新情報を調べて", "kimi")
        mark_web_search_executed()
        md = """---
marp: true
---
## Codex
<!-- source: https://help.openai.com/en/articles/20001107-codex-security -->
<!-- source: https://openai.com/index/cisco -->

- セキュリティ

---
<!-- _class: tinytext -->
## 参考文献

- https://help.openai.com/en/articles/20001107-codex-security
- https://openai.com/index/codex-flexible-pricing-for-teams/
- https://openai.com/index/introducing-codex/
- https://openai.com/index/cisco
"""

        result = output_slide(markdown=md)

        assert "対象製品ページではない根拠URL" in result
        assert "https://openai.com/index/cisco" in result

    def test_kimi_comparison_accepts_both_vendors_official_sources(self):
        reset_generated_markdown()
        configure_slide_validation("Claude CodeとCodexを最新情報で比較して", "kimi")
        mark_web_search_executed()
        md = """---
marp: true
---
## Claude CodeとCodex
<!-- source: https://docs.anthropic.com/en/docs/claude-code -->
<!-- source: https://developers.openai.com/codex/ -->

- 公式情報に基づく比較

---
<!-- _class: tinytext -->
## 参考文献

- https://docs.anthropic.com/en/docs/claude-code
- https://developers.openai.com/codex/
- https://openai.com/codex/
"""

        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"

    def test_kimi_rejects_ungrounded_numbers_without_web_search(self):
        reset_generated_markdown()
        configure_slide_validation("定性的な提案資料を作って", "kimi")
        md = "---\nmarp: true\n---\n## 効果\n\n- 投資回収は18ヶ月"

        result = output_slide(markdown=md)

        assert "根拠のない数値表現: 18ヶ月" in result

    def test_kimi_allows_numbers_provided_by_user(self):
        reset_generated_markdown()
        configure_slide_validation("投資回収18ヶ月の提案資料を作って", "kimi")
        md = "---\nmarp: true\n---\n## 効果\n\n- 投資回収は18ヶ月"

        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"

    def test_rejects_three_consecutive_kimi_bullet_slides(self):
        reset_generated_markdown()
        configure_slide_validation("資料を作って", "kimi")
        slide = "## 見出し\n\n- 項目1\n- 項目2\n- 項目3"
        md = "---\nmarp: true\n---\n" + "\n---\n".join([slide, slide, slide])

        result = output_slide(markdown=md)

        assert "bullets型が3枚連続" in result

    def test_sonnet_keeps_existing_two_retry_limit(self):
        reset_generated_markdown()
        configure_slide_validation("10枚で作って", "sonnet")
        md = "---\nmarp: true\n---\n## 1枚だけ"

        output_slide(markdown=md)
        output_slide(markdown=md)
        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"

    def test_kimi_never_accepts_wrong_slide_count_after_retry_limit(self):
        reset_generated_markdown()
        configure_slide_validation("10枚で作って", "kimi")
        md = "---\nmarp: true\n---\n## 1枚だけ"

        for _ in range(5):
            result = output_slide(markdown=md)

        assert "総枚数: 1枚（指定は10枚）" in result
        assert get_generated_markdown() is None
