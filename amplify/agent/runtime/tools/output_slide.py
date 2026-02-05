"""スライド出力ツール"""

from strands import tool

# スライド出力用のグローバル変数
# NOTE: ContextVarはStrands Agentsがツールを別スレッドで実行するため値が共有されない
_generated_markdown: str | None = None


def get_generated_markdown() -> str | None:
    """生成されたマークダウンを取得"""
    return _generated_markdown


def reset_generated_markdown() -> None:
    """マークダウンをリセット"""
    global _generated_markdown
    _generated_markdown = None


@tool
def output_slide(markdown: str) -> str:
    """生成したスライドのマークダウンを出力します。スライドを作成・編集したら必ずこのツールを使って出力してください。

    Args:
        markdown: Marp形式のマークダウン全文（フロントマターを含む）

    Returns:
        出力完了メッセージ
    """
    global _generated_markdown
    _generated_markdown = markdown
    return "スライドを出力しました。"
