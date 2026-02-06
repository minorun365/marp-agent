"""テスト用の共通設定 - 外部モジュールのモック"""
import sys
from pathlib import Path
from unittest.mock import MagicMock

# strands, tavily, bedrock_agentcore, boto3 をモック（ローカルにはインストールされていない）
mock_strands = MagicMock()
mock_strands.tool = lambda func: setattr(func, 'tool_func', func) or func
sys.modules["strands"] = mock_strands
sys.modules["strands.models"] = MagicMock()

mock_tavily = MagicMock()
sys.modules["tavily"] = mock_tavily

sys.modules["bedrock_agentcore"] = MagicMock()
sys.modules["boto3"] = MagicMock()

# ランタイムディレクトリをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent / "amplify" / "agent" / "runtime"))
