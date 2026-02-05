"""web_search ツールのユニットテスト（外部API不要）"""
from unittest.mock import patch, MagicMock

from tools.web_search import (
    web_search,
    get_last_search_result,
    reset_last_search_result,
)


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
