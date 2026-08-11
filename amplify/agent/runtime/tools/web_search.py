"""Web検索ツール（Tavily API）"""

import json
import os
from functools import lru_cache

import boto3
from strands import tool
from tavily import TavilyClient

@lru_cache(maxsize=1)
def _load_tavily_api_keys() -> tuple[str, ...]:
    """Secrets Managerを優先し、旧環境だけ平文環境変数へフォールバックする。"""
    secret_id = os.environ.get("TAVILY_API_KEYS_SECRET_ID", "").strip()
    raw_keys = ""

    if secret_id:
        response = boto3.client("secretsmanager").get_secret_value(SecretId=secret_id)
        raw_keys = response.get("SecretString", "")
        if raw_keys.lstrip().startswith("{"):
            raw_keys = json.loads(raw_keys).get("TAVILY_API_KEYS", "")
    else:
        raw_keys = os.environ.get("TAVILY_API_KEYS", "")

    return tuple(key.strip() for key in raw_keys.split(",") if key.strip())


@lru_cache(maxsize=1)
def _get_tavily_clients() -> tuple[TavilyClient, ...]:
    return tuple(TavilyClient(api_key=key) for key in _load_tavily_api_keys())


# 既存コードとテスト向けの互換ポイント。通常実行時はNoneのため、
# Secrets Managerから遅延ロードする。テストではクライアント一覧へ差し替えられる。
tavily_clients: tuple[TavilyClient, ...] | list[TavilyClient] | None = None

# Web検索結果用のグローバル変数
# NOTE: ContextVarはStrands Agentsがツールを別スレッドで実行するため値が共有されない
_last_search_result: str | None = None
_search_call_count: int = 0
MAX_SEARCH_CALLS = 6


def get_last_search_result() -> str | None:
    """最後の検索結果を取得"""
    return _last_search_result


def reset_last_search_result() -> None:
    """検索結果をリセット"""
    global _last_search_result, _search_call_count
    _last_search_result = None
    _search_call_count = 0


@tool
def web_search(query: str) -> str:
    """Web検索を実行して最新情報を取得します。最新の統計・事例・製品情報など、スライド作成に必要な情報を調べる際に使用してください。

    ## 使い方のルール

    - 検索結果が不十分な場合は異なるクエリで再検索してOK。ただし1回の依頼につき最大6回まで
    - 製品仕様・料金・セキュリティ・提供状況は、ベンダー公式ドメインを `site:` で指定して先に検索する。公式情報がある重要事実を第三者ブログだけで断定しない
    - Web検索時は最後のスライドに `<!-- _class: tinytext -->` 付きの参考文献スライドを追加すること
    - エラー時（APIキー未設定・rate limit・usage limit等）はスライドを作成せず、「利用殺到でみのるんの検索API無料枠が枯渇したようです。Xで本人（@minorun365）に教えてあげてください。修正をお待ちください」と案内する
    - 検索結果のsnippetだけでスライドは十分作れる。検索結果のURLにhttp_requestでアクセスしてはいけない

    Args:
        query: 検索クエリ（日本語または英語）

    Returns:
        検索結果のテキスト
    """
    global _search_call_count
    if _search_call_count >= MAX_SEARCH_CALLS:
        return "Web検索は上限6回に達しました。これまでの検索結果だけを使ってスライドを作成してください。"
    _search_call_count += 1

    try:
        clients = tavily_clients if tavily_clients is not None else _get_tavily_clients()
    except Exception:
        return "Web検索機能は現在利用できません（APIキーの読み込みエラー）"

    if not clients:
        return "Web検索機能は現在利用できません（APIキー未設定）"

    # 複数APIキーで順番に試行（無料枠の月5000リクエスト制限対策）
    for client in clients:
        try:
            results = client.search(
                query=query,
                max_results=3,
                search_depth="basic",
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
