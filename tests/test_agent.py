"""エージェント単体テスト"""
import asyncio
import sys
from pathlib import Path

# ランタイムディレクトリをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent / "amplify" / "agent" / "runtime"))

from session import get_or_create_agent
from handlers import extract_markdown
from tools import web_search


def test_web_search():
    """Web検索ツールの単体テスト"""
    print("=== Web検索テスト ===")
    query = "Claude 4 Opus 2025"
    print(f"検索クエリ: {query}\n")

    result = web_search(query)
    print(f"検索結果:\n{result[:500]}..." if len(result) > 500 else f"検索結果:\n{result}")
    print()
    return result


async def test_chat():
    """通常のチャットテスト"""
    print("=== チャットテスト ===")
    prompt = "AWSの概要を3枚のスライドで説明して"

    print(f"プロンプト: {prompt}\n")
    print("レスポンス:")

    agent = get_or_create_agent(session_id=None, model_type="sonnet")
    full_response = ""
    stream = agent.stream_async(prompt)

    async for event in stream:
        if "data" in event:
            chunk = event["data"]
            full_response += chunk
            print(chunk, end="", flush=True)

    print("\n\n=== マークダウン抽出 ===")
    markdown = extract_markdown(full_response)
    if markdown:
        print("成功！マークダウンを抽出しました:")
        print(markdown[:500] + "..." if len(markdown) > 500 else markdown)
    else:
        print("マークダウンが見つかりませんでした")


async def test_chat_with_search():
    """Web検索を使ったチャットテスト"""
    print("=== Web検索付きチャットテスト ===")
    prompt = "2025年の最新AIトレンドについて調べて、3枚のスライドにまとめて"

    print(f"プロンプト: {prompt}\n")
    print("レスポンス:")

    agent = get_or_create_agent(session_id=None, model_type="sonnet")
    full_response = ""
    stream = agent.stream_async(prompt)

    async for event in stream:
        if "data" in event:
            chunk = event["data"]
            full_response += chunk
            print(chunk, end="", flush=True)
        elif "current_tool_use" in event:
            tool_info = event["current_tool_use"]
            print(f"\n[ツール使用: {tool_info.get('name', 'unknown')}]")

    print("\n\n=== マークダウン抽出 ===")
    markdown = extract_markdown(full_response)
    if markdown:
        print("成功！マークダウンを抽出しました:")
        print(markdown[:500] + "..." if len(markdown) > 500 else markdown)
    else:
        print("マークダウンが見つかりませんでした")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", choices=["search", "chat", "chat-search", "all"], default="all")
    args = parser.parse_args()

    if args.test in ["search", "all"]:
        test_web_search()

    if args.test in ["chat", "all"]:
        asyncio.run(test_chat())

    if args.test in ["chat-search", "all"]:
        asyncio.run(test_chat_with_search())
