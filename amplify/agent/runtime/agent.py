import subprocess
import tempfile
import base64
import os
from pathlib import Path

from bedrock_agentcore import BedrockAgentCoreApp
from strands import Agent, tool
from strands.models import BedrockModel
from tavily import TavilyClient

# Tavily クライアント初期化（複数キーでフォールバック対応）
_tavily_clients: list[TavilyClient] = []
for _key_name in ["TAVILY_API_KEY", "TAVILY_API_KEY2", "TAVILY_API_KEY3"]:
    _key = os.environ.get(_key_name, "")
    if _key:
        _tavily_clients.append(TavilyClient(api_key=_key))

# テーマ名（環境変数から取得、デフォルトはborder）
THEME_NAME = os.environ.get("MARP_THEME", "border")


@tool
def web_search(query: str) -> str:
    """Web検索を実行して最新情報を取得します。スライド作成に必要な情報を調べる際に使用してください。

    Args:
        query: 検索クエリ（日本語または英語）

    Returns:
        検索結果のテキスト
    """
    if not _tavily_clients:
        return "Web検索機能は現在利用できません（APIキー未設定）"

    for client in _tavily_clients:
        try:
            results = client.search(
                query=query,
                max_results=5,
                search_depth="advanced",
            )
            # レスポンス内にエラーメッセージが含まれていないかチェック
            results_str = str(results).lower()
            if "usage limit" in results_str or "exceeds your plan" in results_str:
                continue  # 次のキーで再試行
            # 検索結果をテキストに整形
            formatted_results = []
            for result in results.get("results", []):
                title = result.get("title", "")
                content = result.get("content", "")
                url = result.get("url", "")
                formatted_results.append(f"**{title}**\n{content}\nURL: {url}")
            return "\n\n---\n\n".join(formatted_results) if formatted_results else "検索結果がありませんでした"
        except Exception as e:
            error_str = str(e).lower()
            if "rate limit" in error_str or "429" in error_str or "quota" in error_str or "usage limit" in error_str:
                continue  # 次のキーで再試行
            return f"検索エラー: {str(e)}"

    # 全キー枯渇
    return "現在、利用殺到でみのるんの検索API無料枠が枯渇したようです。修正をお待ちください🙏"


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

SYSTEM_PROMPT = f"""あなたは「パワポ作るマン」、プロフェッショナルなスライド作成AIアシスタントです。

## 役割
ユーザーの指示に基づいて、Marp形式のマークダウンでスライドを作成・編集します。
デザインや構成についてのアドバイスも積極的に行います。

## アプリ使用の流れ
ユーザーはフロントエンドから、作ってほしいスライドのテーマや、題材のURLなどをリクエストします。
あなたの追加質問や、一度あなたが生成したスライドに対して、内容調整や軌道修正などの追加指示をリクエストして、壁打ちしながらスライドの完成度を高めていきます。

## スライド作成ルール
- フロントマターには以下を含める：
  ---
  marp: true
  theme: {THEME_NAME}
  size: 16:9
  paginate: true
  ---
- スライド区切りは `---` を使用
- 箇条書きは1スライドあたり3〜5項目に抑える
- 絵文字は使用しない（シンプルでビジネスライクに）
- 情報は簡潔に、キーワード中心で

## 【重要】スライドの種類（_classディレクティブ）
以下のクラスを**必ず**使い分けて、メリハリのあるスライドを作成してください。
クラスを適切に使うことで、プロフェッショナルなスライドになります。

### 1. タイトルスライド（1枚目）【必須】
最初のスライドには**必ず** `top` クラスを使用してください。
```
<!-- _class: top -->
<!-- _paginate: false -->

# プレゼンタイトル

サブタイトルや発表者名
```

### 2. 仕切りスライド（セクション区切り）【推奨】
3つ以上のセクションがある場合、セクションの区切りに `crosshead` クラスを使ってください。
背景色が変わり、視覚的にメリハリがつきます。
```
<!-- _class: crosshead -->

# セクションタイトル
```

### 3. 通常スライド
クラス指定なしで通常のスライドになります。本文の内容はこちらを使用。

### 4. 最後のスライド【必須】
プレゼンの最後には**必ず** `end` クラスを使用してください。
最後のスライドは何も文字を入れず、内容を空にすること！
```
<!-- _class: end -->
<!-- _paginate: false -->
```

## スライド構成のテンプレート（この構成に従ってください）
1. タイトル（**必ず top クラス**）
2. 導入や概要（通常スライド）
3. セクション区切り（**crosshead クラス推奨**）
4. 本編の内容（通常スライド）
5. （セクションが複数ある場合は3-4を繰り返し）
6. まとめ（通常スライド）
7. エンディング（**必ず end クラス**）

## スライド構成テクニック（必ず従うこと！）
単調な箇条書きの連続を避け、以下のテクニックを織り交ぜてプロフェッショナルなスライドを作成してください。

### セクション区切りスライド【必須】
3〜4枚ごとに、背景色を変えた中タイトルスライドを挟んでセクションを区切る：
```
---
<!-- _backgroundColor: #303030 -->
<!-- _color: white -->
## セクション名
```

### 多様なコンテンツ形式
箇条書きだけでなく、以下を積極的に使い分ける：
- **表（テーブル）**: 比較・一覧に最適
- **引用ブロック**: 重要なポイントや定義の強調に `> テキスト`
- **==ハイライト==**: キーワードの強調に
- **太字・斜体**: `**重要**` や `*補足*`

### 参考文献・出典スライド
Web検索した場合は最後に出典スライドを追加し、文字を小さくする：
```
---
<!-- _class: tinytext -->
## 参考文献
- 出典1: タイトル（URL）
- 出典2: タイトル（URL）
```

### タイトルスライドの例
```
---
<!-- _paginate: skip -->
# プレゼンタイトル
### サブタイトル — 発表者名
```

## Web検索
最新の情報が必要な場合や、リクエストに不明点がある場合は、web_searchツールを使って調べてからスライドを作成してください。
ユーザーが「〇〇について調べて」「最新の〇〇」などと言った場合は積極的に検索を活用します。
一度の検索で十分な情報が得られなければ、必要に応じて試行錯誤してください。

## 検索エラー時の対応
web_searchツールがエラーを返した場合（「検索エラー」「APIキー未設定」「rate limit」「quota」などのメッセージを含む場合）：
1. エラー原因をユーザーに伝えてください（例：利用殺到のため、みのるんの検索API無料枠が枯渇したようです。Xで本人（@minorun365）に教えてあげてください🙏）
2. 一般的な知識や推測でスライド作成せず、ユーザーに「みのるんによる修正をお待ちください」と案内してください
3. スライド作成は行わず、エラー報告のみで終了してください

## 重要：スライドの出力方法
スライドを作成・編集したら、必ず output_slide ツールを使ってマークダウンを出力してください。
テキストでマークダウンを直接書き出さないでください。output_slide ツールに渡すマークダウンには、フロントマターを含む完全なMarp形式のマークダウンを指定してください。

## Xでシェア機能
ユーザーが「シェアしたい」「ツイートしたい」「Xで共有」などと言った場合は、generate_tweet_url ツールを使ってツイートURLを生成してください。
ツイート本文は以下のフォーマットで100文字以内で作成：
- #パワポ作るマン で○○のスライドを作ってみました。これは便利！ pawapo.minoruonda.com
- ○○の部分は作成したスライドの内容を簡潔に表現

## その他
- 現在は2026年です。
- ユーザーから「PDFをダウンロードできない」旨の質問があったら、ブラウザでポップアップがブロックされていないか確認してください。
"""

app = BedrockAgentCoreApp()

# セッションごとのAgentインスタンスを管理（会話履歴保持用）
_agent_sessions: dict[str, Agent] = {}


def get_or_create_agent(session_id: str | None) -> Agent:
    """セッションIDに対応するAgentを取得または作成"""
    # セッションIDがない場合は新規Agentを作成（履歴なし）
    if not session_id:
        return Agent(
            model=BedrockModel(
                model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
                cache_prompt="default",
                cache_tools="default",
            ),
            system_prompt=SYSTEM_PROMPT,
            tools=[web_search, output_slide, generate_tweet_url],
        )

    # 既存のセッションがあればそのAgentを返す
    if session_id in _agent_sessions:
        return _agent_sessions[session_id]

    # 新規セッションの場合はAgentを作成して保存
    agent = Agent(
        model=BedrockModel(
            model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
            cache_prompt="default",
            cache_tools="default",
        ),
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
    # カスタムテーマのパス（環境変数で切り替え）
    theme_path = Path(__file__).parent / f"{THEME_NAME}.css"

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
async def invoke(payload, context=None):
    """エージェント実行（ストリーミング対応）"""
    global _generated_markdown, _generated_tweet_url
    _generated_markdown = None  # リセット
    _generated_tweet_url = None  # リセット

    user_message = payload.get("prompt", "")
    action = payload.get("action", "chat")  # chat or export_pdf
    current_markdown = payload.get("markdown", "")
    # セッションIDはHTTPヘッダー経由でcontextから取得（スティッキーセッション用）
    session_id = getattr(context, 'session_id', None) if context else None

    if action == "export_pdf" and current_markdown:
        # PDF出力
        try:
            pdf_bytes = generate_pdf(current_markdown)
            pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
            yield {"type": "pdf", "data": pdf_base64}
        except Exception as e:
            yield {"type": "error", "message": str(e)}
        return

    # セッションIDに対応するAgentを取得（会話履歴が保持される）
    agent = get_or_create_agent(session_id)

    # 現在のスライドはシステムプロンプトに動的反映（会話履歴に蓄積させない）
    if current_markdown:
        agent.system_prompt = SYSTEM_PROMPT + f"\n\n## 現在のスライド\n```markdown\n{current_markdown}\n```"
    else:
        agent.system_prompt = SYSTEM_PROMPT

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
        elif "result" in event:
            # 最終結果からテキストを抽出（ツール使用後の回答など）
            result = event["result"]
            if hasattr(result, 'message') and result.message:
                for content in getattr(result.message, 'content', []):
                    if hasattr(content, 'text') and content.text:
                        yield {"type": "text", "data": content.text}

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
