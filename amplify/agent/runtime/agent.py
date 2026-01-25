import subprocess
import tempfile
import base64
import os
from pathlib import Path

from bedrock_agentcore import BedrockAgentCoreApp
from strands import Agent, tool
from tavily import TavilyClient

# Tavily クライアント初期化（APIキーがある場合のみ）
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")
tavily_client = TavilyClient(api_key=TAVILY_API_KEY) if TAVILY_API_KEY else None


@tool
def web_search(query: str) -> str:
    """Web検索を実行して最新情報を取得します。スライド作成に必要な情報を調べる際に使用してください。

    Args:
        query: 検索クエリ（日本語または英語）

    Returns:
        検索結果のテキスト
    """
    if not tavily_client:
        return "Web検索機能は現在利用できません（APIキー未設定）"

    try:
        results = tavily_client.search(
            query=query,
            max_results=5,
            search_depth="advanced",
        )
        # 検索結果をテキストに整形
        formatted_results = []
        for result in results.get("results", []):
            title = result.get("title", "")
            content = result.get("content", "")
            url = result.get("url", "")
            formatted_results.append(f"**{title}**\n{content}\nURL: {url}")
        return "\n\n---\n\n".join(formatted_results) if formatted_results else "検索結果がありませんでした"
    except Exception as e:
        return f"検索エラー: {str(e)}"


# スライド出力用のグローバル変数（invokeで参照）
_generated_markdown: str | None = None

# ツイートURL用のグローバル変数
_generated_tweet_url: str | None = None


@tool
def generate_tweet_url(tweet_text: str) -> str:
    """ツイート投稿用のURLを生成します。ユーザーがXでシェアしたい場合に使用してください。

    Args:
        tweet_text: ツイート本文（100文字以内、ハッシュタグ含む）

    Returns:
        生成完了メッセージ
    """
    import urllib.parse

    global _generated_tweet_url
    # 日本語をURLエンコード
    encoded_text = urllib.parse.quote(tweet_text, safe='')
    # Twitter Web Intent（compose/postではtextパラメータが無視される）
    _generated_tweet_url = f"https://twitter.com/intent/tweet?text={encoded_text}"
    return "ツイートURLを生成しました。"


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

SYSTEM_PROMPT = """あなたは「パワポ作るマン」、プロフェッショナルなスライド作成AIアシスタントです。

## 役割
ユーザーの指示に基づいて、Marp形式のマークダウンでスライドを作成・編集します。
デザインや構成についてのアドバイスも積極的に行います。

## スライド作成ルール
- フロントマターには以下を含める：
  ---
  marp: true
  theme: border
  size: 16:9
  paginate: true
  ---
- スライド区切りは `---` を使用
- 1枚目はタイトルスライド（タイトル + サブタイトル）
- 箇条書きは1スライドあたり3〜5項目に抑える
- 絵文字は使用しない（シンプルでビジネスライクに）
- 情報は簡潔に、キーワード中心で

## Web検索
最新の情報が必要な場合や、リクエストに不明点がある場合は、web_searchツールを使って調べてからスライドを作成してください。
ユーザーが「〇〇について調べて」「最新の〇〇」などと言った場合は積極的に検索を活用します。

## 重要：スライドの出力方法
スライドを作成・編集したら、必ず output_slide ツールを使ってマークダウンを出力してください。
テキストでマークダウンを直接書き出さないでください。output_slide ツールに渡すマークダウンには、フロントマターを含む完全なMarp形式のマークダウンを指定してください。

## Xでシェア機能
ユーザーが「シェアしたい」「ツイートしたい」「Xで共有」などと言った場合は、generate_tweet_url ツールを使ってツイートURLを生成してください。
ツイート本文は以下のフォーマットで100文字以内で作成：
- #パワポ作るマン で○○のスライドを作ってみた！ https://marp.minoruonda.com
- ○○の部分は作成したスライドの内容を簡潔に表現

## その他
- 現在は2026年です。
"""

app = BedrockAgentCoreApp()

# セッションごとのAgentインスタンスを管理（会話履歴保持用）
_agent_sessions: dict[str, Agent] = {}


def get_or_create_agent(session_id: str | None) -> Agent:
    """セッションIDに対応するAgentを取得または作成"""
    # セッションIDがない場合は新規Agentを作成（履歴なし）
    if not session_id:
        return Agent(
            model="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
            system_prompt=SYSTEM_PROMPT,
            tools=[web_search, output_slide, generate_tweet_url],
        )

    # 既存のセッションがあればそのAgentを返す
    if session_id in _agent_sessions:
        return _agent_sessions[session_id]

    # 新規セッションの場合はAgentを作成して保存
    agent = Agent(
        model="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        system_prompt=SYSTEM_PROMPT,
        tools=[web_search, output_slide, generate_tweet_url],
    )
    _agent_sessions[session_id] = agent
    return agent


def extract_markdown(text: str) -> str | None:
    """レスポンスからマークダウンを抽出"""
    import re
    pattern = r"```markdown\s*([\s\S]*?)\s*```"
    match = re.search(pattern, text)
    if match:
        return match.group(1).strip()
    return None


def generate_pdf(markdown: str) -> bytes:
    """Marp CLIでPDFを生成"""
    # カスタムテーマのパス
    theme_path = Path(__file__).parent / "border.css"

    with tempfile.TemporaryDirectory() as tmpdir:
        md_path = Path(tmpdir) / "slide.md"
        pdf_path = Path(tmpdir) / "slide.pdf"

        md_path.write_text(markdown, encoding="utf-8")

        cmd = [
            "marp",
            str(md_path),
            "--pdf",
            "--allow-local-files",
            "-o", str(pdf_path),
        ]
        # カスタムテーマが存在する場合は適用
        if theme_path.exists():
            cmd.extend(["--theme", str(theme_path)])

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            raise RuntimeError(f"Marp CLI error: {result.stderr}")

        return pdf_path.read_bytes()


@app.entrypoint
async def invoke(payload):
    """エージェント実行（ストリーミング対応）"""
    global _generated_markdown, _generated_tweet_url
    _generated_markdown = None  # リセット
    _generated_tweet_url = None  # リセット

    user_message = payload.get("prompt", "")
    action = payload.get("action", "chat")  # chat or export_pdf
    current_markdown = payload.get("markdown", "")
    session_id = payload.get("session_id")  # セッションID（会話履歴保持用）

    if action == "export_pdf" and current_markdown:
        # PDF出力
        try:
            pdf_bytes = generate_pdf(current_markdown)
            pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
            yield {"type": "pdf", "data": pdf_base64}
        except Exception as e:
            yield {"type": "error", "message": str(e)}
        return

    # チャット（スライド生成・編集）
    if current_markdown:
        user_message = f"現在のスライド:\n```markdown\n{current_markdown}\n```\n\nユーザーの指示: {user_message}"

    # セッションIDに対応するAgentを取得（会話履歴が保持される）
    agent = get_or_create_agent(session_id)
    stream = agent.stream_async(user_message)

    async for event in stream:
        if "data" in event:
            chunk = event["data"]
            yield {"type": "text", "data": chunk}
        elif "current_tool_use" in event:
            # ツール使用中イベントを送信
            tool_info = event["current_tool_use"]
            tool_name = tool_info.get("name", "unknown")
            yield {"type": "tool_use", "data": tool_name}

    # output_slideツールで生成されたマークダウンを送信
    if _generated_markdown:
        yield {"type": "markdown", "data": _generated_markdown}

    # generate_tweet_urlツールで生成されたツイートURLを送信
    if _generated_tweet_url:
        yield {"type": "tweet_url", "data": _generated_tweet_url}

    yield {"type": "done"}


if __name__ == "__main__":
    app.run()

# trigger
