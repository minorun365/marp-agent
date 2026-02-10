"""Web検索ツール（Tavily API）"""

import os
from strands import tool
from tavily import TavilyClient

# Tavilyクライアント初期化（カンマ区切りで複数キー対応、枯渇時は自動フォールバック）
tavily_clients: list[TavilyClient] = [
    TavilyClient(api_key=key.strip())
    for key in os.environ.get("TAVILY_API_KEYS", "").split(",")
    if key.strip()
]

# Web検索結果用のグローバル変数
# NOTE: ContextVarはStrands Agentsがツールを別スレッドで実行するため値が共有されない
_last_search_result: str | None = None


def get_last_search_result() -> str | None:
    """最後の検索結果を取得"""
    return _last_search_result


def reset_last_search_result() -> None:
    """検索結果をリセット"""
    global _last_search_result
    _last_search_result = None


@tool
def web_search(query: str) -> str:
    """Web検索を実行して最新情報を取得します。スライド作成に必要な情報を調べる際に使用してください。

    Args:
        query: 検索クエリ（日本語または英語）

    Returns:
        検索結果のテキスト
    """
    if not tavily_clients:
        return "Web検索機能は現在利用できません（APIキー未設定）"

    # 複数APIキーで順番に試行（無料枠の月5000リクエスト制限対策）
    for client in tavily_clients:
        try:
            results = client.search(
                query=query,
                max_results=5,
                search_depth="advanced",
            )
            # レスポンス内に利用制限エラーが含まれていたら次のキーで再試行
            results_str = str(results).lower()
            if "usage limit" in results_str or "exceeds your plan" in results_str:
                continue
            # 検索結果をテキストに整形
            formatted_results = []
            for result in results.get("results", []):
                title = result.get("title", "")
                content = result.get("content", "")
                url = result.get("url", "")
                formatted_results.append(f"**{title}**\n{content}\nURL: {url}")
            search_result = "\n\n---\n\n".join(formatted_results) if formatted_results else "検索結果がありませんでした"
            global _last_search_result
            _last_search_result = search_result  # フォールバック用に保存
            return search_result
        except Exception as e:
            # rate limit系のエラーなら次のキーで再試行、それ以外は即座にエラー返却
            error_str = str(e).lower()
            if "rate limit" in error_str or "429" in error_str or "quota" in error_str or "usage limit" in error_str:
                continue
            return f"検索エラー: {str(e)}"

    # 全キー枯渇
    return "現在、利用殺到でみのるんの検索API無料枠が枯渇したようです。修正をお待ちください"
