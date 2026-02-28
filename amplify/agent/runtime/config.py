"""モデル設定・定数・システムプロンプト"""


def get_model_config(model_type: str = "sonnet") -> dict:
    """モデルタイプに応じた設定を返す"""
    if model_type == "opus":
        # Claude Opus 4.6
        return {
            "model_id": "us.anthropic.claude-opus-4-6-v1",
            "cache_prompt": "default",
            "cache_tools": "default",
        }
    else:
        # Claude Sonnet 4.6（デフォルト）
        return {
            "model_id": "us.anthropic.claude-sonnet-4-6",
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
