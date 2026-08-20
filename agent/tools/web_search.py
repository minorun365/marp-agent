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
    global _search_call_count, _last_search_result
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

    if tavily_clients:
        result = _search_with_current_keys(query)
        if result is not None:
            return result

        # 全キーが使えなかった。キーを差し替えた直後かもしれないので1度だけ読み直す。
        if _refresh_tavily_clients():
            result = _search_with_current_keys(query)
            if result is not None:
                return result
        print(f"[ERROR] Tavilyのキー{len(tavily_clients)}本すべてが使えませんでした")
    else:
        print("[WARN] TavilyのAPIキーが設定されていません")

    # Tavilyが尽きたときの受け皿。AgentCoreのWeb Searchは無料枠ではなくAWSの従量課金
    # （$7/1,000クエリ）なので、キーの復旧を待たずに検索を続けられる。
    # 日本語の固有名詞にはTavilyのほうが強いため、あくまで代役として後ろに置く。
    agentcore_result = _search_with_agentcore(query)
    if agentcore_result is not None:
        print("[INFO] Tavilyが枯渇したためAgentCore Web Searchで代替しました")
        _last_search_result = agentcore_result
        return agentcore_result

    return "現在、利用殺到でみのるんの検索API無料枠が枯渇したようです。修正をお待ちください"


def _demote_client(dead_client: TavilyClient) -> None:
    """使えなかったキーを末尾へ回す。

    枯渇したキーが先頭にいると、検索のたびに1回ずつ無駄打ちしてから
    次のキーへ移ることになり、そのぶん待ち時間が伸びる。
    """
    global tavily_clients
    remaining = [client for client in tavily_clients if client is not dead_client]
    if remaining:
        tavily_clients = remaining + [dead_client]


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
            _demote_client(client)
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


# ── AgentCore Web Search（試験用） ────────────────────────────────
# AgentCore GatewayにWeb Searchコネクタを1つぶら下げ、MCPの tools/call をSigV4で叩く。
# Tavilyと違ってAPIキーが要らず、料金はAWSからの請求になるためクレジットで払える。
# Gatewayを経由するのは、コネクタを直接呼ぶ公開APIが無いため（2026-08-20時点）。
AGENTCORE_SEARCH_MAX_RESULTS = 3
AGENTCORE_SEARCH_TIMEOUT_SECONDS = 30


def _agentcore_gateway_url() -> str:
    url = os.environ.get("AGENTCORE_WEBSEARCH_GATEWAY_URL", "").strip().rstrip("/")
    if not url:
        return ""
    # CloudFormationが返すGatewayのURLは末尾の /mcp を含む場合と含まない場合がある。
    return url if url.endswith("/mcp") else f"{url}/mcp"


def _agentcore_region(url: str) -> str:
    # https://<id>.gateway.bedrock-agentcore.<region>.amazonaws.com/mcp
    parts = url.split(".")
    for index, part in enumerate(parts):
        if part == "bedrock-agentcore" and index + 1 < len(parts):
            return parts[index + 1]
    return os.environ.get("AWS_REGION", "us-east-1")


def _extract_json_payload(raw_body: str) -> dict:
    """MCPのStreamable HTTPはJSONとSSEのどちらでも返る。両方を受ける。"""
    stripped = raw_body.lstrip()
    if stripped.startswith("{"):
        return json.loads(stripped)
    for line in raw_body.splitlines():
        if line.startswith("data:"):
            return json.loads(line[len("data:"):].strip())
    raise ValueError(f"MCPの応答を解釈できませんでした: {raw_body[:200]}")


def _search_with_agentcore(query: str) -> str | None:
    """AgentCoreのWeb Searchで検索する。使えなければNoneを返す。"""
    url = _agentcore_gateway_url()
    if not url:
        print("[WARN] AGENTCORE_WEBSEARCH_GATEWAY_URL が未設定です")
        return None

    # botocore はランタイムのコンテナにだけ入っている。テスト環境を壊さないよう遅延importする。
    import urllib.error
    import urllib.request

    from botocore.auth import SigV4Auth
    from botocore.awsrequest import AWSRequest
    from botocore.session import Session

    tool_name = os.environ.get(
        "AGENTCORE_WEBSEARCH_TOOL_NAME", "web-search-tool___WebSearch"
    )
    body = json.dumps({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": {"query": query[:200], "maxResults": AGENTCORE_SEARCH_MAX_RESULTS},
        },
    }).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-03-26",
    }

    try:
        credentials = Session().get_credentials()
        if credentials is None:
            print("[WARN] AgentCore Web Search: AWS認証情報を取得できませんでした")
            return None
        signed = AWSRequest(method="POST", url=url, data=body, headers=headers)
        SigV4Auth(
            credentials.get_frozen_credentials(), "bedrock-agentcore", _agentcore_region(url)
        ).add_auth(signed)

        request = urllib.request.Request(
            url, data=body, headers=dict(signed.headers), method="POST"
        )
        with urllib.request.urlopen(
            request, timeout=AGENTCORE_SEARCH_TIMEOUT_SECONDS
        ) as response:
            payload = _extract_json_payload(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:300]
        print(f"[WARN] AgentCore Web Searchが失敗しました（HTTP {error.code}）: {detail}")
        return None
    except Exception as error:
        print(f"[WARN] AgentCore Web Searchが失敗しました（{type(error).__name__}: {error}）")
        return None

    if "error" in payload:
        print(f"[WARN] AgentCore Web Searchがエラーを返しました: {str(payload['error'])[:300]}")
        return None

    result = payload.get("result", {})
    if result.get("isError"):
        print(f"[WARN] AgentCore Web Searchがエラー応答を返しました: {str(result)[:300]}")
        return None

    contents = result.get("content") or []
    if not contents:
        return "検索結果がありませんでした"
    try:
        rows = json.loads(contents[0].get("text", "{}")).get("results", [])
    except json.JSONDecodeError:
        print("[WARN] AgentCore Web Searchの結果を解釈できませんでした")
        return None

    formatted_results = []
    for row in rows:
        title = row.get("title") or row.get("url", "")
        text = row.get("text", "")
        source_url = row.get("url", "")
        formatted_results.append(f"**{title}**\n{text}\nURL: {source_url}")

    print(f"[INFO] AgentCore Web Searchで{len(rows)}件取得しました")
    return "\n\n---\n\n".join(formatted_results) if formatted_results else "検索結果がありませんでした"
