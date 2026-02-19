"""パワポ作るマン - エージェントエントリポイント"""

import asyncio
import base64
import json
import os

import pdfplumber
from bedrock_agentcore import BedrockAgentCoreApp

from tools import (
    web_search,
    output_slide,
    generate_tweet_url,
    get_generated_markdown,
    reset_generated_markdown,
    get_generated_tweet_url,
    reset_generated_tweet_url,
)
from tools.web_search import get_last_search_result, reset_last_search_result
from exports import generate_pdf, generate_pptx, generate_editable_pptx
from sharing import share_slide
from session import get_or_create_agent

app = BedrockAgentCoreApp()

MAX_PDF_SIZE = 10 * 1024 * 1024  # 10MB
MAX_EXTRACTED_CHARS = 50000  # 約25,000トークン


def extract_text_from_pdf(pdf_path: str) -> str:
    """PDFからテキストを抽出"""
    text_parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)

    full_text = "\n\n".join(text_parts)
    if len(full_text) > MAX_EXTRACTED_CHARS:
        full_text = full_text[:MAX_EXTRACTED_CHARS] + "\n\n（以降省略）"
    return full_text


async def _wait_with_keepalive(task, format_name):
    """タスク完了を待ちつつ、5秒ごとにSSE keep-aliveイベントをyield"""
    while not task.done():
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=5.0)
        except asyncio.TimeoutError:
            yield {"type": "progress", "message": f"{format_name}変換中..."}


@app.entrypoint
async def invoke(payload, context=None):
    """エージェント実行（ストリーミング対応）"""
    # グローバル状態をリセット
    reset_generated_markdown()
    reset_generated_tweet_url()
    reset_last_search_result()

    user_message = payload.get("prompt", "")
    action = payload.get("action", "chat")
    current_markdown = payload.get("markdown", "")
    model_type = payload.get("model_type", "sonnet")
    session_id = getattr(context, 'session_id', None) if context else None
    theme = payload.get("theme", "border")
    reference_file = payload.get("reference_file")

    # PDF出力
    if action == "export_pdf" and current_markdown:
        try:
            print(f"[INFO] PDF export started (theme={theme})")
            loop = asyncio.get_event_loop()
            task = loop.run_in_executor(None, generate_pdf, current_markdown, theme)
            async for event in _wait_with_keepalive(task, "PDF"):
                yield event
            pdf_bytes = task.result()
            pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
            print(f"[INFO] PDF export completed (size={len(pdf_bytes)} bytes)")
            yield {"type": "pdf", "data": pdf_base64}
        except Exception as e:
            print(f"[ERROR] PDF export failed: {e}")
            yield {"type": "error", "message": str(e)}
        return

    # PPTX出力
    if action == "export_pptx" and current_markdown:
        try:
            print(f"[INFO] PPTX export started (theme={theme})")
            loop = asyncio.get_event_loop()
            task = loop.run_in_executor(None, generate_pptx, current_markdown, theme)
            async for event in _wait_with_keepalive(task, "PPTX"):
                yield event
            pptx_bytes = task.result()
            pptx_base64 = base64.b64encode(pptx_bytes).decode("utf-8")
            print(f"[INFO] PPTX export completed (size={len(pptx_bytes)} bytes)")
            yield {"type": "pptx", "data": pptx_base64}
        except Exception as e:
            print(f"[ERROR] PPTX export failed: {e}")
            yield {"type": "error", "message": str(e)}
        return

    # 編集可能PPTX出力（実験的機能）
    if action == "export_pptx_editable" and current_markdown:
        try:
            print(f"[INFO] Editable PPTX export started (theme={theme})")
            loop = asyncio.get_event_loop()
            task = loop.run_in_executor(None, generate_editable_pptx, current_markdown, theme)
            async for event in _wait_with_keepalive(task, "編集可能PPTX"):
                yield event
            pptx_bytes = task.result()
            pptx_base64 = base64.b64encode(pptx_bytes).decode("utf-8")
            print(f"[INFO] Editable PPTX export completed (size={len(pptx_bytes)} bytes)")
            yield {"type": "pptx", "data": pptx_base64}
        except Exception as e:
            print(f"[ERROR] Editable PPTX export failed: {e}")
            yield {"type": "error", "message": f"編集可能PPTX生成エラー（実験的機能）: {str(e)}"}
        return

    # スライド共有
    if action == "share_slide" and current_markdown:
        try:
            print(f"[INFO] Slide share started (theme={theme})")
            loop = asyncio.get_event_loop()
            task = loop.run_in_executor(None, share_slide, current_markdown, theme)
            async for event in _wait_with_keepalive(task, "共有"):
                yield event
            result = task.result()
            print(f"[INFO] Slide share completed (url={result['url']})")
            yield {
                "type": "share_result",
                "url": result['url'],
                "expiresAt": result['expiresAt'],
            }
        except Exception as e:
            print(f"[ERROR] Slide share failed: {e}")
            yield {"type": "error", "message": str(e)}
        return

    # 参考資料PDFの処理
    if reference_file:
        try:
            file_name = reference_file.get("file_name", "upload.pdf")
            base64_data = reference_file.get("base64_data", "")
            file_size = reference_file.get("size", 0)

            if file_size > MAX_PDF_SIZE:
                yield {"type": "error", "error": "ファイルサイズが10MBを超えています"}
                return

            yield {"type": "status", "data": "参考資料を読み込んでいます..."}
            print(f"[INFO] PDF upload received: {file_name} ({file_size} bytes)")

            pdf_bytes = base64.b64decode(base64_data)
            pdf_path = f"/tmp/{file_name}"
            with open(pdf_path, "wb") as f:
                f.write(pdf_bytes)

            extracted_text = extract_text_from_pdf(pdf_path)

            # 一時ファイルを削除
            os.remove(pdf_path)

            if not extracted_text.strip():
                print(f"[WARN] No text extracted from PDF: {file_name}")
                yield {"type": "text", "data": "このPDFからテキストを抽出できませんでした（画像ベースのPDFの可能性があります）。テキスト情報なしでスライドを作成します。\n\n"}
            else:
                print(f"[INFO] PDF text extracted: {len(extracted_text)} chars from {file_name}")
                user_message = f"""以下は参考資料「{file_name}」の内容です：

---参考資料ここから---
{extracted_text}
---参考資料ここまで---

上記の参考資料を踏まえて、{user_message}"""

        except Exception as e:
            print(f"[ERROR] PDF processing failed: {e}")
            yield {"type": "text", "data": f"PDFの読み取りに失敗しました: {e}\nテキスト情報なしでスライドを作成します。\n\n"}

    # セッションIDとモデルタイプとテーマに対応するAgentを取得
    agent = get_or_create_agent(session_id, model_type, theme)

    # 既存セッション（Agent履歴にスライド内容が残っている）ではMarkdown付加をスキップ
    # 新規セッションまたは履歴がない場合のみ、フロントからのMarkdownをメッセージに結合
    if current_markdown and not agent.messages:
        user_message = f"現在のスライド:\n```markdown\n{current_markdown}\n```\n\nユーザーの指示: {user_message}"

    reset_generated_markdown()
    web_search_executed = False
    stream_error = False

    try:
        stream = agent.stream_async(user_message)

        async for event in stream:
            if "data" in event:
                chunk = event["data"]
                yield {"type": "text", "data": chunk}

            elif "current_tool_use" in event:
                tool_info = event["current_tool_use"]
                tool_name = tool_info.get("name", "unknown")
                tool_input = tool_info.get("input", {})

                # 文字列の場合はJSONパースを試みる
                if isinstance(tool_input, str):
                    try:
                        tool_input = json.loads(tool_input)
                    except json.JSONDecodeError:
                        pass

                if tool_name == "web_search":
                    web_search_executed = True
                    if isinstance(tool_input, dict) and "query" in tool_input:
                        yield {"type": "tool_use", "data": tool_name, "query": tool_input["query"]}
                elif tool_name == "http_request":
                    if isinstance(tool_input, dict) and "url" in tool_input:
                        yield {"type": "tool_use", "data": tool_name, "query": tool_input["url"]}
                    else:
                        yield {"type": "tool_use", "data": tool_name}
                else:
                    yield {"type": "tool_use", "data": tool_name}

            elif "result" in event:
                result = event["result"]
                if hasattr(result, 'message') and result.message:
                    for content in getattr(result.message, 'content', []):
                        if hasattr(content, 'text') and content.text:
                            yield {"type": "text", "data": content.text}

                # ツール完了直後にマークダウンを送信（スピナーを即座に停止）
                generated_markdown = get_generated_markdown()
                if generated_markdown:
                    yield {"type": "markdown", "data": generated_markdown}
                    reset_generated_markdown()

    except Exception as e:
        stream_error = True
        print(f"[ERROR] Stream failed (model_type={model_type}): {e}")
        yield {"type": "error", "error": str(e)}

    # マークダウン出力
    generated_markdown = get_generated_markdown()
    if generated_markdown:
        yield {"type": "markdown", "data": generated_markdown}

    # Web検索後にスライドが生成されなかった場合のフォールバック
    last_search_result = get_last_search_result()
    if web_search_executed and not generated_markdown and last_search_result:
        truncated_result = last_search_result[:500]
        if len(last_search_result) > 500:
            truncated_result += "..."
        fallback_message = f"Web検索結果:\n\n{truncated_result}\n\n---\nスライドを作成しますか？"
        print(f"[INFO] Web search executed but no slide generated, returning search result as fallback (model_type={model_type})")
        yield {"type": "text", "data": fallback_message}

    # ツイートURL出力
    generated_tweet_url = get_generated_tweet_url()
    if generated_tweet_url:
        yield {"type": "tweet_url", "data": generated_tweet_url}

    yield {"type": "done"}


if __name__ == "__main__":
    app.run()
