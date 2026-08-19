"""Web検索ツール（Tavily API）"""

import os
import json
import time

import boto3
from strands import tool
from tavily import TavilyClient

try:
    # キー単位で「このキーは使えない」を意味する例外。文字列ではなく型で判定する。
    from tavily.errors import (
        ForbiddenError,
        InvalidAPIKeyError,
        UsageLimitExceededError,
    )

    KEY_LEVEL_ERRORS: tuple[type[Exception], ...] = (
        UsageLimitExceededError,
        ForbiddenError,
        InvalidAPIKeyError,
    )
except ImportError:  # SDKの構成が変わっても検索自体は動かす
    KEY_LEVEL_ERRORS = ()

from .http_request import get_url_fetched


def _load_tavily_api_keys() -> list[str]:
    """環境変数、またはSecrets ManagerからTavily APIキーを読み込む。"""
    raw_value = os.environ.get("TAVILY_API_KEYS", "").strip()
    secret_arn = os.environ.get("TAVILY_SECRET_ARN", "").strip()
    if not raw_value and secret_arn:
        try:
            response = boto3.client("secretsmanager").get_secret_value(SecretId=secret_arn)
            raw_value = response.get("SecretString", "").strip()
            if raw_value.startswith("{"):
                secret_json = json.loads(raw_value)
                raw_value = str(secret_json.get("TAVILY_API_KEYS", "")).strip()
        except Exception as error:
            print(f"[ERROR] Tavily APIキーをSecrets Managerから取得できませんでした: {type(error).__name__}")

    return [key.strip() for key in raw_value.split(",") if key.strip()]


# カンマ区切りで複数キー対応、枯渇時は自動フォールバック
tavily_clients: list[TavilyClient] = [
    TavilyClient(api_key=key)
    for key in _load_tavily_api_keys()
]
# 何本読めたかを起動時に残す。本番で「キーが1本しか入っていない」ことに
# 気づけず、フォールバックの不具合と切り分けられなかったため（2026-08-20）。
print(f"[INFO] Tavily APIキーを{len(tavily_clients)}本読み込みました")

# キーの読み直しの間隔（秒）。全キーが使えないときだけ読み直す。
CLIENT_REFRESH_INTERVAL_SECONDS = 60.0
_last_client_refresh = 0.0


def _refresh_tavily_clients() -> bool:
    """Secrets Managerを読み直してクライアントを作り直す。

    キーはモジュール読み込み時に1度だけ取得するため、枯渇したキーを差し替えても
    動いているコンテナには反映されず、再デプロイするまで検索が止まったままになる
    （2026-08-20に実際に起きた）。全キーが使えなくなった時だけ読み直す。
    """
    global tavily_clients, _last_client_refresh

    now = time.monotonic()
    if _last_client_refresh and now - _last_client_refresh < CLIENT_REFRESH_INTERVAL_SECONDS:
        return False
    _last_client_refresh = now

    keys = _load_tavily_api_keys()
    if not keys:
        return False
    tavily_clients = [TavilyClient(api_key=key) for key in keys]
    print(f"[INFO] Tavily APIキーを読み直しました（{len(tavily_clients)}本）")
    return True

# Web検索結果用のグローバル変数
# NOTE: ContextVarはStrands Agentsがツールを別スレッドで実行するため値が共有されない
_last_search_result: str | None = None
_search_call_count: int = 0
MAX_SEARCH_CALLS = 6
# ユーザーがURLを貼っている場合、その記事がスライドの主役になる。
# 補足の検索まで禁止はしないが、検索へ脱線して記事の主張が薄まるのを実装側で止める。
MAX_SEARCH_CALLS_WITH_URL = 2


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
    - **ユーザーがURLを貼っている場合は、そのページの内容でスライドを作る。** 記事が前提としている
      用語をどうしても補うときだけ検索し、その場合も最大2回まで（実装側でも制限している）
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
    url_fetched = get_url_fetched()
    call_limit = MAX_SEARCH_CALLS_WITH_URL if url_fetched else MAX_SEARCH_CALLS
    if _search_call_count >= call_limit:
        if url_fetched:
            return (
                f"Web検索は上限{call_limit}回に達しました。ユーザーが貼ったURLの本文が主役の資料です。"
                "取得済みのページ内容だけを使って、今すぐスライドを作成してください。"
            )
        return "Web検索は上限6回に達しました。これまでの検索結果だけを使ってスライドを作成してください。"
    _search_call_count += 1

    if not tavily_clients:
        return "Web検索機能は現在利用できません（APIキー未設定）"

    result = _search_with_current_keys(query)
    if result is not None:
        return result

    # 全キーが使えなかった。キーを差し替えた直後かもしれないので1度だけ読み直す。
    if _refresh_tavily_clients():
        result = _search_with_current_keys(query)
        if result is not None:
            return result

    print(f"[ERROR] Tavilyのキー{len(tavily_clients)}本すべてが使えませんでした")
    return "現在、利用殺到でみのるんの検索API無料枠が枯渇したようです。修正をお待ちください"


def _search_with_current_keys(query: str) -> str | None:
    """いま持っているキーを順に試す。全部使えなければNoneを返す。"""
    # 複数APIキーで順番に試行（無料枠の月5000リクエスト制限対策）
    for key_number, client in enumerate(tavily_clients, start=1):
        try:
            results = client.search(
                query=query,
                max_results=3,
                search_depth="basic",
            )
            # レスポンス内に利用制限エラーが含まれていたら次のキーで再試行
            results_str = str(results).lower()
            if "usage limit" in results_str or "exceeds your plan" in results_str:
                print(f"[WARN] Tavilyキー{key_number}: 利用上限の応答。次のキーへ切り替えます")
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
        except KEY_LEVEL_ERRORS as e:
            # 枯渇・停止・無効キーはこのキーの問題なので、必ず次のキーを試す。
            # SDKはHTTP 429/432/433でも本文の形によってはメッセージが空の例外を投げる。
            # 以前は文字列に「usage limit」等が含まれるかで判定していたため、
            # 空メッセージだと1本目で打ち切られ、残りのキーへ切り替わらなかった。
            print(f"[WARN] Tavilyキー{key_number}が使えません（{type(e).__name__}: {e}）。次のキーへ切り替えます")
            continue
        except Exception as e:
            error_str = str(e).lower()
            if any(
                marker in error_str
                for marker in ("rate limit", "429", "quota", "usage limit", "timed out", "timeout")
            ):
                print(f"[WARN] Tavilyキー{key_number}で一時的なエラー（{type(e).__name__}）。次のキーへ切り替えます")
                continue
            print(f"[ERROR] Tavilyキー{key_number}で想定外のエラー: {type(e).__name__}: {e}")
            return f"検索エラー: {str(e)}"

    return None
