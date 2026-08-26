"""エージェントのストリーミング進捗に関するテスト。"""

import streaming_events


def test_slide_progress_event_is_not_limited_to_a_specific_model(monkeypatch):
    monkeypatch.setattr(
        streaming_events,
        "consume_slide_progress",
        lambda: "構成を見直してスライドを修正します",
    )

    assert streaming_events.consume_slide_progress_event() == {
        "type": "slide_progress",
        "data": "構成を見直してスライドを修正します",
    }


def test_slide_progress_event_is_empty_when_no_retry_is_pending(monkeypatch):
    monkeypatch.setattr(streaming_events, "consume_slide_progress", lambda: None)

    assert streaming_events.consume_slide_progress_event() is None
