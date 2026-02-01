import subprocess
import tempfile
import base64
import os
import json
from pathlib import Path

from bedrock_agentcore import BedrockAgentCoreApp
from strands import Agent, tool
from strands.models import BedrockModel
from tavily import TavilyClient


def _get_model_config(model_type: str = "claude") -> dict:
    """モデルタイプに応じた設定を返す"""
    if model_type == "kimi":
        # Kimi K2 Thinking（Moonshot AI）
        # - クロスリージョン推論なし
        # - cache_prompt/cache_tools非対応
        return {
            "model_id": "moonshot.kimi-k2-thinking",
            "cache_prompt": None,
            "cache_tools": None,
        }
    else:
        # Claude Sonnet 4.5（デフォルト）
        region = os.environ.get("AWS_REGION", "us-east-1")
        if region == "ap-northeast-1":
            prefix = "jp"
        else:
            prefix = "us"
        return {
            "model_id": f"{prefix}.anthropic.claude-sonnet-4-5-20250929-v1:0",
            "cache_prompt": "default",
            "cache_tools": "default",
        }


# Tavilyクライアント初期化（複数キーでフォールバック対応）
_tavily_clients: list[TavilyClient] = []
for _key_name in ["TAVILY_API_KEY", "TAVILY_API_KEY2", "TAVILY_API_KEY3"]:
    _key = os.environ.get(_key_name, "")
    if _key:
        _tavily_clients.append(TavilyClient(api_key=_key))

# デフォルトテーマ（kagブランチではKAG）
DEFAULT_THEME = os.environ.get("MARP_THEME", "kag")


@tool
def web_search(query: str) -> str:
    """Web検索を実行して最新情報を取得します。スライド作成に必要な情報を調べる際に使用してください。

    Args:
        query: 検索クエリ（日本語または英語）

    Returns:
        検索結果のテキスト
    """
    global _last_search_result

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
            search_result = "\n\n---\n\n".join(formatted_results) if formatted_results else "検索結果がありませんでした"
            _last_search_result = search_result  # フォールバック用に保存
            return search_result
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

# Web検索結果用のグローバル変数（フォールバック用）
_last_search_result: str | None = None


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
  theme: {DEFAULT_THEME}
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
- **太字・斜体**: `**重要**` や `*補足*`（==ハイライト==記法は日本語と相性が悪いので使用禁止）

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

## スライド出力後の返答について
output_slide ツールでスライドを出力した直後は、以下の場合を除きテキストメッセージを生成しないでください：
- Web検索などのツール実行がエラーで失敗した
- ユーザーが追加で質問や修正指示をしている
「スライドが完成しました」「以下の構成で～」などのサマリーメッセージは不要です。

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


def _create_bedrock_model(model_type: str = "claude") -> BedrockModel:
    """モデル設定に基づいてBedrockModelを作成"""
    config = _get_model_config(model_type)
    # cache_prompt/cache_toolsがNoneの場合は引数に含めない（Kimi K2対応）
    if config["cache_prompt"] is None:
        return BedrockModel(model_id=config["model_id"])
    else:
        return BedrockModel(
            model_id=config["model_id"],
            cache_prompt=config["cache_prompt"],
            cache_tools=config["cache_tools"],
        )


def get_or_create_agent(session_id: str | None, model_type: str = "claude") -> Agent:
    """セッションIDとモデルタイプに対応するAgentを取得または作成"""
    # セッションキーにモデルタイプを含める（モデル切り替え時に新しいAgentを作成）
    cache_key = f"{session_id}:{model_type}" if session_id else None

    # セッションIDがない場合は新規Agentを作成（履歴なし）
    if not cache_key:
        return Agent(
            model=_create_bedrock_model(model_type),
            system_prompt=SYSTEM_PROMPT,
            tools=[web_search, output_slide, generate_tweet_url],
        )

    # 既存のセッションがあればそのAgentを返す
    if cache_key in _agent_sessions:
        return _agent_sessions[cache_key]

    # 新規セッションの場合はAgentを作成して保存
    agent = Agent(
        model=_create_bedrock_model(model_type),
        system_prompt=SYSTEM_PROMPT,
        tools=[web_search, output_slide, generate_tweet_url],
    )
    _agent_sessions[cache_key] = agent
    return agent


# Kimi K2のツール名破損検出用
VALID_TOOL_NAMES = {"web_search", "output_slide", "generate_tweet_url"}
MAX_RETRY_COUNT = 5  # ツール名破損時の最大リトライ回数


def is_tool_name_corrupted(tool_name: str) -> bool:
    """ツール名が破損しているかチェック（Kimi K2対策）"""
    if not tool_name:
        return False
    # 有効なツール名でなければ破損とみなす
    if tool_name not in VALID_TOOL_NAMES:
        return True
    # 内部トークンが混入していたら破損
    if "<|" in tool_name or "tooluse_" in tool_name:
        return True
    return False


def extract_markdown(text: str) -> str | None:
    """レスポンスからマークダウンを抽出"""
    import re
    pattern = r"```markdown\s*([\s\S]*?)\s*```"
    match = re.search(pattern, text)
    if match:
        return match.group(1).strip()
    return None


def extract_marp_markdown_from_text(text: str) -> str | None:
    """テキストからMarpマークダウンを抽出（フォールバック用）

    Kimi K2がoutput_slideツールを呼ばずにテキストとしてマークダウンを出力した場合に使用
    """
    import re

    if not text or "marp: true" not in text:
        return None

    # フロントマター（---で始まるブロック）からスライド終端まで抽出
    # パターン: ---\nmarp: true で始まり、最後のスライド内容まで
    pattern = r'(---\s*\nmarp:\s*true[\s\S]*?)(?:<\|tool_call|$)'
    match = re.search(pattern, text)
    if match:
        markdown = match.group(1).strip()
        # 内部トークンが残っていたら除去
        markdown = re.sub(r'<\|[^>]+\|>', '', markdown)
        # 末尾の不完全な行を除去
        lines = markdown.split('\n')
        # 最後の行が不完全（閉じタグなど）なら除去
        while lines and (lines[-1].strip().startswith('<|') or not lines[-1].strip()):
            lines.pop()
        return '\n'.join(lines) if lines else None

    return None


def generate_pdf(markdown: str, theme: str = 'kag') -> bytes:
    """Marp CLIでPDFを生成"""
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

        # テーマ設定: カスタムCSS
        theme_path = Path(__file__).parent / f"{theme}.css"
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


def generate_pptx(markdown: str, theme: str = 'kag') -> bytes:
    """Marp CLIでPPTXを生成"""
    with tempfile.TemporaryDirectory() as tmpdir:
        md_path = Path(tmpdir) / "slide.md"
        pptx_path = Path(tmpdir) / "slide.pptx"

        md_path.write_text(markdown, encoding="utf-8")

        cmd = [
            "marp",
            str(md_path),
            "--pptx",
            "--allow-local-files",
            "-o", str(pptx_path),
        ]

        # テーマ設定: カスタムCSS
        theme_path = Path(__file__).parent / f"{theme}.css"
        if theme_path.exists():
            cmd.extend(["--theme", str(theme_path)])

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            raise RuntimeError(f"Marp CLI error: {result.stderr}")

        return pptx_path.read_bytes()


@app.entrypoint
async def invoke(payload, context=None):
    """エージェント実行（ストリーミング対応）"""
    global _generated_markdown, _generated_tweet_url, _last_search_result
    _generated_markdown = None  # リセット
    _generated_tweet_url = None  # リセット
    _last_search_result = None  # リセット

    user_message = payload.get("prompt", "")
    action = payload.get("action", "chat")  # chat or export_pdf
    current_markdown = payload.get("markdown", "")
    model_type = payload.get("model_type", "claude")  # claude or kimi
    theme = payload.get("theme", DEFAULT_THEME)  # テーマ（フロントエンドから指定）
    # セッションIDはHTTPヘッダー経由でcontextから取得（スティッキーセッション用）
    session_id = getattr(context, 'session_id', None) if context else None

    if action == "export_pdf" and current_markdown:
        # PDF出力
        try:
            pdf_bytes = generate_pdf(current_markdown, theme)
            pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
            yield {"type": "pdf", "data": pdf_base64}
        except Exception as e:
            yield {"type": "error", "message": str(e)}
        return

    if action == "export_pptx" and current_markdown:
        # PPTX出力
        try:
            pptx_bytes = generate_pptx(current_markdown, theme)
            pptx_base64 = base64.b64encode(pptx_bytes).decode("utf-8")
            yield {"type": "pptx", "data": pptx_base64}
        except Exception as e:
            yield {"type": "error", "message": str(e)}
        return

    # 現在のスライドがある場合はユーザーメッセージに付加
    if current_markdown:
        user_message = f"現在のスライド:\n```markdown\n{current_markdown}\n```\n\nユーザーの指示: {user_message}"

    # セッションIDとモデルタイプに対応するAgentを取得（会話履歴が保持される）
    agent = get_or_create_agent(session_id, model_type)

    # Kimi K2のツール名破損時のリトライループ
    retry_count = 0
    fallback_markdown: str | None = None  # フォールバック用マークダウン

    while retry_count <= MAX_RETRY_COUNT:
        _generated_markdown = None  # リトライ時にリセット
        fallback_markdown = None  # リトライ時にリセット
        tool_name_corrupted = False  # 破損検出フラグ
        has_any_output = False  # テキスト出力があったかのフラグ
        web_search_executed = False  # Web検索が実行されたかのフラグ（Kimi K2対策）

        # Kimi K2の場合、dataイベントを蓄積してマークダウン検出に使用
        kimi_text_buffer = "" if model_type == "kimi" else None
        kimi_skip_text = False  # マークダウン検出後はテキスト送信をスキップ

        stream = agent.stream_async(user_message)

        async for event in stream:
            # Kimi K2 Thinking の思考プロセスは無視（最終回答のみ表示）
            if event.get("reasoning"):
                continue

            if "data" in event:
                chunk = event["data"]
                if model_type == "kimi":
                    # Kimi K2: テキストを蓄積してマークダウン開始を検出
                    kimi_text_buffer += chunk
                    if not kimi_skip_text and "marp: true" in kimi_text_buffer.lower():
                        kimi_skip_text = True
                        print(f"[INFO] Kimi K2: Marp markdown detected in text stream, skipping text output")
                    if not kimi_skip_text:
                        has_any_output = True
                        yield {"type": "text", "data": chunk}
                else:
                    # Claude: そのままテキスト送信
                    has_any_output = True
                    yield {"type": "text", "data": chunk}
            elif "current_tool_use" in event:
                # ツール使用中イベントを送信
                tool_info = event["current_tool_use"]
                tool_name = tool_info.get("name", "unknown")
                tool_input = tool_info.get("input", {})

                # Kimi K2のツール名破損をチェック
                if is_tool_name_corrupted(tool_name):
                    tool_name_corrupted = True
                    # リトライ対象であることをログ出力（デバッグ用）
                    print(f"[WARN] Corrupted tool name detected: {tool_name[:50]}... (retry {retry_count + 1}/{MAX_RETRY_COUNT})")
                    continue  # 破損したツール呼び出しは無視

                # 文字列の場合はJSONパースを試みる（ストリーミング中は不完全なJSONが来る）
                if isinstance(tool_input, str):
                    try:
                        tool_input = json.loads(tool_input)
                    except json.JSONDecodeError:
                        pass  # パースできない場合はそのまま（不完全なJSON）

                # web_searchの場合はクエリが取得できた時のみ送信（ストリーミング中は複数回イベントが来るため）
                if tool_name == "web_search":
                    web_search_executed = True  # Web検索実行フラグを立てる
                    if isinstance(tool_input, dict) and "query" in tool_input:
                        yield {"type": "tool_use", "data": tool_name, "query": tool_input["query"]}
                    # クエリがない場合はイベントを送信しない（完全なJSONを待つ）
                else:
                    yield {"type": "tool_use", "data": tool_name}
            elif "result" in event:
                # 最終結果からテキストを抽出（ツール使用後の回答など）
                result = event["result"]
                if hasattr(result, 'message') and result.message:
                    for content in getattr(result.message, 'content', []):
                        # Kimi K2 Thinking の reasoningContent からマークダウンを抽出（フォールバック）
                        if hasattr(content, 'reasoningContent'):
                            reasoning = content.reasoningContent
                            if hasattr(reasoning, 'reasoningText'):
                                reasoning_text = reasoning.reasoningText
                                if hasattr(reasoning_text, 'text') and reasoning_text.text:
                                    text = reasoning_text.text
                                    # ツール呼び出しがテキストとして埋め込まれている場合を検出（リトライ対象）
                                    if "<|tool_call" in text or "functions.web_search" in text or "functions.output_slide" in text:
                                        tool_name_corrupted = True
                                        print(f"[WARN] Tool call found in reasoning text (retry {retry_count + 1}/{MAX_RETRY_COUNT})")
                                    # マークダウン抽出（フォールバック用）
                                    extracted = extract_marp_markdown_from_text(text)
                                    if extracted and not fallback_markdown:
                                        fallback_markdown = extracted
                                        print(f"[INFO] Fallback markdown extracted from reasoningContent")
                            continue
                        if hasattr(content, 'text') and content.text:
                            has_any_output = True
                            yield {"type": "text", "data": content.text}

        # Kimi K2: テキストストリームからマークダウンを抽出（フォールバック）
        if model_type == "kimi" and kimi_text_buffer and not fallback_markdown:
            extracted = extract_marp_markdown_from_text(kimi_text_buffer)
            if extracted:
                fallback_markdown = extracted
                print(f"[INFO] Kimi K2: Fallback markdown extracted from text stream")

        # リトライ判定: ツール名破損が検出され、markdownが生成されていない場合
        if tool_name_corrupted and not _generated_markdown and not fallback_markdown and model_type == "kimi":
            retry_count += 1
            if retry_count <= MAX_RETRY_COUNT:
                yield {"type": "status", "data": f"リトライ中... ({retry_count}/{MAX_RETRY_COUNT})"}
                # Agentの会話履歴をクリアしてリトライ（破損した履歴を引き継がない）
                agent.messages.clear()
                continue
            else:
                yield {"type": "error", "message": "スライド生成に失敗しました。Claudeモデルをお試しください。"}
        break  # 正常完了またはリトライ上限

    # output_slideツールで生成されたマークダウンを送信
    # output_slideが呼ばれなかった場合はフォールバックを使用（Kimi K2対策）
    markdown_to_send = _generated_markdown or fallback_markdown
    if markdown_to_send:
        if fallback_markdown and not _generated_markdown:
            print(f"[INFO] Using fallback markdown (output_slide was not called)")
        yield {"type": "markdown", "data": markdown_to_send}

    # Web検索後にスライドが生成されなかった場合のフォールバック（Kimi K2対策 #42）
    # 条件: Web検索が実行されたが、マークダウンが生成されず、検索結果がある場合
    if web_search_executed and not markdown_to_send and _last_search_result:
        # 検索結果を500文字に切り詰めて表示
        truncated_result = _last_search_result[:500]
        if len(_last_search_result) > 500:
            truncated_result += "..."
        fallback_message = f"Web検索結果:\n\n{truncated_result}\n\n---\nスライドを作成しますか？"
        print(f"[INFO] Web search executed but no slide generated, returning search result as fallback (model_type={model_type})")
        yield {"type": "text", "data": fallback_message}

    # generate_tweet_urlツールで生成されたツイートURLを送信
    if _generated_tweet_url:
        yield {"type": "tweet_url", "data": _generated_tweet_url}

    yield {"type": "done"}


if __name__ == "__main__":
    app.run()

# trigger
