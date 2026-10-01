"""エージェントのストリーミング進捗に関するテスト。"""

import streaming_events
import asyncio
import importlib.util
import itertools
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest


@pytest.fixture
def entrypoint(monkeypatch):
    """実際のSSE処理に、停止・成功を制御できるモデルを接続する。"""
    app = SimpleNamespace(entrypoint=lambda fn: fn)
    monkeypatch.setattr(sys.modules["bedrock_agentcore"], "BedrockAgentCoreApp", lambda: app)
    monkeypatch.setitem(sys.modules, "session", SimpleNamespace(get_or_create_agent=MagicMock()))
    spec = importlib.util.spec_from_file_location("agent_entrypoint_test", Path(__file__).parents[1] / "agent/agent.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "log_session_identity", lambda *_: None)
    monkeypatch.setattr(module, "configure_slide_validation", lambda *_: None)
    monkeypatch.setattr(module, "consume_slide_progress_event", lambda: None)
    state = {"markdown": None}
    monkeypatch.setattr(module, "get_generated_markdown", lambda: state["markdown"])
    monkeypatch.setattr(module, "reset_generated_markdown", lambda: state.update(markdown=None))
    return module, state


def run_stream(entrypoint, scripts, model="kimi3"):
    module, state = entrypoint
    calls = []

    async def stream(prompt):
        calls.append(prompt)
        for event in scripts[len(calls) - 1]:
            if isinstance(event, Exception):
                raise event
            if isinstance(event, str):
                # ツールが最終イベントの後で結果を保存する場合も再現する。
                state["markdown"] = event
            else:
                yield event

    module.get_or_create_agent = lambda *_: SimpleNamespace(messages=[], stream_async=stream)

    async def collect():
        return [event async for event in module.invoke({"prompt": "https://example.com/blog", "model_type": model})]

    return asyncio.run(collect()), calls


@pytest.mark.parametrize("model", ["kimi3", "grok"])
@pytest.mark.parametrize("tool", ["output_slide", "http_request", "web_search"])
def test_unfinished_slide_workflow_is_retried_once(entrypoint, model, tool):
    events, calls = run_stream(entrypoint, [
        [{"current_tool_use": {"name": tool}}, {"result": {"message": "", "finish_reason": "end_turn"}}],
        [{"current_tool_use": {"name": "output_slide"}}, "# Completed"],
    ], model)
    assert len(calls) == 2
    assert [e for e in events if e["type"] == "markdown"] == [{"type": "markdown", "data": "# Completed"}]
    assert not any(e["type"] == "error" for e in events)
    assert events[-1] == {"type": "done"}


def test_retry_exhaustion_reports_error_instead_of_success(entrypoint):
    events, calls = run_stream(entrypoint, [[{"current_tool_use": {"name": "output_slide"}}], []])
    assert len(calls) == 2
    assert len([e for e in events if e["type"] == "error"]) == 1
    assert not any(e["type"] == "markdown" for e in events)
    assert events[-1] == {"type": "done"}


def test_late_completed_output_does_not_trigger_retry(entrypoint):
    events, calls = run_stream(entrypoint, [[{"current_tool_use": {"name": "output_slide"}}, "# Completed"]])
    assert len(calls) == 1
    assert len([e for e in events if e["type"] == "markdown"]) == 1
    assert not any(e["type"] == "error" for e in events)


def test_stream_failure_is_not_retried(entrypoint):
    events, calls = run_stream(entrypoint, [[{"current_tool_use": {"name": "output_slide"}}, RuntimeError("connection lost")]])
    assert len(calls) == 1
    assert len([e for e in events if e["type"] == "error"]) == 1


def test_retry_failure_reports_one_error(entrypoint):
    events, calls = run_stream(entrypoint, [[{"current_tool_use": {"name": "output_slide"}}], [RuntimeError("retry failed")]])
    assert len(calls) == 2
    assert len([e for e in events if e["type"] == "error"]) == 1


def test_retry_keeps_connection_alive_during_internal_events(entrypoint, monkeypatch):
    ticks = itertools.count(step=6)
    monkeypatch.setattr(entrypoint[0], "time", SimpleNamespace(monotonic=lambda: next(ticks)))
    events, _ = run_stream(entrypoint, [
        [{"current_tool_use": {"name": "output_slide"}}],
        [{"current_tool_use": {"name": "output_slide"}}, {}, {}, "# Completed"],
    ])
    retry_start = [i for i, e in enumerate(events) if e["type"] == "tool_use"][-1]
    assert any(e["type"] == "progress" for e in events[retry_start + 1:])
    assert len([e for e in events if e["type"] == "markdown"]) == 1


def test_conversation_without_slide_tools_is_not_retried(entrypoint):
    events, calls = run_stream(entrypoint, [[{"data": "どのような内容にしますか？"}]])
    assert len(calls) == 1
    assert not any(e["type"] == "error" for e in events)


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
