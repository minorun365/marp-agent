"""web_search ツールのユニットテスト（外部API不要）"""
from unittest.mock import patch, MagicMock

import pytest

from tools.web_search import (
    web_search,
    get_last_search_result,
    reset_last_search_result,
)


@pytest.fixture(autouse=True)
def reset_search_state():
    reset_last_search_result()
    yield
    reset_last_search_result()


def test_reset_last_search_result():
    """検索結果のリセット"""
    reset_last_search_result()
    assert get_last_search_result() is None


def test_web_search_no_api_key():
    """APIキー未設定の場合はエラーメッセージを返す"""
    with patch("tools.web_search.tavily_clients", []):
        result = web_search(query="test query")
        assert "利用できません" in result


def test_web_search_formats_results():
    """検索結果を正しくフォーマットする"""
    mock_client = MagicMock()
    mock_client.search.return_value = {
        "results": [
            {"title": "Test Title", "content": "Test content", "url": "https://example.com"},
            {"title": "Title 2", "content": "Content 2", "url": "https://example2.com"},
        ]
    }

    with patch("tools.web_search.tavily_clients", [mock_client]):
        result = web_search(query="test")

    assert "Test Title" in result
    assert "Test content" in result
    assert "https://example.com" in result
    assert "---" in result  # セパレータ


def test_web_search_empty_results():
    """検索結果が空の場合"""
    mock_client = MagicMock()
    mock_client.search.return_value = {"results": []}

    with patch("tools.web_search.tavily_clients", [mock_client]):
        result = web_search(query="test")

    assert "検索結果がありませんでした" in result


def test_web_search_api_error():
    """API例外時はエラーメッセージを返す"""
    mock_client = MagicMock()
    mock_client.search.side_effect = Exception("Connection error")

    with patch("tools.web_search.tavily_clients", [mock_client]):
        result = web_search(query="test")

    assert "検索エラー" in result


def test_web_search_rate_limit_fallback():
    """Rate limit時に次のクライアントにフォールバックする"""
    mock_client1 = MagicMock()
    mock_client1.search.side_effect = Exception("rate limit exceeded")

    mock_client2 = MagicMock()
    mock_client2.search.return_value = {
        "results": [{"title": "OK", "content": "Fallback", "url": "https://ok.com"}]
    }

    with patch("tools.web_search.tavily_clients", [mock_client1, mock_client2]):
        result = web_search(query="test")

    assert "OK" in result
    assert "Fallback" in result


def test_web_search_stops_after_six_calls():
    """1依頼で7回目以降は外部検索を実行しない"""
    mock_client = MagicMock()
    mock_client.search.return_value = {
        "results": [{"title": "OK", "content": "Result", "url": "https://example.com"}]
    }

    with patch("tools.web_search.tavily_clients", [mock_client]):
        for index in range(6):
            assert "OK" in web_search(query=f"query {index}")
        result = web_search(query="query 7")

    assert "上限6回" in result
    assert mock_client.search.call_count == 6


# ── 検索の実行先の切り替え（試験用のGrok+AgentCore Web Search） ────────────


def test_search_backend_defaults_to_tavily():
    from tools.web_search import get_search_backend

    reset_last_search_result()
    assert get_search_backend() == "tavily"


def test_reset_returns_backend_to_tavily():
    """実行先はリクエストごとに決め直す。前のリクエストの選択を持ち越さない。"""
    from tools.web_search import get_search_backend, set_search_backend

    set_search_backend("agentcore")
    assert get_search_backend() == "agentcore"
    reset_last_search_result()
    assert get_search_backend() == "tavily"


def test_agentcore_backend_skips_tavily():
    from tools.web_search import set_search_backend

    tavily = MagicMock()
    set_search_backend("agentcore")
    with patch("tools.web_search.tavily_clients", [tavily]), \
         patch("tools.web_search._search_with_agentcore", return_value="AgentCoreの結果"):
        result = web_search(query="test")

    assert result == "AgentCoreの結果"
    assert get_last_search_result() == "AgentCoreの結果"
    tavily.search.assert_not_called()


def test_agentcore_failure_falls_back_to_tavily():
    """試験中に検索が止まると資料が作れないので、落ちたらTavilyで続行する。"""
    from tools.web_search import set_search_backend

    tavily = MagicMock()
    tavily.search.return_value = {
        "results": [{"title": "T", "content": "C", "url": "https://example.com"}]
    }
    set_search_backend("agentcore")
    with patch("tools.web_search.tavily_clients", [tavily]), \
         patch("tools.web_search._search_with_agentcore", return_value=None):
        result = web_search(query="test")

    tavily.search.assert_called_once()
    assert "https://example.com" in result
