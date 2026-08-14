"""利用統計用の利用者識別のユニットテスト。"""

import base64
import hashlib
import json

from identity import describe_user, log_session_identity


def _make_token(claims: dict) -> str:
    """署名を検証しない前提のダミーJWTを組み立てる。"""
    def seg(obj):
        raw = json.dumps(obj).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")

    return f"{seg({'alg': 'RS256'})}.{seg(claims)}.signature"


class _Context:
    def __init__(self, headers):
        self.request_headers = headers


def _ctx(claims: dict, header_name: str = "Authorization"):
    return _Context({header_name: f"Bearer {_make_token(claims)}"})


def test_sub_is_hashed_and_not_stored_raw():
    sub = "8f14e45f-ea4d-4b3a-9f2e-1c7bf9f0a111"
    info = describe_user(_ctx({"sub": sub}))

    assert info["identified"] is True
    assert info["user_hash"] == hashlib.sha256(sub.encode("utf-8")).hexdigest()[:16]
    assert sub not in info["user_hash"]


def test_same_user_gets_same_hash():
    claims = {"sub": "same-user-id"}
    assert describe_user(_ctx(claims))["user_hash"] == describe_user(_ctx(claims))["user_hash"]


def test_different_users_get_different_hashes():
    a = describe_user(_ctx({"sub": "user-a"}))["user_hash"]
    b = describe_user(_ctx({"sub": "user-b"}))["user_hash"]
    assert a != b


def test_owner_group_is_detected():
    info = describe_user(_ctx({"sub": "x", "cognito:groups": ["owner"]}))
    assert info["is_owner"] is True


def test_other_groups_are_not_owner():
    info = describe_user(_ctx({"sub": "x", "cognito:groups": ["testers"]}))
    assert info["is_owner"] is False


def test_no_group_claim_is_not_owner():
    assert describe_user(_ctx({"sub": "x"}))["is_owner"] is False


def test_header_name_is_case_insensitive():
    assert describe_user(_ctx({"sub": "x"}, header_name="authorization"))["identified"] is True


def test_missing_context_does_not_raise():
    info = describe_user(None)
    assert info == {"user_hash": "", "is_owner": False, "identified": False}


def test_missing_headers_does_not_raise():
    assert describe_user(_Context(None))["identified"] is False


def test_broken_token_does_not_raise():
    info = describe_user(_Context({"Authorization": "Bearer not-a-jwt"}))
    assert info["identified"] is False


def test_non_bearer_scheme_is_ignored():
    assert describe_user(_Context({"Authorization": "Basic abc"}))["identified"] is False


def test_log_line_is_single_json_and_has_no_raw_sub(capsys):
    sub = "raw-subject-value"
    info = log_session_identity("session-123", _ctx({"sub": sub, "cognito:groups": ["owner"]}))

    out = capsys.readouterr().out.strip()
    assert out.count("\n") == 0
    payload = json.loads(out)
    assert payload["event"] == "pawapo_session_identity"
    assert payload["session_id"] == "session-123"
    assert payload["is_owner"] is True
    assert payload["user_hash"] == info["user_hash"]
    assert sub not in out


def test_log_line_written_even_without_token(capsys):
    log_session_identity(None, None)
    payload = json.loads(capsys.readouterr().out.strip())
    assert payload["identified"] is False
    assert payload["session_id"] == ""
