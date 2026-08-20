"""パワポ作るマン - エージェントエントリポイント"""

import asyncio
import base64
import json
import os
import re

import pdfplumber
from bedrock_agentcore import BedrockAgentCoreApp

from config import URL_REFERENCE_MODE_PROMPT, normalize_model_type, uses_agentcore_web_search
from identity import log_session_identity
from tools import (
    web_search,
    output_slide,
    configure_slide_validation,
    mark_web_search_executed,
    generate_tweet_url,
    consume_slide_progress,
    get_generated_markdown,
    reset_generated_markdown,
    get_generated_tweet_url,
    reset_generated_tweet_url,
)
from tools.web_search import (
    get_last_search_result,
    reset_last_search_result,
    set_search_backend,
)
from tools.http_request import reset_url_fetched
from exports import generate_pdf, generate_pptx, generate_editable_pptx
from sharing import share_slide
from session import get_or_create_agent

app = BedrockAgentCoreApp()

# ユーザーがメッセージへ貼ったURLの検出。記事本体を主役にするモードへ切り替える。
USER_URL_PATTERN = re.compile(r'https?://[^\s<>"\'）】」]+')

MAX_PDF_SIZE = 10 * 1024 * 1024  # 10MB
MAX_EXTRACTED_CHARS = 50000  # 約25,000トークン
STREAM_KEEPALIVE_INTERVAL = 5.0  # ストリーミング中のkeep-alive間隔（秒）

_STREAM_SENTINEL = object()


async def _safe_anext(aiter):
    """StopAsyncIterationをセンチネル値に変換（asyncio.ensure_future対応）"""
    try:
        return await aiter.__anext__()
    except StopAsyncIteration:
        return _STREAM_SENTINEL


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
    reset_url_fetched()

    user_message = payload.get("prompt", "")
    action = payload.get("action", "chat")
    current_markdown = payload.get("markdown", "")
    model_type = normalize_model_type(payload.get("model_type"))
    # Web検索の実行先はモデル種別で決まる。試験用の種別だけAgentCoreのWeb Searchを使う。
    set_search_backend("agentcore" if uses_agentcore_web_search(model_type) else "tavily")
    session_id = getattr(context, 'session_id', None) if context else None
    theme = payload.get("theme", "border")
    reference_file = payload.get("reference_file")

    # 利用統計のため、このリクエストが誰のものかを1行だけログへ残す（詳細は identity.py）
    log_session_identity(session_id, context)

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

    # 意図しないスライドが返る事象を追えるよう、どのセッションがどの状態で
    # 実行に入ったかを残す。プロンプト本文は出さず長さだけにする。
    print(
        f"[INFO] invoke started (session={session_id}, model={model_type}, "
        f"action={action}, history={len(agent.messages)}, "
        f"prompt_len={len(user_message)}, markdown_len={len(current_markdown)})"
    )

    # 既存セッション（Agent履歴にスライド内容が残っている）ではMarkdown付加をスキップ
    # 新規セッションまたは履歴がない場合のみ、フロントからのMarkdownをメッセージに結合
    if current_markdown and not agent.messages:
        user_message = f"現在のスライド:\n```markdown\n{current_markdown}\n```\n\nユーザーの指示: {user_message}"

    # URLが貼られた依頼は、その記事がスライドの主役。検索へ脱線して一般論へ薄めさせない。
    user_urls = USER_URL_PATTERN.findall(payload.get("prompt", ""))
    if user_urls and action == "chat":
        print(f"[INFO] URL reference mode enabled ({len(user_urls)} url(s))")
        user_message = f"{URL_REFERENCE_MODE_PROMPT}\n\n{user_message}"

    reset_generated_markdown()
    configure_slide_validation(user_message, model_type)
    web_search_executed = False
    slide_outputted = False
    suppress_text = False
    stream_error = False
    kimi_text_buffer: list[str] = []
    kimi_slide_workflow_started = False
    web_search_event_count = 0
    # 画面へ通知済みの取得URL。Kimiはツールの引数を分割して流すため、
    # 同じ取得について複数回スナップショットが届く。
    announced_fetch_urls: list[str] = []
    # 同じ検索について既に通知したクエリ（途中まで含む）。重複通知の判定に使う。
    announced_search_queries: list[str] = []
    # keep-aliveが何回連続で走ったか。ツールもテキストも来ない時間の長さを測る。
    silent_intervals = 0
    # 「スライドを作成中」を先出ししたか（output_slideの通知が来る前の空白対策）。
    slide_compose_announced = False
    # 検索やテキストが一度でも届いたか。届く前の考え込みと区別する。
    activity_seen = False

    def get_slide_progress_event():
        """Kimiの内部文ではなく、検査ツールが確定した進捗だけを返す。"""
        if model_type != "kimi":
            return None
        progress_message = consume_slide_progress()
        if not progress_message:
            return None
        return {"type": "slide_progress", "data": progress_message}

    try:
        stream = agent.stream_async(user_message)
        stream_iter = stream.__aiter__()
        pending = asyncio.ensure_future(_safe_anext(stream_iter))

        while True:
            done, _ = await asyncio.wait({pending}, timeout=STREAM_KEEPALIVE_INTERVAL)
            if not done:
                silent_intervals += 1
                # Grokはツールの引数を分割せず、スライド全文を書き終えてから
                # 1回だけ渡してくる。そのため最後の検索からoutput_slideの通知まで
                # 実測で70〜80秒かかり、その間ずっと画面が無音になる（keep-aliveの
                # 「処理中...」は、直前が検査ステータスの行だと画面へ出ない）。
                # 一度なにか届いたあとに5秒黙ったら、本文を書いている最中なので、
                # Kimiと同じ「スライドを作成中」の表示へ切り替えてTipsを回す。
                # 「何か届いたあと」に限るのは、依頼の直後の考え込みで
                # 検索より先に作成中と出さないため。
                if (
                    silent_intervals >= 1
                    and activity_seen
                    and not slide_outputted
                    and not slide_compose_announced
                ):
                    slide_compose_announced = True
                    yield {"type": "tool_use", "data": "output_slide"}
                else:
                    yield {"type": "progress", "message": "処理中..."}
                continue
            silent_intervals = 0
            activity_seen = True
            event = pending.result()
            if event is _STREAM_SENTINEL:
                break

            slide_progress_event = get_slide_progress_event()
            if slide_progress_event:
                yield slide_progress_event

            if "data" in event:
                # output_slide完了後はテキスト送信を抑制
                if not suppress_text:
                    # ツール実行でmarkdownがセットされていたら即座に送信＆抑制開始
                    generated_markdown = get_generated_markdown()
                    if generated_markdown:
                        yield {"type": "markdown", "data": generated_markdown}
                        reset_generated_markdown()
                        slide_outputted = True
                        suppress_text = True
                    else:
                        chunk = event["data"]
                        if model_type == "kimi":
                            kimi_text_buffer.append(chunk)
                        else:
                            yield {"type": "text", "data": chunk}

            elif "current_tool_use" in event:
                tool_info = event["current_tool_use"]
                tool_name = tool_info.get("name", "unknown")
                tool_input = tool_info.get("input", {})

                if model_type == "kimi" and tool_name in {"web_search", "output_slide"}:
                    kimi_slide_workflow_started = True
                    kimi_text_buffer.clear()

                # 文字列の場合はJSONパースを試みる
                if isinstance(tool_input, str):
                    try:
                        tool_input = json.loads(tool_input)
                    except json.JSONDecodeError:
                        pass

                if tool_name == "web_search":
                    web_search_executed = True
                    mark_web_search_executed()
                    # ツールの引数は複数のスナップショットに分かれて届くため、同じ検索の
                    # 「途中まで」のクエリで何度も通知が飛ぶ。1回の検索が画面へ3行ほど
                    # 積み上がるので、http_requestと同じくクエリが伸びている間は通知しない
                    # （画面側は最後の1行を書き換える）。
                    search_query = (
                        tool_input.get("query", "") if isinstance(tool_input, dict) else ""
                    )
                    is_stale = any(
                        announced.startswith(search_query)
                        for announced in announced_search_queries
                    )
                    if search_query and not is_stale:
                        announced_search_queries.append(search_query)
                        web_search_event_count += 1
                        if web_search_event_count <= 6:
                            yield {
                                "type": "tool_use",
                                "data": tool_name,
                                "query": search_query,
                            }
                elif tool_name == "http_request":
                    # KimiはURLが埋まる前のスナップショットを先に流してくる。URL無しで
                    # 通知すると、画面に「読み込み中」がURL付きと2行に分かれて立ち、
                    # どちらも「読み込みました」へ変わって二重表示になる。
                    # URLが届いてから1回だけ通知する。
                    fetch_url = tool_input.get("url", "") if isinstance(tool_input, dict) else ""
                    # 既に通知した内容と同じ、またはその途中までなら通知しない。
                    # 逆に続きが届いた場合は通知し、画面側が同じ行を書き換える。
                    is_stale = any(
                        announced.startswith(fetch_url) for announced in announced_fetch_urls
                    )
                    if fetch_url and not is_stale:
                        announced_fetch_urls.append(fetch_url)
                        yield {"type": "tool_use", "data": tool_name, "query": fetch_url}
                else:
                    yield {"type": "tool_use", "data": tool_name}

            elif "result" in event:
                result = event["result"]
                if hasattr(result, 'message') and result.message:
                    for content in getattr(result.message, 'content', []):
                        if hasattr(content, 'text') and content.text:
                            if model_type == "kimi":
                                if not kimi_slide_workflow_started:
                                    kimi_text_buffer.append(content.text)
                            else:
                                yield {"type": "text", "data": content.text}

                # ツール完了直後にマークダウンを送信（スピナーを即座に停止）
                generated_markdown = get_generated_markdown()
                if generated_markdown:
                    yield {"type": "markdown", "data": generated_markdown}
                    reset_generated_markdown()
                    slide_outputted = True
                    suppress_text = True

            pending = asyncio.ensure_future(_safe_anext(stream_iter))

    except Exception as e:
        stream_error = True
        print(f"[ERROR] Stream failed (model_type={model_type}): {e}")
        yield {"type": "error", "error": str(e)}

    # Kimiが検索結果の要約だけで停止した場合は、同じ履歴を使って出力を1回だけ完遂させる。
    if (
        model_type == "kimi"
        and web_search_executed
        and not slide_outputted
        and not stream_error
    ):
        print("[INFO] Kimi stopped after web search; retrying output_slide once")
        retry_instruction = (
            "直前のWeb検索結果と元のユーザー指示を使って、完成スライドを今すぐ作成してください。"
            "検索・説明・確認質問は追加せず、指定枚数と出典ルールを守ったMarkdownを"
            "output_slideで出力してください。"
        )
        try:
            retry_stream = agent.stream_async(retry_instruction)
            retry_iter = retry_stream.__aiter__()
            retry_pending = asyncio.ensure_future(_safe_anext(retry_iter))
            retry_output_status_sent = False

            while True:
                retry_done, _ = await asyncio.wait(
                    {retry_pending}, timeout=STREAM_KEEPALIVE_INTERVAL
                )
                if not retry_done:
                    yield {"type": "progress", "message": "スライドを仕上げています..."}
                    continue

                retry_event = retry_pending.result()
                if retry_event is _STREAM_SENTINEL:
                    break

                slide_progress_event = get_slide_progress_event()
                if slide_progress_event:
                    yield slide_progress_event

                if "current_tool_use" in retry_event:
                    retry_tool = retry_event["current_tool_use"].get("name", "unknown")
                    if retry_tool == "output_slide" and not retry_output_status_sent:
                        yield {"type": "tool_use", "data": "output_slide"}
                        retry_output_status_sent = True

                generated_markdown = get_generated_markdown()
                if generated_markdown and not slide_outputted:
                    yield {"type": "markdown", "data": generated_markdown}
                    reset_generated_markdown()
                    slide_outputted = True
                    suppress_text = True

                retry_pending = asyncio.ensure_future(_safe_anext(retry_iter))
        except Exception as e:
            stream_error = True
            print(f"[ERROR] Kimi output retry failed: {e}")
            yield {"type": "error", "error": str(e)}

    # マークダウン出力
    generated_markdown = get_generated_markdown()
    if generated_markdown:
        yield {"type": "markdown", "data": generated_markdown}

    if model_type == "kimi" and not slide_outputted and not web_search_executed and kimi_text_buffer:
        yield {"type": "text", "data": "".join(kimi_text_buffer)}

    # Web検索後にスライドが生成されなかった場合のフォールバック
    last_search_result = get_last_search_result()
    if web_search_executed and not slide_outputted and last_search_result:
        if model_type == "kimi":
            yield {
                "type": "error",
                "error": "検索は完了しましたが、スライド生成を完遂できませんでした。もう一度お試しください。",
            }
            yield {"type": "done"}
            return
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
