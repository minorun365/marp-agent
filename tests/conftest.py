"""テスト用の共通設定 - 外部モジュールのモック"""
import sys
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Any
from unittest.mock import MagicMock

# strands, tavily, bedrock_agentcore, boto3, requests をモック（ローカルにはインストールされていない）
mock_strands = MagicMock()


def mock_tool(func=None, **_kwargs):
    def decorate(wrapped):
        setattr(wrapped, 'tool_func', wrapped)
        return wrapped

    return decorate(func) if func is not None else decorate


mock_strands.tool = mock_tool
sys.modules["strands"] = mock_strands
sys.modules["strands.models"] = MagicMock()

mock_strands_types = ModuleType("strands.types")
mock_strands_types_tools = ModuleType("strands.types.tools")


@dataclass
class ToolContext:
    tool_use: dict[str, Any]
    agent: Any
    invocation_state: dict[str, Any]


mock_strands_types_tools.ToolContext = ToolContext
mock_strands_types.tools = mock_strands_types_tools
sys.modules["strands.types"] = mock_strands_types
sys.modules["strands.types.tools"] = mock_strands_types_tools

mock_tavily = MagicMock()
sys.modules["tavily"] = mock_tavily

# tavily.errors は実物と同じ例外クラスを置く。web_search.py はキーの切り替えを
# 「例外の型」で判定するので、MagicMockのままだとその分岐をテストできない。
mock_tavily_errors = ModuleType("tavily.errors")


class UsageLimitExceededError(Exception):
    pass


class ForbiddenError(Exception):
    pass


class InvalidAPIKeyError(Exception):
    pass


mock_tavily_errors.UsageLimitExceededError = UsageLimitExceededError
mock_tavily_errors.ForbiddenError = ForbiddenError
mock_tavily_errors.InvalidAPIKeyError = InvalidAPIKeyError
sys.modules["tavily.errors"] = mock_tavily_errors
mock_tavily.errors = mock_tavily_errors

sys.modules["strands_tools"] = MagicMock()
sys.modules["bedrock_agentcore"] = MagicMock()
sys.modules["boto3"] = MagicMock()
sys.modules["requests"] = MagicMock()

# エージェント本体をパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent / "agent"))
