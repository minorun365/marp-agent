"""ツールがいま動いているかを、エージェント本体へ伝えるための共有状態。

keep-aliveの無音検知は「本文を書いている無音」と「ツールの実行待ち」を区別する
必要がある。ところがストリームのイベントだけでは区別できない——ツールが返っても
モデルが考え込んでいる間はイベントが1件も流れないため、ツール開始の通知を最後に
受け取ったまま何十秒も経つ。

2026-09-20、Kimi K3で実測したところ、最後の検索からモデルが喋り出すまで39.9秒の
完全な沈黙があった。この間ツールはとっくに終わっているのに、本体からは実行中に
見えるので「スライドを作成中」へ切り替わらず、画面は「Web検索中...」が回り続けた。
逆にこの目印を持たずに時間だけで判断すると、2026-08-20のように検索が5秒を超えた
瞬間へ「作成中」を先出ししてしまう。

そこで推測をやめ、ツール自身に開始と完了を記録させる。
"""

import functools
import time
from typing import Callable, TypeVar

_running_tools = 0
_last_finished_at: float | None = None

F = TypeVar("F", bound=Callable[..., object])


def reset_tool_activity() -> None:
    """リクエストごとに状態を初期化する。"""
    global _running_tools, _last_finished_at
    _running_tools = 0
    _last_finished_at = None


def is_tool_running() -> bool:
    """いずれかのツールが実行中か。

    Kimi K3は検索を2件ずつ並列に呼ぶため、単純な真偽値だと先に返った1件で
    「実行中ではない」に倒れる。本数で数える。
    """
    return _running_tools > 0


def get_last_finished_at() -> float | None:
    """最後にツールが完了した時刻（time.monotonic）。一度も完了していなければNone。"""
    return _last_finished_at


def seconds_since_last_finish() -> float | None:
    """最後にツールが完了してからの経過秒。一度も完了していなければNone。"""
    if _last_finished_at is None:
        return None
    return time.monotonic() - _last_finished_at


def is_tool_active(started_at: float | None) -> bool:
    """開始を通知したツールが、まだ動いているとみなせるか。

    ⚠️ 「次のイベントが届いたら終わっている」と推測してはいけない。ツールが返っても
    モデルが考え込む間はイベントが1件も流れないため、推測だと実行中のままになる
    （2026-09-20、Kimi K3で最後の検索から39.9秒の沈黙を実測。その間ずっと画面へ
    「Web検索中...」が出たままだった）。逆に実行本数だけで見ると、開始を通知してから
    ツール関数が実際に呼ばれるまでの隙間で「動いていない」に倒れ、2026-08-20の
    「検索中に作成中を先出しする」不具合が再発する。両方を見る。

    Args:
        started_at: ツール開始を画面へ通知した時刻（time.monotonic）。未通知ならNone。
    """
    if started_at is None:
        return False
    if is_tool_running():
        return True
    finished_at = get_last_finished_at()
    # 通知より後に完了が記録されていれば、ツールは終わっている。
    return finished_at is None or finished_at < started_at


def is_waiting_for_compose(started_at: float | None, grace_seconds: float) -> bool:
    """ツールが終わって、モデルが本文を書いている最中とみなせるか。

    Kimi K3は検索のあと、スライドの草案を思考テキストとして流し続ける。画面へは
    送らないイベントなので利用者からは何も起きていないように見えるが、届き続ける
    ためkeep-aliveの無音検知には入らない（2026-09-20、本番ログで検索完了から57秒
    ぶん537行の思考を実測）。イベントを受け取るたびにこれを見て切り替える。

    猶予を置くのは、検索を続けて撃つモデルの合間に「作成中」がちらつくのを防ぐため。
    K3は検索を2件ずつ並列で呼び、その2〜3秒後にもう1件足すことがある。

    Args:
        started_at: ツール開始を画面へ通知した時刻。未通知ならNone。
        grace_seconds: 最後のツール完了から何秒経ったら本文執筆とみなすか。
    """
    if is_tool_active(started_at):
        return False
    idle_for = seconds_since_last_finish()
    # 一度もツールを使っていない依頼は、ここでは判断しない（keep-aliveの無音検知が担当）。
    return idle_for is not None and idle_for >= grace_seconds


def track_tool_activity(func: F) -> F:
    """ツール関数を包んで、実行中の本数と完了時刻を記録する。

    `@tool` の内側に置くこと。strandsは関数のdocstringと型ヒントから引数の仕様を
    作るので、functools.wrapsで元の関数の情報を引き継ぐ。
    """

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        global _running_tools, _last_finished_at
        _running_tools += 1
        try:
            return func(*args, **kwargs)
        finally:
            _running_tools = max(0, _running_tools - 1)
            _last_finished_at = time.monotonic()

    return wrapper  # type: ignore[return-value]
