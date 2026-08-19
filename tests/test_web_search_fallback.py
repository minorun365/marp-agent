"""Tavilyキーのフォールバックのテスト。

2026-08-20、本番で1本目のキーが枯渇したまま次のキーへ切り替わらず、Web検索が
止まった。原因は「例外メッセージに usage limit 等が含まれるか」で判定していたこと。
TavilyのSDKはHTTP 429/432/433でも、応答本文の形によっては**メッセージが空の例外**を
投げるため、その場合どの語にも当たらず1本目で打ち切られていた。
"""

import importlib

import pytest

from tavily.errors import ForbiddenError, InvalidAPIKeyError, UsageLimitExceededError

# tools/__init__.py が同名の関数を再エクスポートしているため、モジュール本体を取る
web_search_module = importlib.import_module("tools.web_search")


class _StubClient:
    """search()で決められた振る舞いをするTavilyClientの代役。"""

    def __init__(self, behaviour):
        self.behaviour = behaviour
        self.calls = 0

    def search(self, **_kwargs):
        self.calls += 1
        if isinstance(self.behaviour, Exception):
            raise self.behaviour
        return self.behaviour


SUCCESS = {"results": [{"title": "タイトル", "content": "本文", "url": "https://example.com"}]}


@pytest.fixture(autouse=True)
def _reset_search_state():
    web_search_module.reset_last_search_result()
    yield
    web_search_module.reset_last_search_result()


@pytest.mark.parametrize(
    "first_error",
    [
        # 本番で起きた形。メッセージが空でも次のキーへ進むこと
        UsageLimitExceededError(""),
        ForbiddenError(""),
        InvalidAPIKeyError(""),
        # 従来から拾えていた形も引き続き通ること
        ForbiddenError("This request exceeds your plan's set usage limit."),
    ],
)
def test_falls_back_to_the_next_key(monkeypatch, first_error):
    dead = _StubClient(first_error)
    alive = _StubClient(SUCCESS)
    monkeypatch.setattr(web_search_module, "tavily_clients", [dead, alive])

    result = web_search_module.web_search("テスト")

    assert dead.calls == 1
    assert alive.calls == 1
    assert "https://example.com" in result


def test_reports_exhaustion_only_after_every_key(monkeypatch):
    clients = [_StubClient(UsageLimitExceededError("")) for _ in range(3)]
    monkeypatch.setattr(web_search_module, "tavily_clients", clients)

    result = web_search_module.web_search("テスト")

    assert [c.calls for c in clients] == [1, 1, 1]
    assert "枯渇" in result


def test_unexpected_error_stops_immediately(monkeypatch):
    """キーの問題ではないエラーで、残りのキーまで無駄打ちしない。"""
    broken = _StubClient(ValueError("想定外"))
    unused = _StubClient(SUCCESS)
    monkeypatch.setattr(web_search_module, "tavily_clients", [broken, unused])

    result = web_search_module.web_search("テスト")

    assert unused.calls == 0
    assert "検索エラー" in result


def test_reloads_keys_from_the_secret_when_every_key_is_dead(monkeypatch):
    """キーを差し替えたら、再デプロイなしで次の検索から使えること。

    キーはモジュール読み込み時に1度しか取らないため、Secrets Managerを更新しても
    動いているコンテナには届かず、検索が止まったままになる（2026-08-20に発生）。
    """
    dead = _StubClient(UsageLimitExceededError(""))
    fresh = _StubClient(SUCCESS)
    monkeypatch.setattr(web_search_module, "tavily_clients", [dead])
    monkeypatch.setattr(web_search_module, "_last_client_refresh", 0.0)

    def fake_refresh():
        web_search_module.tavily_clients = [fresh]
        return True

    monkeypatch.setattr(web_search_module, "_refresh_tavily_clients", fake_refresh)

    result = web_search_module.web_search("テスト")

    assert dead.calls == 1
    assert fresh.calls == 1
    assert "https://example.com" in result


def test_does_not_reload_more_than_once_per_interval(monkeypatch):
    """読み直しの間隔内なら、Secrets Managerを叩き直さない。"""
    monkeypatch.setattr(web_search_module, "tavily_clients", [_StubClient(SUCCESS)])
    monkeypatch.setattr(web_search_module, "_last_client_refresh", 0.0)
    calls = []
    monkeypatch.setattr(
        web_search_module,
        "_load_tavily_api_keys",
        lambda: calls.append(1) or ["key-a", "key-b"],
    )

    assert web_search_module._refresh_tavily_clients() is True
    assert web_search_module._refresh_tavily_clients() is False
    assert len(calls) == 1
