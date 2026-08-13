"""Bedrockモデル設定のユニットテスト。"""

import pytest

import config
from config import (
    ENABLED_MODEL_TYPES,
    get_model_config,
    get_system_prompt,
    normalize_model_type,
)
from tools.http_request import _get_haiku_model_id


def test_only_kimi_is_enabled():
    assert ENABLED_MODEL_TYPES == {"kimi"}
    assert normalize_model_type("kimi") == "kimi"


@pytest.mark.parametrize(
    "requested_model",
    [None, "sonnet", "sonnet5", "glm", "opus", "opus4.7", "sol", "unknown"],
)
def test_disabled_model_falls_back_to_kimi(requested_model):
    assert normalize_model_type(requested_model) == "kimi"


@pytest.mark.parametrize(
    "requested_model", ["sonnet", "sonnet5", "glm", "opus", "opus4.7"]
)
def test_get_model_config_uses_kimi_for_disabled_models(
    monkeypatch,
    requested_model,
):
    monkeypatch.setenv("BEDROCK_KIMI_MODEL_ID", "moonshotai.kimi-k2.5")

    assert get_model_config(requested_model)["model_id"] == "moonshotai.kimi-k2.5"


def test_get_model_config_uses_kimi_without_prompt_cache(monkeypatch):
    monkeypatch.setenv("BEDROCK_KIMI_MODEL_ID", "moonshotai.kimi-k2.5")

    model_config = get_model_config("kimi")

    assert model_config == {
        "provider": "bedrock",
        "model_id": "moonshotai.kimi-k2.5",
        "cache_prompt": None,
        "cache_tools": None,
    }


def test_sol_config_is_ready_for_reenable(monkeypatch):
    monkeypatch.setattr(config, "ENABLED_MODEL_TYPES", {"sonnet", "sol"})
    monkeypatch.setenv("BEDROCK_SOL_MODEL_ID", "openai.gpt-5.6-sol")
    monkeypatch.setenv("BEDROCK_MANTLE_REGION", "us-east-1")

    model_config = get_model_config("sol")

    assert model_config == {
        "provider": "mantle",
        "model_id": "openai.gpt-5.6-sol",
        "region": "us-east-1",
        "max_output_tokens": 32768,
    }


def test_get_model_config_uses_sonnet5_with_prompt_cache(monkeypatch):
    monkeypatch.setattr(config, "ENABLED_MODEL_TYPES", {"sonnet", "sonnet5"})
    monkeypatch.setenv("BEDROCK_SONNET5_MODEL_ID", "sonnet5-profile-arn")

    model_config = get_model_config("sonnet5")

    assert model_config == {
        "provider": "bedrock",
        "model_id": "sonnet5-profile-arn",
        "cache_prompt": "default",
        "cache_tools": "default",
    }


def test_get_model_config_uses_glm_without_prompt_cache(monkeypatch):
    monkeypatch.setattr(config, "ENABLED_MODEL_TYPES", {"sonnet", "glm"})
    monkeypatch.setenv("BEDROCK_GLM_MODEL_ID", "zai.glm-5")

    model_config = get_model_config("glm")

    assert model_config == {
        "provider": "bedrock",
        "model_id": "zai.glm-5",
        "cache_prompt": None,
        "cache_tools": None,
    }


def test_opus_profile_is_ready_for_reenable(monkeypatch):
    monkeypatch.setattr(config, "ENABLED_MODEL_TYPES", {"sonnet", "opus"})
    monkeypatch.setenv("BEDROCK_OPUS_MODEL_ID", "opus-profile-arn")

    assert get_model_config("opus")["model_id"] == "opus-profile-arn"


def test_get_model_config_rejects_missing_sonnet_environment_variable(monkeypatch):
    monkeypatch.setattr(config, "ENABLED_MODEL_TYPES", {"kimi", "sonnet"})
    monkeypatch.delenv("BEDROCK_SONNET_MODEL_ID", raising=False)

    with pytest.raises(RuntimeError, match="BEDROCK_SONNET_MODEL_ID"):
        get_model_config("sonnet")


def test_get_model_config_rejects_missing_kimi_environment_variable(monkeypatch):
    monkeypatch.delenv("BEDROCK_KIMI_MODEL_ID", raising=False)

    with pytest.raises(RuntimeError, match="BEDROCK_KIMI_MODEL_ID"):
        get_model_config("kimi")


def test_get_model_config_rejects_missing_sol_environment_variable(monkeypatch):
    monkeypatch.setattr(config, "ENABLED_MODEL_TYPES", {"sonnet", "sol"})
    monkeypatch.delenv("BEDROCK_SOL_MODEL_ID", raising=False)

    with pytest.raises(RuntimeError, match="BEDROCK_SOL_MODEL_ID"):
        get_model_config("sol")


def test_get_model_config_rejects_missing_sonnet5_environment_variable(monkeypatch):
    monkeypatch.setattr(config, "ENABLED_MODEL_TYPES", {"sonnet", "sonnet5"})
    monkeypatch.delenv("BEDROCK_SONNET5_MODEL_ID", raising=False)

    with pytest.raises(RuntimeError, match="BEDROCK_SONNET5_MODEL_ID"):
        get_model_config("sonnet5")


def test_get_model_config_rejects_missing_glm_environment_variable(monkeypatch):
    monkeypatch.setattr(config, "ENABLED_MODEL_TYPES", {"sonnet", "glm"})
    monkeypatch.delenv("BEDROCK_GLM_MODEL_ID", raising=False)

    with pytest.raises(RuntimeError, match="BEDROCK_GLM_MODEL_ID"):
        get_model_config("glm")


def test_get_haiku_model_id_uses_environment_variable(monkeypatch):
    monkeypatch.setenv("BEDROCK_HAIKU_MODEL_ID", "haiku-profile-arn")

    assert _get_haiku_model_id() == "haiku-profile-arn"


def test_get_haiku_model_id_rejects_missing_environment_variable(monkeypatch):
    monkeypatch.delenv("BEDROCK_HAIKU_MODEL_ID", raising=False)

    with pytest.raises(RuntimeError, match="BEDROCK_HAIKU_MODEL_ID"):
        _get_haiku_model_id()


def test_kimi_system_prompt_adds_slide_balance_rules():
    prompt = get_system_prompt("speee", "kimi")

    assert "現在は2026年です。" in prompt
    assert "Kimi K2.5実行契約" in prompt
    assert "狭いテーマは10〜12枚" in prompt
    assert "複数の機能や論点を扱うテーマは14〜18枚" in prompt
    assert "最大20枚" in prompt
    assert "論点を分けて4〜6回検索" in prompt
    assert "最初の可視応答" in prompt
    assert "修正します。" in prompt
    assert "指定枚数を増減しない" in prompt
    assert "合計10" in prompt
    assert "参考文献1" in prompt
    assert "中タイトルを最大2枚" in prompt
    assert "アジェンダ・目次・まとめ" in prompt
    assert "検索結果やユーザー入力にない日付" in prompt
    assert "実在したURLを3件以上" in prompt
    assert "製品名の境界を厳密に守る" in prompt
    assert "対象製品名をURLまたはページタイトルに含むページだけ" in prompt
    assert "site:help.openai.com Codex rate card" in prompt
    assert "http_requestでページ本文を再取得しない" in prompt
    assert "確認できないセルは「公式情報で要確認」" in prompt
    assert "比較の穴埋めとして追加しない" in prompt
    assert "<!-- source: https://... -->" in prompt


def test_sonnet_system_prompt_does_not_add_kimi_rules():
    prompt = get_system_prompt("speee", "sonnet")

    assert "現在は2026年です。" not in prompt
    assert "OSS系モデル向け" not in prompt
    assert "自律実行ルール（最優先）" not in prompt
    assert "theme: speee" in prompt


def test_sonnet5_uses_the_same_system_prompt_as_sonnet46():
    assert get_system_prompt("speee", "sonnet5") == get_system_prompt(
        "speee", "sonnet"
    )


def test_glm_system_prompt_adds_oss_slide_rules():
    prompt = get_system_prompt("speee", "glm")

    assert "OSS系モデル向け" in prompt
    assert "参考文献1" in prompt


def test_disabled_sol_uses_the_kimi_system_prompt():
    normalized_model_type = normalize_model_type("sol")
    prompt = get_system_prompt("speee", normalized_model_type)

    assert "GPT-5.6 Sol向けの実行指示" not in prompt
    assert "Kimi K2.5実行契約" in prompt
    assert prompt == get_system_prompt("speee", "kimi")
