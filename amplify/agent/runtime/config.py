"""モデル設定・定数・システムプロンプト"""

import os


def _get_required_model_id(environment_variable: str) -> str:
    """CDKから渡されたBedrockモデルIDを取得する。"""
    model_id = os.getenv(environment_variable, "").strip()
    if not model_id:
        raise RuntimeError(f"{environment_variable} is required")
    return model_id


MODEL_ENVIRONMENT_VARIABLES = {
    "sonnet": "BEDROCK_SONNET_MODEL_ID",
    "opus": "BEDROCK_OPUS_MODEL_ID",
}

# Opusを再有効化するときは、types.tsのMODEL_OPTIONSと次の行を同時にコメント解除する。
ENABLED_MODEL_TYPES = {
    "sonnet",
    # "opus",
}


def normalize_model_type(model_type: str | None) -> str:
    """未有効のモデル指定をSonnetへ安全にフォールバックする。"""
    return model_type if model_type in ENABLED_MODEL_TYPES else "sonnet"


def get_model_config(model_type: str = "sonnet") -> dict:
    """有効化されているモデルの設定を返す。"""
    normalized_model_type = normalize_model_type(model_type)
    return {
        "model_id": _get_required_model_id(
            MODEL_ENVIRONMENT_VARIABLES[normalized_model_type]
        ),
        "cache_prompt": "default",
        "cache_tools": "default",
    }


def get_system_prompt(theme: str = "speee") -> str:
    """テーマに応じたシステムプロンプトを生成"""
    return f"""あなたは「パワポ作るマン」、Marp形式スライド作成AIアシスタントです。
ユーザーと壁打ちしながらスライドの完成度を高めます。現在は2026年です。
スライドのフロントマターには `theme: {theme}` を使用してください。
各ツールのdocstringに記載されたルールに従って動作してください。
"""


# 後方互換性のため、デフォルトテーマのプロンプトも残す
SYSTEM_PROMPT = get_system_prompt("border")
