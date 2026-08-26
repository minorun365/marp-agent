"""web_search ツールのユニットテスト（外部API不要）"""
from unittest.mock import patch, MagicMock

import pytest

from tools.web_search import (
    web_search,
    get_last_search_result,
    get_search_result_urls,
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
    """APIキーもAgentCoreも無い場合は、案内文を返して検索を諦める。

    キーが無いときはAgentCoreのWeb Searchを試すようになったので、
    「両方だめだったとき」だけがこの経路になる。
    """
    with patch("tools.web_search.tavily_clients", []), \
         patch("tools.web_search._search_with_agentcore", return_value=None):
        result = web_search(query="test query")
        assert "枯渇" in result


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


def test_search_urls_accumulate_across_queries_without_duplicates():
    """複数回の検索結果を、機械的な参考文献補完へ渡せる。"""
    mock_client = MagicMock()
    mock_client.search.side_effect = [
        {
            "results": [
                {"title": "A", "content": "A", "url": "https://example.com/a"},
                {"title": "共通", "content": "共通", "url": "https://example.com/common"},
            ]
        },
        {
            "results": [
                {"title": "B", "content": "B", "url": "https://example.com/b"},
                {"title": "共通", "content": "共通", "url": "https://example.com/common"},
            ]
        },
    ]

    with patch("tools.web_search.tavily_clients", [mock_client]):
        web_search(query="first")
        web_search(query="second")

    assert get_search_result_urls() == [
        "https://example.com/a",
        "https://example.com/common",
        "https://example.com/b",
    ]


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


def test_web_search_stops_after_call_limit():
    """1依頼で上限を超えたら外部検索を実行しない（上限は定数から取る）"""
    from tools.web_search import MAX_SEARCH_CALLS

    mock_client = MagicMock()
    mock_client.search.return_value = {
        "results": [{"title": "OK", "content": "Result", "url": "https://example.com"}]
    }

    with patch("tools.web_search.tavily_clients", [mock_client]):
        for index in range(MAX_SEARCH_CALLS):
            assert "OK" in web_search(query=f"query {index}")
        result = web_search(query="over the limit")

    assert f"上限{MAX_SEARCH_CALLS}回" in result
    assert mock_client.search.call_count == MAX_SEARCH_CALLS


def test_search_call_limit_stays_small():
    """上限そのものが増えていないことを見張る。

    「最大6回まで」と書いていた頃、モデルはそれを予算とみなして毎回使い切り、
    1依頼でTavilyのクレジットを6消費していた（2026-08-22）。
    """
    from tools.web_search import MAX_SEARCH_CALLS

    assert MAX_SEARCH_CALLS <= 3


# ── Tavilyが枯渇したときのAgentCore Web Searchへの自動フォールバック ────────


def test_agentcore_is_not_used_while_tavily_works():
    """Tavilyで引けている間はAgentCoreを呼ばない（無駄な課金をしない）。"""
    tavily = MagicMock()
    tavily.search.return_value = {
        "results": [{"title": "T", "content": "C", "url": "https://example.com"}]
    }
    with patch("tools.web_search.tavily_clients", [tavily]), \
         patch("tools.web_search._search_with_agentcore") as agentcore:
        result = web_search(query="test")

    agentcore.assert_not_called()
    assert "https://example.com" in result


def test_falls_back_to_agentcore_when_all_keys_are_exhausted():
    """全キーが枯渇したら、エラーを返す前にAgentCoreで代替する。"""
    with patch("tools.web_search.tavily_clients", [MagicMock()]), \
         patch("tools.web_search._search_with_current_keys", return_value=None), \
         patch("tools.web_search._refresh_tavily_clients", return_value=False), \
         patch("tools.web_search._search_with_agentcore", return_value="AgentCoreの結果"):
        result = web_search(query="test")

    assert result == "AgentCoreの結果"
    assert get_last_search_result() == "AgentCoreの結果"


def test_falls_back_to_agentcore_when_no_key_is_configured():
    """キーが1本も無い場合も、諦める前にAgentCoreを試す。"""
    with patch("tools.web_search.tavily_clients", []), \
         patch("tools.web_search._search_with_agentcore", return_value="AgentCoreの結果"):
        result = web_search(query="test")

    assert result == "AgentCoreの結果"


def test_reports_exhaustion_only_when_agentcore_also_fails():
    with patch("tools.web_search.tavily_clients", [MagicMock()]), \
         patch("tools.web_search._search_with_current_keys", return_value=None), \
         patch("tools.web_search._refresh_tavily_clients", return_value=False), \
         patch("tools.web_search._search_with_agentcore", return_value=None):
        result = web_search(query="test")

    assert "枯渇" in result
