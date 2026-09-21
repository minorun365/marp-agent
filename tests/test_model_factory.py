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
import config


def test_create_model_uses_mantle_endpoint_for_grok(monkeypatch):
    """Grokは openai.gpt-5. で始まらないので、Mantleのbase_urlを自前で組み立てる。

    Strandsの bedrock_mantle_config は /v1 を叩くが、xai.grok-4.6 は /openai/v1
    でしか応答しない（2026-08-19実測）。
    """
    monkeypatch.setenv("BEDROCK_GROK_MODEL_ID", "xai.grok-4.6")
    monkeypatch.setenv("BEDROCK_GROK_REGION", "us-west-2")
    monkeypatch.setenv("GROK_REASONING_EFFORT", "medium")
    responses_model = MagicMock()
    monkeypatch.setattr(manager, "OpenAIResponsesModel", responses_model)
    token_module = ModuleType("aws_bedrock_token_generator")
    token_module.provide_token = MagicMock(return_value="bearer-token")
    sys.modules["aws_bedrock_token_generator"] = token_module

    manager._create_model("grok")

    responses_model.assert_called_once_with(
        model_id="xai.grok-4.6",
        client_args={
            "base_url": "https://bedrock-mantle.us-west-2.api.aws/openai/v1",
            "api_key": "bearer-token",
        },
        params={"max_output_tokens": 32768, "reasoning": {"effort": "medium"}},
    )


def test_sol_model_factory_is_ready_for_reenable(monkeypatch):
    monkeypatch.setattr(config, "ENABLED_MODEL_TYPES", {"grok", "sol"})
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


def test_create_model_passes_reasoning_effort_to_bedrock(monkeypatch):
    """Bedrock側は params ではなく additionalModelRequestFields で思考量を受け取る。

    Strandsの BedrockModel は additional_request_fields をそのまま
    additionalModelRequestFields として送る。
    """
    monkeypatch.setenv("BEDROCK_KIMI3_MODEL_ID", "us.moonshotai.kimi-k3")
    monkeypatch.delenv("KIMI3_REASONING_EFFORT", raising=False)
    bedrock_model = MagicMock()
    monkeypatch.setattr(manager, "BedrockModel", bedrock_model)

    manager._create_model("kimi3")

    bedrock_model.assert_called_once_with(
        model_id="us.moonshotai.kimi-k3",
        additional_request_fields={"reasoning": {"effort": "none"}},
    )


def test_create_model_keeps_prompt_cache_for_claude_models(monkeypatch):
    """思考量の分岐を足しても、プロンプトキャッシュの指定が落ちないこと。"""
    monkeypatch.setattr(config, "ENABLED_MODEL_TYPES", {"grok", "sonnet5"})
    monkeypatch.setenv("BEDROCK_SONNET5_MODEL_ID", "us.anthropic.claude-sonnet-5")
    bedrock_model = MagicMock()
    monkeypatch.setattr(manager, "BedrockModel", bedrock_model)

    manager._create_model("sonnet5")

    bedrock_model.assert_called_once_with(
        model_id="us.anthropic.claude-sonnet-5",
        cache_prompt="default",
        cache_tools="default",
    )
