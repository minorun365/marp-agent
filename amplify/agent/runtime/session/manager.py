"""セッション管理（Agent作成・キャッシュ）"""

from strands import Agent
from strands.models import BedrockModel

from config import get_model_config, SYSTEM_PROMPT
from tools import web_search, output_slide, generate_tweet_url

# セッションごとのAgentインスタンスを管理（会話履歴保持用）
_agent_sessions: dict[str, Agent] = {}


def _create_bedrock_model(model_type: str = "sonnet") -> BedrockModel:
    """モデル設定に基づいてBedrockModelを作成"""
    config = get_model_config(model_type)
    if config["cache_prompt"] is None:
        return BedrockModel(model_id=config["model_id"])
    else:
        return BedrockModel(
            model_id=config["model_id"],
            cache_prompt=config["cache_prompt"],
            cache_tools=config["cache_tools"],
        )


def get_or_create_agent(session_id: str | None, model_type: str = "sonnet") -> Agent:
    """セッションIDとモデルタイプに対応するAgentを取得または作成"""
    # セッションキーにモデルタイプを含める（モデル切り替え時に新しいAgentを作成）
    cache_key = f"{session_id}:{model_type}" if session_id else None

    # セッションIDがない場合は新規Agentを作成（履歴なし）
    if not cache_key:
        return Agent(
            model=_create_bedrock_model(model_type),
            system_prompt=SYSTEM_PROMPT,
            tools=[web_search, output_slide, generate_tweet_url],
        )

    # 既存のセッションがあればそのAgentを返す
    if cache_key in _agent_sessions:
        return _agent_sessions[cache_key]

    # 新規セッションの場合はAgentを作成して保存
    agent = Agent(
        model=_create_bedrock_model(model_type),
        system_prompt=SYSTEM_PROMPT,
        tools=[web_search, output_slide, generate_tweet_url],
    )
    _agent_sessions[cache_key] = agent
    return agent
