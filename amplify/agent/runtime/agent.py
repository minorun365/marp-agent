"""パワポ作るマン - エージェントエントリポイント"""

import base64
import json

from bedrock_agentcore import BedrockAgentCoreApp

from config import MAX_RETRY_COUNT
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
from handlers import is_tool_name_corrupted, remove_think_tags, extract_marp_markdown_from_text
from exports import generate_pdf, generate_pptx
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
    theme = payload.get("theme", "gradient")

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

    # 現在のスライドがある場合はユーザーメッセージに付加
    if current_markdown:
        user_message = f"現在のスライド:\n```markdown\n{current_markdown}\n```\n\nユーザーの指示: {user_message}"

    # セッションIDとモデルタイプに対応するAgentを取得
    agent = get_or_create_agent(session_id, model_type)

    # Kimi K2のツール名破損時のリトライループ
    retry_count = 0
    fallback_markdown: str | None = None

    while retry_count <= MAX_RETRY_COUNT:
        reset_generated_markdown()
        fallback_markdown = None
        tool_name_corrupted = False
        has_any_output = False
        web_search_executed = False

        # Kimi K2用のバッファ
        kimi_text_buffer = "" if model_type == "kimi" else None
        kimi_skip_text = False
        kimi_in_think_tag = False
        kimi_pending_text = ""

        stream = agent.stream_async(user_message)

        async for event in stream:
            # Kimi K2 Thinking の思考プロセスは無視
            if event.get("reasoning"):
                continue

            if "data" in event:
                chunk = event["data"]
                if model_type == "kimi":
                    kimi_text_buffer += chunk

                    # マークダウン検出
                    if not kimi_skip_text and "marp: true" in kimi_text_buffer.lower():
                        kimi_skip_text = True
                        print(f"[INFO] Kimi K2: Marp markdown detected in text stream, skipping text output")

                    if not kimi_skip_text:
                        # <think>タグのフィルタリング処理
                        kimi_pending_text += chunk

                        # <think>タグ開始の検出
                        while "<think>" in kimi_pending_text:
                            before, _, after = kimi_pending_text.partition("<think>")
                            if before:
                                has_any_output = True
                                yield {"type": "text", "data": before}
                            kimi_in_think_tag = True
                            kimi_pending_text = after
                            print(f"[INFO] Kimi K2: <think> tag detected, entering think mode")

                        # </think>タグ終了の検出
                        while "</think>" in kimi_pending_text:
                            before, _, after = kimi_pending_text.partition("</think>")
                            kimi_in_think_tag = False
                            kimi_pending_text = after
                            print(f"[INFO] Kimi K2: </think> tag detected, exiting think mode")

                        # タグ内でなければテキストを出力
                        if not kimi_in_think_tag:
                            safe_end = len(kimi_pending_text)
                            if "<" in kimi_pending_text:
                                last_lt = kimi_pending_text.rfind("<")
                                if len(kimi_pending_text) - last_lt <= 7:
                                    safe_end = last_lt
                            if safe_end > 0:
                                to_send = kimi_pending_text[:safe_end]
                                kimi_pending_text = kimi_pending_text[safe_end:]
                                if to_send:
                                    has_any_output = True
                                    yield {"type": "text", "data": to_send}
                else:
                    # Claude: そのままテキスト送信
                    has_any_output = True
                    yield {"type": "text", "data": chunk}

            elif "current_tool_use" in event:
                tool_info = event["current_tool_use"]
                tool_name = tool_info.get("name", "unknown")
                tool_input = tool_info.get("input", {})

                # Kimi K2のツール名破損をチェック
                if is_tool_name_corrupted(tool_name):
                    tool_name_corrupted = True
                    print(f"[WARN] Corrupted tool name detected: {tool_name[:50]}... (retry {retry_count + 1}/{MAX_RETRY_COUNT})")
                    continue

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
                else:
                    yield {"type": "tool_use", "data": tool_name}

            elif "result" in event:
                result = event["result"]
                if hasattr(result, 'message') and result.message:
                    for content in getattr(result.message, 'content', []):
                        # Kimi K2 Thinking の reasoningContent からマークダウンを抽出
                        if hasattr(content, 'reasoningContent'):
                            reasoning = content.reasoningContent
                            if hasattr(reasoning, 'reasoningText'):
                                reasoning_text = reasoning.reasoningText
                                if hasattr(reasoning_text, 'text') and reasoning_text.text:
                                    text = reasoning_text.text
                                    if "<|tool_call" in text or "functions.web_search" in text or "functions.output_slide" in text:
                                        tool_name_corrupted = True
                                        print(f"[WARN] Tool call found in reasoning text (retry {retry_count + 1}/{MAX_RETRY_COUNT})")
                                    extracted = extract_marp_markdown_from_text(text)
                                    if extracted and not fallback_markdown:
                                        fallback_markdown = extracted
                                        print(f"[INFO] Fallback markdown extracted from reasoningContent")
                            continue
                        if hasattr(content, 'text') and content.text:
                            has_any_output = True
                            yield {"type": "text", "data": content.text}

        # Kimi K2: ストリーム終了後のペンディングバッファ処理
        if model_type == "kimi" and kimi_pending_text and not kimi_skip_text and not kimi_in_think_tag:
            clean_text = remove_think_tags(kimi_pending_text)
            if clean_text:
                has_any_output = True
                yield {"type": "text", "data": clean_text}

        # Kimi K2: テキストストリームからマークダウンを抽出（フォールバック）
        if model_type == "kimi" and kimi_text_buffer and not fallback_markdown:
            extracted = extract_marp_markdown_from_text(kimi_text_buffer)
            if extracted:
                fallback_markdown = extracted
                print(f"[INFO] Kimi K2: Fallback markdown extracted from text stream")

        # リトライ判定
        generated_markdown = get_generated_markdown()
        if tool_name_corrupted and not generated_markdown and not fallback_markdown and model_type == "kimi":
            retry_count += 1
            if retry_count <= MAX_RETRY_COUNT:
                yield {"type": "status", "data": f"リトライ中... ({retry_count}/{MAX_RETRY_COUNT})"}
                agent.messages.clear()
                continue
            else:
                yield {"type": "error", "message": "スライド生成に失敗しました。Claudeモデルをお試しください。"}
        break

    # マークダウン出力
    generated_markdown = get_generated_markdown()
    markdown_to_send = generated_markdown or fallback_markdown
    if markdown_to_send:
        if fallback_markdown and not generated_markdown:
            print(f"[INFO] Using fallback markdown (output_slide was not called)")
        yield {"type": "markdown", "data": markdown_to_send}

    # Web検索後にスライドが生成されなかった場合のフォールバック
    last_search_result = get_last_search_result()
    if web_search_executed and not markdown_to_send and last_search_result:
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
