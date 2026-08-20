"""利用統計のための、リクエスト元の識別

AgentCoreはJWTを検証したうえでリクエストを転送する。ここではその検証済みトークンから
統計に必要な最小限（利用者を区別するハッシュと、運営者本人かどうか）だけを取り出す。

メールアドレスやCognitoのsubをそのままログへ残さない。subのハッシュだけを使うので、
同じ人が何回使ったかは数えられるが、ログから個人へはたどれない。
"""

import base64
import hashlib
import json

OWNER_GROUP = "owner"
HASH_LENGTH = 16


def _decode_jwt_payload(token: str) -> dict:
    """検証済みJWTのペイロードを読む。

    署名の検証はAgentCoreが済ませているため、ここでは行わない。
    壊れたトークンでも例外を出さず空辞書を返す（統計のためにアプリを止めない）。
    """
    parts = token.split(".")
    if len(parts) != 3:
        return {}
    payload = parts[1]
    payload += "=" * (-len(payload) % 4)
    try:
        decoded = json.loads(base64.urlsafe_b64decode(payload))
    except Exception:
        return {}
    return decoded if isinstance(decoded, dict) else {}


def _extract_bearer_token(headers) -> str:
    """Authorizationヘッダからトークン本体を取り出す。ヘッダ名の大小は問わない。"""
    if not headers:
        return ""
    try:
        items = headers.items()
    except AttributeError:
        return ""
    for name, value in items:
        if str(name).lower() != "authorization" or not value:
            continue
        parts = str(value).split(None, 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            return parts[1].strip()
    return ""


def describe_user(context) -> dict:
    """統計用の利用者情報を返す。

    トークンが取れない場合も落とさず、identified=False の結果を返す。
    """
    headers = getattr(context, "request_headers", None) if context else None
    claims = _decode_jwt_payload(_extract_bearer_token(headers))

    sub = claims.get("sub") or ""
    groups = claims.get("cognito:groups") or []
    if not isinstance(groups, list):
        groups = [groups]

    return {
        "user_hash": hashlib.sha256(sub.encode("utf-8")).hexdigest()[:HASH_LENGTH] if sub else "",
        "is_owner": OWNER_GROUP in groups,
        "identified": bool(sub),
    }


def log_session_identity(session_id, context) -> dict:
    """セッションと利用者の対応を1行のJSONでログへ出す。

    CloudWatch Logs Insights から
    `filter @message like /pawapo_session_identity/` で拾える。
    """
    info = describe_user(context)
    print(json.dumps({
        "event": "pawapo_session_identity",
        "session_id": session_id or "",
        "user_hash": info["user_hash"],
        "is_owner": info["is_owner"],
        "identified": info["identified"],
    }, ensure_ascii=False))
    return info
