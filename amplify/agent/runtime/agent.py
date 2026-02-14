"""パワポ作るマン - エージェントエントリポイント"""

import base64
import json

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

    # PDF出力
    if action == "export_pdf" and current_markdown:
        try:
            pdf_bytes = generate_pdf(current_markdown, theme)
            pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
            yield {"type": "pdf", "data": pdf_base64}
        except Exception as e:
            yield {"type": "error", "message": str(e)}
        return

    # PPTX出力
    if action == "export_pptx" and current_markdown:
        try:
            pptx_bytes = generate_pptx(current_markdown, theme)
            pptx_base64 = base64.b64encode(pptx_bytes).decode("utf-8")
            yield {"type": "pptx", "data": pptx_base64}
        except Exception as e:
            yield {"type": "error", "message": str(e)}
        return

    # 編集可能PPTX出力（実験的機能）
    if action == "export_pptx_editable" and current_markdown:
        try:
            pptx_bytes = generate_editable_pptx(current_markdown, theme)
            pptx_base64 = base64.b64encode(pptx_bytes).decode("utf-8")
            yield {"type": "pptx", "data": pptx_base64}
        except Exception as e:
            yield {"type": "error", "message": f"編集可能PPTX生成エラー（実験的機能）: {str(e)}"}
        return

    # スライド共有
    if action == "share_slide" and current_markdown:
        try:
            result = share_slide(current_markdown, theme)
            yield {
                "type": "share_result",
                "url": result['url'],
                "expiresAt": result['expiresAt'],
            }
        except Exception as e:
            yield {"type": "error", "message": str(e)}
        return

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
