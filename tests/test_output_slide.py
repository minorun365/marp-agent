"""output_slide ツールのユニットテスト"""
import re

import pytest

from tools.output_slide import (
    configure_slide_validation,
    consume_slide_progress,
    mark_web_search_executed,
    output_slide,
    get_generated_markdown,
    reset_generated_markdown,
    _parse_slides,
    _repair_table_separators,
    _count_content_lines,
    _trim_excess_slides,
    _count_content_lines,
    _check_slide_overflow,
    _repair_slides_mechanically,
    _get_display_width,
    _strip_markdown_formatting,
    _estimate_visual_lines,
    MAX_LINES_PER_SLIDE,
    MAX_DISPLAY_WIDTH_PER_LINE,
    KIMI_MAX_VALIDATION_RETRIES,
)


def test_output_slide_stores_markdown():
    """output_slideがマークダウンを保存する"""
    reset_generated_markdown()
    markdown = (
        "---\nmarp: true\n---\n# テスト\n"
        "- 項目1は説明つき\n- 項目2は説明つき\n- 項目3は説明つき\n- 項目4は説明つき"
    )

    result = output_slide(markdown=markdown)

    assert result == "スライドを出力しました。"
    assert get_generated_markdown() == markdown


def test_get_generated_markdown_initial_none():
    """初期状態ではNone"""
    reset_generated_markdown()
    assert get_generated_markdown() is None


def test_parse_slides_matches_marp_thematic_breaks():
    """3本超のハイフンなど、Marpがページ区切りにする水平線も数える"""
    markdown = """---
marp: true
---
# 1

----

# 2

* * *

# 3

___

# 4
"""

    assert len(_parse_slides(markdown)) == 4


def test_parse_slides_ignores_thematic_break_inside_code_fence():
    markdown = """---
marp: true
---
# コード

````markdown
---
````

---

# 次のスライド
"""

    assert len(_parse_slides(markdown)) == 2


def test_parse_slides_keeps_setext_heading_on_same_slide():
    markdown = "---\nmarp: true\n---\nタイトル\n----\n本文"

    assert len(_parse_slides(markdown)) == 1


def test_slide_count_validation_matches_marp_for_four_hyphen_separator():
    """Marpが9枚と描画するMarkdownを検査側も9枚として扱う"""
    reset_generated_markdown()
    configure_slide_validation("8枚で作って", "kimi")
    slides = [f"## スライド{i}\n\n本文" for i in range(1, 10)]
    markdown = "---\nmarp: true\n---\n" + "\n\n----\n\n".join(slides)

    result = output_slide(markdown=markdown)

    assert "総枚数: 9枚（指定は8枚）" in result
    assert get_generated_markdown() is None


def test_trim_excess_slides_preserves_special_slides_and_distributes_body():
    slides = [
        '<!-- _class: top -->\n# 表紙',
        *[f'## 本文{i}\n\n- 項目' for i in range(1, 8)],
        '<!-- _class: tinytext -->\n## 参考文献\n\n- https://example.com',
        '<!-- _class: end -->\n# Thank you!',
    ]
    markdown = '---\nmarp: true\n---\n\n' + '\n\n---\n\n'.join(slides)

    trimmed = _trim_excess_slides(markdown, 8)
    trimmed_slides = _parse_slides(trimmed)

    assert len(trimmed_slides) == 8
    assert '# 表紙' in trimmed_slides[0]
    assert '## 本文1' in trimmed
    assert '## 本文7' in trimmed
    assert '## 参考文献' in trimmed_slides[-2]
    assert '# Thank you!' in trimmed_slides[-1]


def test_slide_validation_progress_is_consumed_once():
    """検査結果は簡潔な進捗として1回だけ取得できる"""
    reset_generated_markdown()
    lines = ["## 見出し"] + [f"- 項目{i}" for i in range(1, 11)]
    markdown = "---\nmarp: true\n---\n\n" + "\n".join(lines)

    output_slide(markdown=markdown)

    assert consume_slide_progress() == "文字や表のはみ出しを検知したので、スライドを修正します"
    assert consume_slide_progress() is None


def test_kimi_progress_announces_one_overflow_first_recheck():
    reset_generated_markdown()
    configure_slide_validation("詳しい資料を作って", "kimi")
    lines = ["## 見出し"] + [f"- 項目{i}" for i in range(1, 11)]
    markdown = "---\nmarp: true\n---\n\n" + "\n".join(lines)

    output_slide(markdown=markdown)

    assert consume_slide_progress() == "文字や表のはみ出しを検知したので、スライドを修正します"


def test_reset_generated_markdown():
    """リセット後はNoneに戻る"""
    output_slide(markdown="# test")
    reset_generated_markdown()
    assert get_generated_markdown() is None


def test_output_slide_overwrites():
    """次の依頼で呼び直すと最新のマークダウンが保持される

    同じ依頼の中での呼び直しは受け付けない（確定後の空振りを止めるため）。
    実運用では invoke ごとに reset_generated_markdown が走る。
    """
    body = "\n- 項目1の説明\n- 項目2の説明\n- 項目3の説明\n- 項目4の説明"
    reset_generated_markdown()
    output_slide(markdown="# first" + body)
    reset_generated_markdown()  # ユーザーからの次の指示
    output_slide(markdown="# second" + body)
    assert get_generated_markdown() == "# second" + body


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
        md = "---\nmarp: true\n---\n\n## Title\n\n- Item 1\n- Item 2\n- Item 3\n- Item 4"
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

    def test_overflow_repaired_mechanically_after_max_retries(self):
        """リトライ上限に達したら、はみ出しを機械で詰めてから採用する。

        2026-08-18まではそのまま採用していたため、実測で全生成の54%が
        はみ出したまま利用者へ届いていた。素通りさせないのがこのテストの主旨。
        """
        reset_generated_markdown()
        lines = ["## 見出し"] + [f"- 項目{i}" for i in range(1, 11)]
        slide_content = "\n".join(lines)
        md = f"---\nmarp: true\n---\n\n{slide_content}"

        output_slide(markdown=md)  # 1回目リジェクト
        output_slide(markdown=md)  # 2回目リジェクト
        result = output_slide(markdown=md)  # 3回目は機械修正して受入

        assert result == "スライドを出力しました。"
        generated = get_generated_markdown()
        assert generated is not None
        # 素通りしていない（元のままではない）
        assert generated != md
        # はみ出しが実際に解消されている
        assert _check_slide_overflow(generated) == []
        # 見出しと冒頭の項目は残っている
        assert "## 見出し" in generated
        assert "- 項目1" in generated

    def test_retry_counter_resets_on_success(self):
        """正常出力後にリトライカウンターがリセットされる"""
        reset_generated_markdown()
        valid_md = "---\nmarp: true\n---\n\n## Title\n\n- Item 1"
        output_slide(markdown=valid_md)  # 正常出力（カウンターリセット）
        reset_generated_markdown()  # 確定後は同じ依頼で呼べないため次の依頼として扱う

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


class TestSlideCountReadsOnlyUserRequest:
    """枚数の指定は利用者自身の文からだけ読む（2026-08-22）。

    以前は現在のスライド全文・PDFの抽出テキスト・URL資料モードのプロンプトを
    連結したメッセージから拾っていたため、「2枚目を直して」や、URLを貼っただけの
    依頼が「1枚ちょうどにしろ」という差し戻しになっていた。
    """

    def test_ordinal_reference_is_not_a_count(self):
        """「2枚目を直して」は枚数の指定ではない"""
        reset_generated_markdown()
        configure_slide_validation("2枚目の表現をやわらかくして", "grok")
        slides = [f"## スライド{i}\n\n- 項目" for i in range(1, 12)]
        md = "---\nmarp: true\n---\n" + "\n---\n".join(slides)

        result = output_slide(markdown=md)

        assert "指定は2枚" not in result

    def test_agent_passes_only_the_user_prompt(self):
        """呼び出し元が、装飾済みメッセージではなく利用者の文を渡していること。

        user_message には現在のスライド全文・PDFの抽出テキスト・URL資料モードの
        プロンプトが連結される。URL資料モードの本文には「1枚」が含まれるため、
        そちらを渡すと URLを貼っただけの依頼が毎回「指定は1枚」で差し戻される。
        設定が外れてもエラーが出ないので、呼び出し元をソースで押さえる。
        """
        from pathlib import Path

        agent_source = (
            Path(__file__).resolve().parents[1] / "agent" / "agent.py"
        ).read_text()

        assert 'configure_slide_validation(payload.get("prompt", ""), model_type)' in agent_source
        assert "configure_slide_validation(user_message" not in agent_source

    def test_explicit_count_still_enforced(self):
        """本来の枚数指定はこれまでどおり効く"""
        reset_generated_markdown()
        configure_slide_validation("10枚で作って", "grok")
        slides = [f"## スライド{i}\n\n- 項目" for i in range(1, 12)]
        md = "---\nmarp: true\n---\n" + "\n---\n".join(slides)

        result = output_slide(markdown=md)

        assert "11枚（指定は10枚）" in result


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

    def test_kimi_accepts_unrequested_agenda_as_warning(self):
        reset_generated_markdown()
        configure_slide_validation("提案資料を作って", "kimi")
        md = "---\nmarp: true\n---\n## 本日のアジェンダ\n\n- 項目"

        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"

    def test_allows_explicitly_requested_agenda(self):
        reset_generated_markdown()
        configure_slide_validation("1枚でアジェンダを含めて作って", "kimi")
        md = "---\nmarp: true\n---\n## 本日のアジェンダ\n\n- 項目"

        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"

    def test_kimi_accepts_bold_warning_without_regeneration(self):
        md = "---\nmarp: true\n---\n## 課題\n\n- **項目1**：説明\n- **項目2**：説明\n- **項目3**：説明"
        reset_generated_markdown()
        configure_slide_validation("資料を作って", "kimi")
        kimi_result = output_slide(markdown=md)
        assert kimi_result == "スライドを出力しました。"
        assert consume_slide_progress() is None

        reset_generated_markdown()
        configure_slide_validation("資料を作って", "sonnet")
        sonnet_result = output_slide(markdown=md)

        assert sonnet_result == "スライドを出力しました。"

    def test_kimi_repairs_overflow_twice_then_shrinks_mechanically(self):
        """Kimiへ2回まで直させ、それでも残るはみ出しは機械で詰めて出す。"""
        reset_generated_markdown()
        configure_slide_validation("詳しい資料を作って", "kimi")
        assert KIMI_MAX_VALIDATION_RETRIES == 2
        long_line = "- " + "長い説明文" * 20
        md = "---\nmarp: true\n---\n## 詳細\n\n" + "\n".join([long_line] * 5)

        for _ in range(KIMI_MAX_VALIDATION_RETRIES):
            result = output_slide(markdown=md)
            assert "実質" in result
            assert get_generated_markdown() is None
            assert consume_slide_progress() is not None

        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"
        generated = get_generated_markdown()
        assert generated is not None
        assert _check_slide_overflow(generated) == []
        assert consume_slide_progress() is None

    def test_kimi_prioritizes_overflow_and_excludes_source_repairs(self):
        reset_generated_markdown()
        configure_slide_validation("Claude Codeを調べて詳しい資料を作って", "kimi")
        mark_web_search_executed()
        lines = ["## Claude Code"] + [f"- 長い説明文{i}" * 6 for i in range(1, 10)]
        md = "---\nmarp: true\n---\n\n" + "\n".join(lines)

        result = output_slide(markdown=md)
        progress = consume_slide_progress()

        assert "【最優先】はみ出しをこの1回の修正で完全に解消" in result
        assert result.index("【最優先】") < result.index("スライド1")
        assert "参考文献スライドが必要" not in result
        assert "公式情報が参考文献にない" not in result
        assert progress is not None
        assert "文字や表のはみ出し" in progress
        assert "出典・根拠" not in progress

    def test_allows_two_kimi_bold_areas(self):
        reset_generated_markdown()
        configure_slide_validation("資料を作って", "kimi")
        md = "---\nmarp: true\n---\n## 課題\n\n- **項目1**：説明\n- **項目2**：説明"

        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"

    def test_kimi_accepts_missing_reference_slide_without_regeneration(self):
        reset_generated_markdown()
        configure_slide_validation("最新情報を調べて資料を作って", "kimi")
        mark_web_search_executed()
        md = "---\nmarp: true\n---\n## 最新情報\n\n- 項目"

        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"
        assert consume_slide_progress() is None

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

    def test_kimi_accepts_missing_source_comment_as_warning(self):
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

        assert result == "スライドを出力しました。"

    def test_kimi_accepts_unlisted_source_comment_as_warning(self):
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

        assert result == "スライドを出力しました。"

    def test_kimi_accepts_missing_official_source_without_regeneration(self):
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

        assert result == "スライドを出力しました。"
        assert consume_slide_progress() is None

    def test_kimi_accepts_non_official_slide_comment_when_references_are_valid(self):
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

        assert result == "スライドを出力しました。"

    def test_kimi_accepts_unrelated_official_page_without_regeneration(self):
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

        assert result == "スライドを出力しました。"
        assert consume_slide_progress() is None

    def test_kimi_accepts_unrelated_extra_source_comment_as_warning(self):
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

        assert result == "スライドを出力しました。"

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

    def test_kimi_accepts_ungrounded_number_as_non_blocking_warning(self):
        reset_generated_markdown()
        configure_slide_validation("定性的な提案資料を作って", "kimi")
        md = "---\nmarp: true\n---\n## 効果\n\n- 投資回収は18ヶ月"

        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"

    def test_kimi_allows_numbers_provided_by_user(self):
        reset_generated_markdown()
        configure_slide_validation("投資回収18ヶ月の提案資料を作って", "kimi")
        md = "---\nmarp: true\n---\n## 効果\n\n- 投資回収は18ヶ月"

        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"

    def test_kimi_accepts_repeated_pattern_without_regeneration(self):
        reset_generated_markdown()
        configure_slide_validation("資料を作って", "kimi")
        slide = "## 見出し\n\n- 項目1\n- 項目2\n- 項目3"
        md = "---\nmarp: true\n---\n" + "\n---\n".join([slide, slide, slide])

        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"

    def test_sonnet_keeps_existing_two_retry_limit(self):
        reset_generated_markdown()
        configure_slide_validation("10枚で作って", "sonnet")
        md = "---\nmarp: true\n---\n## 1枚だけ"

        output_slide(markdown=md)
        output_slide(markdown=md)
        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"

    def test_kimi_trims_excess_slides_after_one_repair(self):
        reset_generated_markdown()
        configure_slide_validation("8枚で作って", "kimi")
        slides = [
            '<!-- _class: top -->\n# 表紙',
            *[f'## 本文{i}\n\n- 項目' for i in range(1, 8)],
            '<!-- _class: tinytext -->\n## 参考文献\n\n- https://example.com',
            '<!-- _class: end -->\n# Thank you!',
        ]
        md = '---\nmarp: true\n---\n\n' + '\n\n---\n\n'.join(slides)

        for _ in range(KIMI_MAX_VALIDATION_RETRIES):
            retry_result = output_slide(markdown=md)
            assert "総枚数: 10枚（指定は8枚）" in retry_result

        final_result = output_slide(markdown=md)

        assert final_result == "スライドを出力しました。"
        assert len(_parse_slides(get_generated_markdown() or '')) == 8

    def test_kimi_accepts_undercount_after_one_repair(self):
        reset_generated_markdown()
        configure_slide_validation("10枚で作って", "kimi")
        md = "---\nmarp: true\n---\n## 1枚だけ"

        for _ in range(KIMI_MAX_VALIDATION_RETRIES):
            result = output_slide(markdown=md)
            assert "総枚数: 1枚（指定は10枚）" in result
            assert get_generated_markdown() is None
            assert consume_slide_progress() is not None

        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"
        assert get_generated_markdown() == md
        assert consume_slide_progress() is None


class TestMechanicalRepair:
    """機械修正のテスト。

    2026-08-18まで、検査ではみ出しを見つけてもKimiが直しきれなければそのまま出力していた。
    本番ログの実測では、直近14日の生成67回のうち36回（54%）がはみ出したまま利用者へ届いていた。
    はみ出し・表幅・太字は計算で判定できるので、最後は機械で確定させる。
    """

    def test_repairs_long_bullet_list(self):
        """箇条書きが多すぎるスライドは、末尾の項目を落として収める。"""
        md = (
            "---\nmarp: true\n---\n\n## 見出し\n\n"
            + "\n".join(f"- 項目{i}です。" for i in range(1, 13))
        )

        repaired = _repair_slides_mechanically(md)

        assert _check_slide_overflow(repaired) == []
        assert "## 見出し" in repaired
        assert "- 項目1です。" in repaired

    def test_repairs_long_sentences_by_dropping_trailing_ones(self):
        """1項目に何文も詰まっている場合は、後ろの文から落とす。"""
        md = (
            "---\nmarp: true\n---\n\n## 見出し\n\n"
            "- 第一の文です。第二の文です。第三の文です。第四の文です。第五の文です。第六の文です。\n"
            "- 別の第一文です。別の第二文です。別の第三文です。別の第四文です。別の第五文です。\n"
        )

        repaired = _repair_slides_mechanically(md)

        assert _check_slide_overflow(repaired) == []
        assert "第一の文です。" in repaired

    def test_repairs_text_without_any_punctuation(self):
        """句点も読点も無い長文は、文字単位で切って省略記号を残す。"""
        md = (
            "---\nmarp: true\n---\n\n## 見出し\n\n"
            + "\n".join("- " + "長い説明文" * 20 for _ in range(5))
        )

        repaired = _repair_slides_mechanically(md)

        assert _check_slide_overflow(repaired) == []
        assert "…" in repaired

    def test_repairs_wide_table(self):
        """表の横幅超過は、セル内容を詰めて解消する（列は減らさない）。"""
        md = (
            "---\nmarp: true\n---\n\n## 比較\n\n"
            "| 観点 | 従来の開発プロセスにおける進め方 | エージェント導入後に変わる進め方 |\n"
            "|---|---|---|\n"
            "| 設計 | 担当者が仕様書を個別に作成して合議する | 対話しながら構造化した案を短時間で作る |\n"
        )

        repaired = _repair_slides_mechanically(md)

        assert _check_slide_overflow(repaired) == []
        # 列は3列のまま保たれる
        assert repaired.count("|---|---|---|") == 1

    def test_reduces_bold_to_two_places(self):
        """太字は機械で2か所まで減らす（実測で最多の違反、かつ再生成では直していなかった）。"""
        md = (
            "---\nmarp: true\n---\n\n## 見出し\n\n"
            "- **一つ目**：説明。\n- **二つ目**：説明。\n- **三つ目**：説明。\n- **四つ目**：説明。\n"
        )

        repaired = _repair_slides_mechanically(md)

        assert len(re.findall(r"\*\*.+?\*\*", repaired)) == 2
        # 太字を外しても本文は残す
        assert "三つ目" in repaired
        assert "四つ目" in repaired

    def test_keeps_special_slides_untouched(self):
        """タイトル・参考文献・裏表紙は行数チェックの対象外なので触らない。"""
        md = (
            "---\nmarp: true\n---\n\n"
            "<!-- _class: top -->\n# **表紙の題**\n\n---\n\n"
            "<!-- _class: tinytext -->\n## 参考文献\n\n"
            + "\n".join(f"- https://example.com/{i}" for i in range(1, 9))
            + "\n\n---\n\n<!-- _class: end -->\n# Thank you!\n"
        )

        repaired = _repair_slides_mechanically(md)

        assert "**表紙の題**" in repaired
        assert "https://example.com/8" in repaired

    def test_keeps_source_comments(self):
        """根拠URLのコメントは画面に出ないので、削らずに残す。"""
        md = (
            "---\nmarp: true\n---\n\n## 見出し\n\n"
            "<!-- source: https://example.com/article -->\n\n"
            + "\n".join(f"- 項目{i}です。" for i in range(1, 13))
        )

        repaired = _repair_slides_mechanically(md)

        assert "<!-- source: https://example.com/article -->" in repaired
        assert _check_slide_overflow(repaired) == []


class TestSlideLanguage:
    """英語資料を渡されても日本語スライドで出す検証"""

    def test_english_body_is_rejected(self):
        reset_generated_markdown()
        configure_slide_validation("https://www.anthropic.com/news/example をスライドにして", "kimi")
        md = """---
marp: true
---
<!-- _class: top -->
# Building Effective Agents

---
## What Makes Agents Effective

- Agents plan their own steps toward a goal
- Workflows follow fixed paths defined by developers
- Start simple and add complexity only when needed

---
<!-- _class: end -->
# Thank you!
"""

        result = output_slide(markdown=md)

        assert "日本語" in result
        assert "スライドを出力しました。" not in result

    def test_japanese_body_with_english_product_names_passes(self):
        reset_generated_markdown()
        configure_slide_validation("AgentCoreの資料を作って", "kimi")
        md = """---
marp: true
---
<!-- _class: top -->
# Amazon Bedrock AgentCore の全体像

---
## AgentCore が解決する課題

- Runtime がエージェントの実行環境を受け持つ
- Gateway で外部APIをツールとして束ねる
- Identity が呼び出し元と外部連携の認証を担う

---
<!-- _class: end -->
# Thank you!
"""

        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"

    def test_reference_and_closing_slides_are_exempt(self):
        reset_generated_markdown()
        configure_slide_validation("参考文献つきの資料を作って", "kimi")
        md = """---
marp: true
---
<!-- _class: top -->
# 日本語のタイトルスライド

---
## 本文は日本語で書かれている

- 検証したいのは参考文献と裏表紙が除外されること
- 英語のURLだけの並びを違反にしない

---
<!-- _class: tinytext -->
## References

- https://www.anthropic.com/news/building-effective-agents
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/what-is-bedrock-agentcore.html

---
<!-- _class: end -->
# Thank you!
"""

        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"

    def test_progress_message_mentions_language(self):
        reset_generated_markdown()
        configure_slide_validation("英語記事をスライドにして", "kimi")
        md = """---
marp: true
---
## Why This Matters For Engineering Teams

- Agents can decide the next tool call on their own
- Guardrails keep the loop from running away
"""

        output_slide(markdown=md)

        assert "日本語" in (consume_slide_progress() or "")

    def test_english_heavy_technical_slide_passes(self):
        """英語の製品名・機能名が並ぶ日本語スライドを巻き込まない"""
        reset_generated_markdown()
        configure_slide_validation("AgentCoreの構成要素をまとめて", "kimi")
        md = """---
marp: true
---
## AgentCore の主要コンポーネント

- Runtime / Gateway / Identity / Memory / Observability
- Browser Tool と Code Interpreter も提供
"""

        result = output_slide(markdown=md)

        assert result == "スライドを出力しました。"


def test_output_slide_rejects_reoutput_after_finalized():
    """確定後の呼び直しを受け付けないこと。

    Kimiは違反ゼロで確定した後も同じ内容でoutput_slideを呼び直すため、
    生成1回あたりのツール呼び出しが余計に増えていた（2026-08-19実測）。
    プロンプトの禁止だけでは守られないのでコード側で止めている。
    """
    from tools import output_slide as output_slide_tool
    from tools.output_slide import (
        configure_slide_validation,
        get_generated_markdown,
        reset_generated_markdown,
    )

    markdown = (
        "---\nmarp: true\ntheme: border\nsize: 16:9\npaginate: true\n---\n\n"
        "<!-- _class: top --><!-- _paginate: skip -->\n\n# タイトル\n\n---\n\n"
        "## 結論を述語で言い切る見出し\n\n理由を述べるリード文を置く。\n\n"
        "- 根拠のひとつ目\n- 根拠のふたつ目\n\n---\n\n"
        "<!-- _class: end --><!-- _paginate: skip -->\n\n# Thank you!\n"
    )

    reset_generated_markdown()
    configure_slide_validation("テスト", "kimi")

    first = output_slide_tool(markdown)
    assert "出力しました" in first
    assert get_generated_markdown() == markdown

    # 2回目は受け付けず、保存済みの内容も書き換えない
    second = output_slide_tool(markdown.replace("根拠のふたつ目", "劣化した内容"))
    assert "出力済み" in second
    assert get_generated_markdown() == markdown

    # ユーザーの次の指示（invokeごとのリセット）で再び受け付ける
    reset_generated_markdown()
    configure_slide_validation("テスト", "kimi")
    assert "出力しました" in output_slide_tool(markdown)


def test_repair_table_separators_restores_broken_tables():
    """区切り行が抜けた表を、出力を受け取った時点で機械的に直す。

    2026-08-19の実測でGrokは表7個のうち5個で `| --- |` を落としていた。
    区切り行が無いとMarpは表として描画せず、パイプ付きの文字列がそのまま画面へ出る。
    モデルへ指摘して直させるより、確定的に補うほうが速くて確実。
    """
    broken = "## 見出し\n\n| 観点 | A | B |\n| 実行 | 端末 | 雲 |\n"

    repaired = _repair_table_separators(broken)

    assert "| --- | --- | --- |" in repaired
    assert repaired.splitlines()[3] == "| --- | --- | --- |"
    # 行数の数え方は区切り行を除外しているので、補っても判定は変わらない
    assert _count_content_lines(
        broken
    ) == _count_content_lines(repaired)


def test_repair_table_separators_leaves_correct_tables_and_code_blocks_alone():
    intact = "| 観点 | A |\n| --- | --- |\n| 実行 | 端末 |\n"
    code = "```\n| a | b |\n| c | d |\n```\n"

    assert _repair_table_separators(intact) == intact
    assert _repair_table_separators(code) == code


class TestThinSlideValidation:
    """薄いページ検知（Grokのみ）のテスト"""

    def _build(self, body_line_count):
        body = "\n".join(f"- 項目{i}の説明" for i in range(1, body_line_count + 1))
        return (
            "---\nmarp: true\n---\n\n"
            "<!-- _class: top -->\n# タイトル\n\n---\n\n"
            f"## 本文\n{body}\n\n---\n\n"
            "<!-- _class: end -->\n# Thank you!"
        )

    def test_thin_slide_rejected_for_grok(self):
        """見出しを除いて3行以下の本文スライドは肉付けの修正指示が返る"""
        reset_generated_markdown()
        configure_slide_validation("スライドを作って", "grok")
        result = output_slide(markdown=self._build(3))
        assert "薄い" in result

    def test_enough_body_lines_accepted(self):
        """4行あれば通る"""
        reset_generated_markdown()
        configure_slide_validation("スライドを作って", "grok")
        result = output_slide(markdown=self._build(4))
        assert result == "スライドを出力しました。"

    def test_thin_slide_not_checked_for_kimi(self):
        """Kimiでは薄さ検知を適用しない"""
        reset_generated_markdown()
        configure_slide_validation("スライドを作って", "kimi")
        result = output_slide(markdown=self._build(3))
        assert result == "スライドを出力しました。"

    def test_special_slides_exempt(self):
        """タイトル・裏表紙などの特殊スライドは薄さ検知の対象外"""
        reset_generated_markdown()
        configure_slide_validation("スライドを作って", "grok")
        md = (
            "---\nmarp: true\n---\n\n<!-- _class: top -->\n# タイトル\n\n---\n\n"
            "<!-- _class: end -->\n# Thank you!"
        )
        result = output_slide(markdown=md)
        assert result == "スライドを出力しました。"
