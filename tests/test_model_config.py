"""Bedrockモデル設定のユニットテスト。"""

import pytest

from config import get_model_config
from tools.http_request import _get_haiku_model_id


@pytest.mark.parametrize(
    ("model_type", "environment_variable", "model_id"),
    [
        ("sonnet", "BEDROCK_SONNET_MODEL_ID", "sonnet-profile-arn"),
        ("opus", "BEDROCK_OPUS_MODEL_ID", "opus-profile-arn"),
    ],
)
def test_get_model_config_uses_environment_variable(
    monkeypatch,
    model_type,
    environment_variable,
    model_id,
):
    monkeypatch.setenv(environment_variable, model_id)

    assert get_model_config(model_type)["model_id"] == model_id


@pytest.mark.parametrize(
    ("model_type", "environment_variable"),
    [
        ("sonnet", "BEDROCK_SONNET_MODEL_ID"),
        ("opus", "BEDROCK_OPUS_MODEL_ID"),
    ],
)
def test_get_model_config_rejects_missing_environment_variable(
    monkeypatch,
    model_type,
    environment_variable,
):
    monkeypatch.delenv(environment_variable, raising=False)

    with pytest.raises(RuntimeError, match=environment_variable):
        get_model_config(model_type)


def test_get_haiku_model_id_uses_environment_variable(monkeypatch):
    monkeypatch.setenv("BEDROCK_HAIKU_MODEL_ID", "haiku-profile-arn")

    assert _get_haiku_model_id() == "haiku-profile-arn"


def test_get_haiku_model_id_rejects_missing_environment_variable(monkeypatch):
    monkeypatch.delenv("BEDROCK_HAIKU_MODEL_ID", raising=False)

    with pytest.raises(RuntimeError, match="BEDROCK_HAIKU_MODEL_ID"):
        _get_haiku_model_id()
