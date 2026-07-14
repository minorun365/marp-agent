"""Strandsモデルプロバイダーの生成テスト。"""

import sys
from types import ModuleType
from unittest.mock import MagicMock

conversation_manager_module = ModuleType("strands.agent.conversation_manager")
conversation_manager_module.SlidingWindowConversationManager = MagicMock()
sys.modules["strands.agent"] = ModuleType("strands.agent")
sys.modules["strands.agent.conversation_manager"] = conversation_manager_module

openai_responses_module = ModuleType("strands.models.openai_responses")
openai_responses_module.OpenAIResponsesModel = MagicMock()
sys.modules["strands.models.openai_responses"] = openai_responses_module

import session.manager as manager


def test_create_model_uses_bedrock_provider_for_sonnet(monkeypatch):
    monkeypatch.setenv("BEDROCK_SONNET_MODEL_ID", "sonnet-profile-arn")
    bedrock_model = MagicMock()
    monkeypatch.setattr(manager, "BedrockModel", bedrock_model)

    manager._create_model("sonnet")

    bedrock_model.assert_called_once_with(
        model_id="sonnet-profile-arn",
        cache_prompt="default",
        cache_tools="default",
    )


def test_create_model_uses_mantle_responses_provider_for_sol(monkeypatch):
    monkeypatch.setenv("BEDROCK_SOL_MODEL_ID", "openai.gpt-5.6-sol")
    monkeypatch.setenv("BEDROCK_MANTLE_REGION", "us-east-1")
    responses_model = MagicMock()
    monkeypatch.setattr(manager, "OpenAIResponsesModel", responses_model)

    manager._create_model("sol")

    responses_model.assert_called_once_with(
        model_id="openai.gpt-5.6-sol",
        bedrock_mantle_config={"region": "us-east-1"},
        params={"max_output_tokens": 32768},
    )
