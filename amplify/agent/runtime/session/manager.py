"""セッション管理（Agent作成・キャッシュ）"""

import os

from strands import Agent
from strands.agent.conversation_manager import SlidingWindowConversationManager
from strands.models import BedrockModel, Model
from strands.models.openai_responses import OpenAIResponsesModel

try:
    from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
    from bedrock_agentcore.memory.integrations.strands.session_manager import AgentCoreMemorySessionManager
except ImportError:
    AgentCoreMemoryConfig = None
    AgentCoreMemorySessionManager = None

from config import get_model_config, get_system_prompt, normalize_model_type
from tools import web_search, output_slide, generate_tweet_url, http_request

# セッションごとのAgentインスタンスを管理（会話履歴保持用）
_agent_sessions: dict[str, Agent] = {}

# 会話履歴のトリミング設定（古いメッセージを自動削除してトークンコスト削減）
_conversation_manager = SlidingWindowConversationManager(window_size=6)


def _create_model(model_type: str = "kimi") -> Model:
    """モデル設定に基づいてStrandsのモデルプロバイダーを作成"""
    config = get_model_config(model_type)

    if config["provider"] == "mantle":
        return OpenAIResponsesModel(
            model_id=config["model_id"],
            bedrock_mantle_config={"region": config["region"]},
            params={"max_output_tokens": config["max_output_tokens"]},
        )

    if config["cache_prompt"] is None:
        return BedrockModel(model_id=config["model_id"])
    else:
        return BedrockModel(
            model_id=config["model_id"],
            cache_prompt=config["cache_prompt"],
            cache_tools=config["cache_tools"],
        )


def _create_session_manager(session_id: str | None, actor_id: str | None):
    memory_id = os.getenv("AGENTCORE_MEMORY_ID", "").strip()
    if not session_id or not memory_id or AgentCoreMemoryConfig is None or AgentCoreMemorySessionManager is None:
        return None

    config = AgentCoreMemoryConfig(
        memory_id=memory_id,
        session_id=session_id,
        actor_id=actor_id or "anonymous",
    )
    return AgentCoreMemorySessionManager(
        agentcore_memory_config=config,
        region_name=os.getenv("AWS_REGION", "us-east-1"),
    )


def get_or_create_agent(
    session_id: str | None,
    model_type: str = "kimi",
    theme: str = "border",
    actor_id: str | None = None,
) -> Agent:
    """セッションIDとモデルタイプとテーマに対応するAgentを取得または作成"""
    model_type = normalize_model_type(model_type)
    system_prompt = get_system_prompt(theme, model_type)

    # セッションキーにモデルタイプとテーマを含める（切り替え時に新しいAgentを作成）
    cache_key = f"{actor_id}:{session_id}:{model_type}:{theme}" if session_id else None
    session_manager = _create_session_manager(session_id, actor_id)

    # セッションIDがない場合は新規Agentを作成（履歴なし）
    if not cache_key:
        return Agent(
            model=_create_model(model_type),
            system_prompt=system_prompt,
            tools=[web_search, output_slide, generate_tweet_url, http_request],
            conversation_manager=_conversation_manager,
            session_manager=session_manager,
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
        session_manager=session_manager,
    )
    _agent_sessions[cache_key] = agent
    return agent
