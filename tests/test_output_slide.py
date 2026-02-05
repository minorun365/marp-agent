"""output_slide ツールのユニットテスト"""
from tools.output_slide import (
    output_slide,
    get_generated_markdown,
    reset_generated_markdown,
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
