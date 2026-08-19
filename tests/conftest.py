"""テスト用の共通設定 - 外部モジュールのモック"""
import sys
from pathlib import Path
from types import ModuleType
from unittest.mock import MagicMock

# strands, tavily, bedrock_agentcore, boto3, requests をモック（ローカルにはインストールされていない）
mock_strands = MagicMock()
mock_strands.tool = lambda func: setattr(func, 'tool_func', func) or func
sys.modules["strands"] = mock_strands
sys.modules["strands.models"] = MagicMock()

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

# ランタイムディレクトリをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent / "amplify" / "agent" / "runtime"))
