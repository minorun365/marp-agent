"""画面へ送るストリーミングイベントの組み立て。"""

from tools import consume_slide_progress


def consume_slide_progress_event():
    """検査ツールが確定したスライド再生成の進捗をSSEイベントへ変換する。"""
    progress_message = consume_slide_progress()
    if not progress_message:
        return None
    return {"type": "slide_progress", "data": progress_message}
