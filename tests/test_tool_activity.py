"""ツールの実行状況の記録と、無音検知の判定のユニットテスト。

この判定が壊れると、画面のステータスが次のどちらかに倒れる。どちらも過去に本番で
起きているので、両方向を検体として持つ。

- 実行中なのに「終わった」と見る → 検索中に「スライドを作成中」を先出しし、
  検索の行が完了へ化けて表示順が壊れる（2026-08-20）
- 終わっているのに「実行中」と見る → 検索後の長考の間ずっと「Web検索中...」が
  回り続け、そのままスライドが出てくる（2026-09-20、Kimi K3で39.9秒を実測）
"""
import inspect
import time

import pytest

from tools.tool_activity import (
    get_last_finished_at,
    is_tool_active,
    is_tool_running,
    is_waiting_for_compose,
    reset_tool_activity,
    seconds_since_last_finish,
    track_tool_activity,
)


@pytest.fixture(autouse=True)
def reset_activity():
    reset_tool_activity()
    yield
    reset_tool_activity()


def test_未通知なら実行中とみなさない():
    assert is_tool_active(None) is False


def test_通知したが完了の記録がまだなら実行中とみなす():
    """開始を通知してからツール関数が呼ばれるまでの隙間。ここで倒れると2026-08-20の再発。"""
    assert is_tool_active(time.monotonic()) is True


def test_ツールが動いている間は実行中とみなす():
    seen = {}

    @track_tool_activity
    def slow_tool():
        seen["running"] = is_tool_running()
        seen["active"] = is_tool_active(started_at)
        return "ok"

    started_at = time.monotonic()
    assert slow_tool() == "ok"
    assert seen["running"] is True
    assert seen["active"] is True


def test_通知より後に完了していれば実行中とみなさない():
    """2026-09-20の不具合。ここがTrueのままだと「Web検索中...」が回り続ける。"""

    @track_tool_activity
    def quick_tool():
        return "ok"

    started_at = time.monotonic()
    quick_tool()

    assert is_tool_running() is False
    assert get_last_finished_at() is not None
    assert get_last_finished_at() >= started_at
    assert is_tool_active(started_at) is False


def test_前回の完了は次の通知には効かない():
    """完了の記録が残っていても、そのあと始めた別のツールは実行中として扱う。"""

    @track_tool_activity
    def quick_tool():
        return "ok"

    quick_tool()
    time.sleep(0.01)
    later = time.monotonic()

    assert is_tool_active(later) is True


def test_並列で呼ばれても本数で数える():
    """Kimi K3は検索を2件ずつ並列で呼ぶ。1件返っただけで実行中を解除しない。"""
    observed = {}

    @track_tool_activity
    def outer():
        @track_tool_activity
        def inner():
            return "inner"

        inner()
        # 内側が終わっても、外側はまだ動いている。
        observed["running_after_inner"] = is_tool_running()
        observed["active_after_inner"] = is_tool_active(started_at)
        return "outer"

    started_at = time.monotonic()
    outer()

    assert observed["running_after_inner"] is True
    assert observed["active_after_inner"] is True
    assert is_tool_running() is False


def test_例外で落ちても完了として記録する():
    """記録が残らないと、以降ずっと実行中とみなされて画面が固まる。"""

    @track_tool_activity
    def failing_tool():
        raise RuntimeError("boom")

    started_at = time.monotonic()
    with pytest.raises(RuntimeError):
        failing_tool()

    assert is_tool_running() is False
    assert is_tool_active(started_at) is False


def test_リセットで状態が消える():
    @track_tool_activity
    def quick_tool():
        return "ok"

    quick_tool()
    reset_tool_activity()

    assert is_tool_running() is False
    assert get_last_finished_at() is None


def test_デコレータが関数の仕様を保つ():
    """strandsの@toolはdocstringと型ヒントから引数の仕様を作る。包んでも壊さない。"""

    @track_tool_activity
    def sample(query: str) -> str:
        """検索クエリを受け取る。"""
        return query

    assert sample.__name__ == "sample"
    assert sample.__doc__ == "検索クエリを受け取る。"
    assert list(inspect.signature(sample).parameters) == ["query"]


def test_ツールを一度も使っていなければ本文執筆と判断しない():
    """検索なしの依頼はkeep-aliveの無音検知が担当する。ここで先走らない。"""
    assert seconds_since_last_finish() is None
    assert is_waiting_for_compose(None, 3.0) is False


def test_ツールが動いている間は本文執筆と判断しない():
    observed = {}

    @track_tool_activity
    def slow_tool():
        observed["waiting"] = is_waiting_for_compose(started_at, 0.0)
        return "ok"

    started_at = time.monotonic()
    slow_tool()
    assert observed["waiting"] is False


def test_完了直後は猶予のあいだ待つ():
    """検索を続けて撃つモデルの合間に「作成中」がちらつくのを防ぐ。"""

    @track_tool_activity
    def quick_tool():
        return "ok"

    started_at = time.monotonic()
    quick_tool()

    assert is_waiting_for_compose(started_at, 3.0) is False


def test_猶予を過ぎたら本文執筆とみなす():
    """2026-09-20の不具合。ここがFalseのままだと「Web検索中...」が回り続ける。"""

    @track_tool_activity
    def quick_tool():
        return "ok"

    started_at = time.monotonic()
    quick_tool()
    time.sleep(0.02)

    assert is_waiting_for_compose(started_at, 0.01) is True
