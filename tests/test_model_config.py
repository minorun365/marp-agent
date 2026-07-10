"""Bedrockモデル設定のユニットテスト。"""

import pytest

import config
from config import ENABLED_MODEL_TYPES, get_model_config, normalize_model_type
from tools.http_request import _get_haiku_model_id


def test_only_sonnet_is_enabled():
    assert ENABLED_MODEL_TYPES == {"sonnet"}


@pytest.mark.parametrize("requested_model", [None, "sonnet", "opus", "opus4.7", "unknown"])
def test_disabled_model_falls_back_to_sonnet(requested_model):
    assert normalize_model_type(requested_model) == "sonnet"


@pytest.mark.parametrize("requested_model", ["sonnet", "opus", "opus4.7"])
def test_get_model_config_uses_sonnet_while_opus_is_disabled(
    monkeypatch,
    requested_model,
):
    monkeypatch.setenv("BEDROCK_SONNET_MODEL_ID", "sonnet-profile-arn")
    monkeypatch.setenv("BEDROCK_OPUS_MODEL_ID", "opus-profile-arn")

    assert get_model_config(requested_model)["model_id"] == "sonnet-profile-arn"


def test_opus_profile_is_ready_for_reenable(monkeypatch):
    monkeypatch.setattr(config, "ENABLED_MODEL_TYPES", {"sonnet", "opus"})
    monkeypatch.setenv("BEDROCK_OPUS_MODEL_ID", "opus-profile-arn")

    assert get_model_config("opus")["model_id"] == "opus-profile-arn"


def test_get_model_config_rejects_missing_sonnet_environment_variable(monkeypatch):
    monkeypatch.delenv("BEDROCK_SONNET_MODEL_ID", raising=False)

    with pytest.raises(RuntimeError, match="BEDROCK_SONNET_MODEL_ID"):
        get_model_config("opus")


def test_get_haiku_model_id_uses_environment_variable(monkeypatch):
    monkeypatch.setenv("BEDROCK_HAIKU_MODEL_ID", "haiku-profile-arn")

    assert _get_haiku_model_id() == "haiku-profile-arn"


def test_get_haiku_model_id_rejects_missing_environment_variable(monkeypatch):
    monkeypatch.delenv("BEDROCK_HAIKU_MODEL_ID", raising=False)

    with pytest.raises(RuntimeError, match="BEDROCK_HAIKU_MODEL_ID"):
        _get_haiku_model_id()
