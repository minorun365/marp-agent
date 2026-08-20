"""セッション管理（Agent作成・キャッシュ）"""

from strands import Agent
from strands.agent.conversation_manager import SlidingWindowConversationManager
from strands.models import BedrockModel, Model
from strands.models.openai_responses import OpenAIResponsesModel

from config import get_model_config, get_system_prompt, normalize_model_type
from tools import web_search, output_slide, generate_tweet_url, http_request

# セッションごとのAgentインスタンスを管理（会話履歴保持用）
_agent_sessions: dict[str, Agent] = {}

# 会話履歴のトリミング設定（古いメッセージを自動削除してトークンコスト削減）
_conversation_manager = SlidingWindowConversationManager(window_size=6)


def _create_model(model_type: str = "grok") -> Model:
    """モデル設定に基づいてStrandsのモデルプロバイダーを作成"""
    config = get_model_config(model_type)

    if config["provider"] == "mantle":
        params: dict = {"max_output_tokens": config["max_output_tokens"]}
        if config.get("reasoning_effort"):
            params["reasoning"] = {"effort": config["reasoning_effort"]}

        # StrandsのMantle対応は、モデルIDが openai.gpt-5. で始まるときだけ
        # /openai/v1 を使い、それ以外は /v1 へ送る。xai.grok-4.6 は /openai/v1
        # でしか応答しないため、Mantle用のbase_urlとトークンを自前で組み立てる。
        if not config["model_id"].startswith("openai.gpt-5."):
            from aws_bedrock_token_generator import provide_token

            return OpenAIResponsesModel(
                model_id=config["model_id"],
                client_args={
                    "base_url": f"https://bedrock-mantle.{config['region']}.api.aws/openai/v1",
                    "api_key": provide_token(region=config["region"]),
                },
                params=params,
            )

        return OpenAIResponsesModel(
            model_id=config["model_id"],
            bedrock_mantle_config={"region": config["region"]},
            params=params,
        )

    if config["cache_prompt"] is None:
        return BedrockModel(model_id=config["model_id"])
    else:
        return BedrockModel(
            model_id=config["model_id"],
            cache_prompt=config["cache_prompt"],
            cache_tools=config["cache_tools"],
        )


def get_or_create_agent(
    session_id: str | None,
    model_type: str = "grok",
    theme: str = "border",
) -> Agent:
    """セッションIDとモデルタイプとテーマに対応するAgentを取得または作成"""
    model_type = normalize_model_type(model_type)
    system_prompt = get_system_prompt(theme, model_type)

    # セッションキーにモデルタイプとテーマを含める（切り替え時に新しいAgentを作成）
    cache_key = f"{session_id}:{model_type}:{theme}" if session_id else None

    # セッションIDがない場合は新規Agentを作成（履歴なし）
    if not cache_key:
        return Agent(
            model=_create_model(model_type),
            system_prompt=system_prompt,
            tools=[web_search, output_slide, generate_tweet_url, http_request],
            conversation_manager=_conversation_manager,
        )

    # 既存のセッションがあればそのAgentを返す
    if cache_key in _agent_sessions:
        return _agent_sessions[cache_key]

    # 新規セッションの場合はAgentを作成して保存
    agent = Agent(
        model=_create_model(model_type),
        system_prompt=system_prompt,
        tools=[web_search, output_slide, generate_tweet_url, http_request],
        conversation_manager=_conversation_manager,
    )
    _agent_sessions[cache_key] = agent
    return agent
