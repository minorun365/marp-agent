"""モデル設定・定数・システムプロンプト"""

import os


def get_model_config(model_type: str = "sonnet") -> dict:
    """モデルタイプに応じた設定を返す"""
    # if model_type == "opus4.7":
    #     # Claude Opus 4.7
    #     return {
    #         "model_id": "us.anthropic.claude-opus-4-7",
    #         "cache_prompt": "default",
    #         "cache_tools": "default",
    #     }
    if model_type == "opus":
        # Claude Opus 4.6
        return {
            "model_id": os.getenv(
                "BEDROCK_OPUS_MODEL_ID",
                "arn:aws:bedrock:us-east-1:105778051969:application-inference-profile/07dhj89poos0",
            ),
            "cache_prompt": "default",
            "cache_tools": "default",
        }
    else:
        # Claude Sonnet 4.6（デフォルト）
        return {
            "model_id": os.getenv(
                "BEDROCK_SONNET_MODEL_ID",
                "arn:aws:bedrock:us-east-1:105778051969:application-inference-profile/xmbdb94a4tsr",
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
