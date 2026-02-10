# バックエンド（AgentCore SDK・Strands Agents）

## Bedrock AgentCore SDK（Python）

### 基本構造
```python
from bedrock_agentcore import BedrockAgentCoreApp
from strands import Agent

app = BedrockAgentCoreApp()
agent = Agent(model=_get_model_id())

@app.entrypoint
async def invoke(payload):
    prompt = payload.get("prompt", "")
    stream = agent.stream_async(prompt)
    async for event in stream:
        yield event

if __name__ == "__main__":
    app.run()  # ポート8080でリッスン
```

### 必要な依存関係（requirements.txt）
```
bedrock-agentcore
strands-agents
tavily-python
```
※ fastapi/uvicorn は不要（SDKに内包）
※ `aws login` 認証を使う場合は `botocore[crt]` も必要（pyproject.tomlに追加済み）

### エンドポイント
- `POST /invocations` - エージェント実行
- `GET /ping` - ヘルスチェック

---

## Strands Agents

### 基本情報
- AWS が提供する AI エージェントフレームワーク
- Python で実装
- Bedrock モデルと統合

### 利用可能なモデル（Bedrock）

```python
# Claude Sonnet 4.5（現在の唯一の選択肢）
model = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
```

### モデル別の設定差異

| モデル | クロスリージョン推論 | cache_prompt | cache_tools | 備考 |
|--------|-------------------|--------------|-------------|------|
| Claude Sonnet 4.5 | ✅ `us.`/`jp.` | ✅ 対応 | ✅ 対応 | 現在の唯一の選択肢 |

過去に対応していたモデル（Opus, Haiku, Kimi K2）は削除済み。フロントエンドの `MODEL_OPTIONS` を増やすだけで再追加可能。

### フロントエンドからのモデル切り替え

リクエストごとにモデルを動的に切り替える実装パターン：

#### フロントエンド（types.ts / ChatInput.tsx）

モデル選択肢は `types.ts` の `MODEL_OPTIONS` で一元管理。選択肢が1つだけの場合、セレクターUIは自動的に非表示になる。

```typescript
// types.ts - モデル選択肢の定義（ここを増減するだけでUIが自動対応）
export type ModelType = 'sonnet' | 'opus';

export const MODEL_OPTIONS: ModelOption[] = [
  { value: 'sonnet', label: '標準（Claude Sonnet 4.5）' },
  // { value: 'opus', label: '高品質（Claude Opus 4.6）' },  // コメント外すだけで復活
];

// ChatInput.tsx - MODEL_OPTIONSの数でセレクター表示を制御
const showModelSelector = MODEL_OPTIONS.length > 1;

{showModelSelector && (
  <>
    <select value={modelType} onChange={(e) => setModelType(e.target.value as ModelType)}>
      {MODEL_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
    <div className="w-px h-5 bg-gray-200 mx-1" />
  </>
)}

// APIコールにmodelTypeを渡す
await invokeAgent(prompt, markdown, callbacks, sessionId, modelType);
```

**会話中のモデル切り替え無効化**: モデルを変えると別のAgentになり会話履歴が引き継がれないため、ユーザーが発言したらセレクターを無効化する。

```typescript
// ユーザー発言があるかで判定（初期メッセージは除外）
const hasUserMessage = messages.some(m => m.role === 'user');

disabled={isLoading || hasUserMessage}
title={hasUserMessage ? '会話中はモデルを変更できません' : '使用するAIモデルを選択'}
```

**注意**: `messages.length > 0` だと初期メッセージ（アシスタントの挨拶）も含まれてしまうため、`messages.some(m => m.role === 'user')` でユーザー発言の有無を判定する。

#### API（agentCoreClient.ts）
```typescript
body: JSON.stringify({
  prompt,
  markdown: currentMarkdown,
  model_type: modelType,  // リクエストに含める
}),
```

#### バックエンド（config.py）
```python
def get_model_config(model_type: str = "sonnet") -> dict:
    # 現在はSonnetのみ。MODEL_OPTIONS追加時にここも拡張する
    return {"model_id": "us.anthropic.claude-sonnet-4-5-20250929-v1:0", "cache_prompt": "default", "cache_tools": "default"}

@app.entrypoint
async def invoke(payload, context=None):
    model_type = payload.get("model_type", "sonnet")
    agent = get_or_create_agent(session_id, model_type)
```

### 新モデル追加時のチェックリスト

新しいモデルを追加する際は、以下のファイルを更新する：

| ファイル | 修正内容 |
|---------|---------|
| `src/components/Chat/types.ts` | `ModelType` 型と `MODEL_OPTIONS` に追加（型定義の一元管理場所） |
| `amplify/agent/runtime/config.py` | `get_model_config()` に新モデルの設定を追加 |

※ `agentCoreClient.ts` は `types.ts` から `export type { ModelType }` で再エクスポートしているため、`types.ts` のみ変更すればOK。`ChatInput.tsx` は `MODEL_OPTIONS` をループ描画しているため、選択肢の追加は不要。

**未リリースモデルの先行対応**:
- リリース前でもモデルIDを設定しておける
- Bedrockがモデルを認識できないと `ValidationException: The provided model identifier is invalid` エラーになる
- フロントエンドの `onError` コールバックでエラーメッセージを判定し、ユーザーフレンドリーなメッセージを疑似ストリーミング表示

```typescript
// useChatMessages.ts - onErrorコールバック内
onError: (error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const isModelNotAvailable = errorMessage.includes('model identifier is invalid');
  const displayMessage = isModelNotAvailable
    ? MESSAGES.ERROR_MODEL_NOT_AVAILABLE  // 「選択されたモデルは現在利用できません...」
    : MESSAGES.ERROR;

  // 疑似ストリーミングでエラーメッセージを表示
  // 注意: finallyブロックとの競合を避けるため、isStreamingチェックを緩和
  const streamErrorMessage = async () => {
    setMessages(prev => [...prev.filter(msg => !msg.isStatus),
      { role: 'assistant', content: '', isStreaming: true }]);
    for (const char of displayMessage) {
      await new Promise(resolve => setTimeout(resolve, 30));
      // isStreamingチェックを削除（finallyが先に実行されてfalseになるため）
      setMessages(prev => prev.map((msg, idx) =>
        idx === prev.length - 1 && msg.role === 'assistant'
          ? { ...msg, content: msg.content + char } : msg
      ));
    }
    // ...
  };
  streamErrorMessage();
}
```

**⚠️ finallyブロックとの競合に注意**:
`onError` コールバック内の `streamErrorMessage()` は非同期関数だが、`await` されずに呼ばれる。そのため `finally` ブロックが先に実行され、`isStreaming: false` に設定される。疑似ストリーミングのループ内で `isStreaming` をチェックしていると、テキストが追加されなくなる。

```typescript
// NG: finallyブロックでisStreaming: falseにされた後、条件がfalseになる
idx === prev.length - 1 && msg.role === 'assistant' && msg.isStreaming

// OK: isStreamingチェックを削除
idx === prev.length - 1 && msg.role === 'assistant'
```

### Agent作成
```python
from strands import Agent

agent = Agent(
    model=_get_model_id(),
    system_prompt="あなたはアシスタントです",
)
```

### ストリーミング
```python
async for event in agent.stream_async(prompt):
    if "data" in event:
        print(event["data"], end="", flush=True)
```

### イベントタイプ
- `data`: テキストチャンク
- `current_tool_use`: ツール使用情報
- `result`: 最終結果

### 会話履歴の保持（セッション管理）

Strands Agentは同じインスタンスを使い続けると会話履歴を自動的に保持する。複数ユーザー/セッション対応のため、セッションIDごとにAgentインスタンスを管理する方式が有効。

#### AgentCore Runtimeのスティッキーセッション機能（重要）

AgentCore Runtimeは**HTTPヘッダーでセッションIDを渡す**ことで、同じセッションIDのリクエストを**同じコンテナにルーティング**する（スティッキーセッション）。これにより、メモリ内のAgentインスタンスが保持され、会話履歴が維持される。

**⚠️ 注意**: リクエストボディに`session_id`を入れても**スティッキーセッションは機能しない**。必ずHTTPヘッダーで渡すこと。

#### フロントエンド実装

```typescript
// App.tsx - 画面読み込み時にセッションIDを生成
const [sessionId] = useState(() => crypto.randomUUID());

// HTTPヘッダーでセッションIDを渡す（スティッキーセッション用）
const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    // ★ このヘッダーが重要！ボディに入れてもスティッキーセッションは効かない
    'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': sessionId,
  },
  body: JSON.stringify({ prompt, markdown }),
});
```

#### バックエンド実装

```python
# セッションごとのAgentインスタンスを管理
_agent_sessions: dict[str, Agent] = {}

def get_or_create_agent(session_id: str | None) -> Agent:
    """セッションIDに対応するAgentを取得または作成"""
    if not session_id:
        return Agent(model=MODEL_ID, system_prompt=PROMPT, tools=TOOLS)

    if session_id in _agent_sessions:
        return _agent_sessions[session_id]

    agent = Agent(model=MODEL_ID, system_prompt=PROMPT, tools=TOOLS)
    _agent_sessions[session_id] = agent
    return agent

@app.entrypoint
async def invoke(payload, context=None):
    # セッションIDはHTTPヘッダー経由でcontextから取得
    session_id = getattr(context, 'session_id', None) if context else None
    agent = get_or_create_agent(session_id)
    # ...
```

#### セッションの有効期限

- **非アクティブタイムアウト**: 15分（15分間リクエストがないとコンテナ終了）
- **最大継続時間**: 8時間（どれだけアクティブでも8時間でコンテナ終了）

**注意**: コンテナ再起動でセッション（メモリ内のAgent）は消える。永続化が必要な場合はDynamoDB等を検討。

### SSEレスポンス形式（AgentCore経由）

AgentCore Runtime経由でストリーミングする場合、以下の形式でイベントが返される：

```
data: {"type": "text", "data": "テキストチャンク"}
data: {"type": "tool_use", "data": "ツール名"}
data: {"type": "markdown", "data": "生成されたマークダウン"}
data: {"type": "tweet_url", "data": "https://twitter.com/intent/tweet?text=..."}
data: {"type": "error", "error": "エラーメッセージ"}
data: {"type": "done"}
```

### resultイベントからのテキスト抽出

ツール使用後にLLMが追加のテキストを返す場合、`data` イベントではなく `result` イベントに含まれることがある。
`result.message.content` からテキストを抽出する処理が必要：

```python
elif "result" in event:
    result = event["result"]
    if hasattr(result, 'message') and result.message:
        for content in getattr(result.message, 'content', []):
            if hasattr(content, 'text') and content.text:
                yield {"type": "text", "data": content.text}
```

### web_searchのエラーハンドリング（レートリミット対応）

Tavily APIのレートリミット（無料枠超過）を検出してユーザーフレンドリーなメッセージを返す：

```python
# 複数APIキーで順番に試行（無料枠の月1000クレジット制限対策）
for client in tavily_clients:
    try:
        results = client.search(query=query, max_results=3, search_depth="basic")
        results_str = str(results).lower()
        if "usage limit" in results_str or "exceeds your plan" in results_str:
            continue  # 次のキーで再試行
        # 検索結果をテキストに整形して返却...
    except Exception as e:
        error_str = str(e).lower()
        if "rate limit" in error_str or "429" in error_str or "quota" in error_str or "usage limit" in error_str:
            continue  # 次のキーで再試行
        return f"検索エラー: {str(e)}"
# 全キー枯渇
return "現在、利用殺到でみのるんの検索API無料枠が枯渇したようです。修正をお待ちください"
```

システムプロンプトにもエラー時の対応ルールを追加：

```
## 検索エラー時の対応
web_searchツールがエラーを返した場合：
1. エラー原因をユーザーに伝える
2. 一般的な知識や推測でスライド作成せず、修正待ちを案内
3. スライド作成は行わず、エラー報告のみで終了
```

### ツール駆動型のマークダウン出力

マークダウンをテキストでストリーミング出力すると、フロントエンドで除去処理が複雑になる。
代わりに `output_slide` ツールを使ってマークダウンを出力し、フロントエンドでは `tool_use` イベントを検知してステータス表示する方式が有効。

```python
# スライド出力用のグローバル変数
# NOTE: ContextVarはStrands Agentsがツールを別スレッドで実行するため値が共有されない
_generated_markdown: str | None = None

@tool
def output_slide(markdown: str) -> str:
    """生成したスライドのマークダウンを出力します。"""
    global _generated_markdown
    _generated_markdown = markdown
    return "スライドを出力しました。"
```

**注意**: Strands Agentsはツールを別スレッドで実行するため、`contextvars.ContextVar`で値をセットしてもメインスレッドから参照できない。そのためグローバル変数を使用する。AgentCore Runtimeはリクエストごとに独立コンテナで動作するため、並行性の問題はない。output_slide, web_search, generate_tweet の全ツールで同様のパターンを適用。

**注意**: イベントのペイロードは `content` または `data` フィールドに格納される。両方に対応するコードが必要：

```typescript
const textValue = event.content || event.data;
```

---

## コスト最適化

### トークン消費の構造

1リクエストのトークン消費は以下で構成される（Strands EMFメトリクスで計測可能）:

| 要素 | 概算トークン数 | 備考 |
|------|--------------|------|
| System Prompt + ツール定義 | 2,000-3,000 | キャッシュ対象 |
| Web検索結果 | ~2,000 | 最大の削減ポイント |
| 会話履歴 | 可変（無制限だと200K超も） | ターンが増えると累積 |
| ユーザーメッセージ | ~300 | |
| 出力（スライドMD） | ~1,200 | |

### SlidingWindowConversationManager

Strands Agentsの組み込み機能で会話履歴を自動トリミング。

```python
from strands.agent.conversation_manager import SlidingWindowConversationManager

agent = Agent(
    model=model,
    system_prompt=SYSTEM_PROMPT,
    tools=tools,
    conversation_manager=SlidingWindowConversationManager(window_size=10),
)
```

- `window_size=10` で古いメッセージを自動削除
- 実測で100K超リクエスト（全体の10%）が50K以下に抑制
- フロントエンドが修正リクエスト時に最新Markdown全文を毎回送信するため、古い履歴が消えても会話は成立

### Markdown二重送信の回避

既存セッション（Agent履歴にスライド内容が残っている）ではMarkdown付加をスキップ:

```python
# 新規セッションまたは履歴がない場合のみフロントからのMarkdownを結合
if current_markdown and not agent.messages:
    user_message = f"現在のスライド:\n```markdown\n{current_markdown}\n```\n\nユーザーの指示: {user_message}"
```

### System Prompt圧縮のポイント

- Marpフォーマットの詳細サンプルコードを最小限に
- 重複指示の統合
- 実測: 3,073 → 2,043トークン（-33.5%）

### CloudWatch Log Insightsでのトークン計測

AgentCoreの `print()` 出力はOTelログストリームに載らない。代わりにStrands Agents組み込みのEMF（Embedded Metric Format）を使用:

```
# EMFメトリクス名
strands.event_loop.input.tokens
strands.event_loop.output.tokens
strands.event_loop.cache_read.input.tokens
strands.event_loop.cache_write.input.tokens
strands.model.time_to_first_token
```

```sql
-- CloudWatch Log Insightsクエリ例
filter @message like /strands.event_loop.input.tokens/
| fields @timestamp, @message
| sort @timestamp desc
| limit 50
```

EMFデータはJSON内のネスト構造（`Sum`, `Max`, `Min`, `Count`）で格納される。Python等でパースする際は `parsed['strands.event_loop.input.tokens']['Sum']` で取得。

### Web検索サブエージェント化の検証結果（断念）

Web検索結果のトークン削減のため、DeepSeek V3.2サブエージェントでの処理を検証したが、**品質低下が許容範囲を超えるため断念**。

#### 検証した2つのアプローチ

| アプローチ | プロンプト | 結果 |
|-----------|---------- |------|
| 要約パターン | 「箇条書き3〜5項目に要約」 | 情報量75%減、スライドの深みが失われる |
| ノイズ除去パターン | 「広告・ナビ等の不要部分のみ除去、重要情報は原文保持」 | 情報量は維持されるが、全体的な品質低下 |

#### 技術的には動作する

```python
# サブエージェントの基本パターン
from strands import Agent, tool
from strands.models import BedrockModel

def _create_search_agent() -> Agent:
    # 並列呼び出し対応のため毎回新規作成（シングルトンだとConcurrent invocationsエラー）
    return Agent(
        model=BedrockModel(model_id="deepseek.v3.2"),
        system_prompt="検索結果を整理する指示...",
        tools=[web_search],
        callback_handler=None,  # 親Agentへのイベント伝播を遮断
    )

@tool
def search_and_summarize(query: str) -> str:
    agent = _create_search_agent()
    result = agent(f"「{query}」について検索してください。")
    return str(result)
```

#### 判明した制約

| 制約 | 詳細 |
|------|------|
| **品質低下は不可避** | プロンプトをどう工夫しても、サブエージェントを経由するだけで全体的な品質が低下する |
| **イベント非伝播** | サブAgent内部のツール呼び出しイベントは親Agentのcallback_handlerに伝播しない（Strands仕様） |
| **並列呼び出し** | 同じAgentインスタンスの並列呼び出しは`Concurrent invocations not supported`エラー。毎回新規作成で回避 |
| **フロント通知** | `search_and_summarize`のquery引数を`web_search`としてフロントに送信する互換性マッピングが必要 |

#### 結論

サブエージェント化によるトークン削減は、スライド生成のような品質が重要なユースケースには不向き。コスト削減は履歴トリミング（施策2）やキャッシュ最適化（施策4）など、情報を加工しない手法で対応するのが適切。

### cache_writeの値 = System Prompt + Tools定義のサイズ

新規セッション開始時の `cache_write` 値がSystem Prompt + ツール定義のトークン数に相当。この値を追跡することでプロンプト圧縮の効果を定量的に計測できる。

| 構成 | cache_write値 |
|------|-------------|
| Sonnet（圧縮前） | ~3,073 |
| Sonnet（圧縮後） | ~2,043 |
| Opus（圧縮前） | ~6,146 |

---

## Observability（OTELトレース）

AgentCore Observability でトレースを出力するには、以下の3つすべてが必要。

### 1. requirements.txt

```
strands-agents[otel]          # otel extra が必要（strands-agents だけではNG）
aws-opentelemetry-distro      # ADOT
```

### 2. Dockerfile

```dockerfile
# OTELの自動計装を有効にして起動
CMD ["opentelemetry-instrument", "python", "agent.py"]
```

**注意**: `python agent.py` だけではOTELトレースが出力されない。

### 3. CDK環境変数

```typescript
environmentVariables: {
  AGENT_OBSERVABILITY_ENABLED: 'true',
  OTEL_PYTHON_DISTRO: 'aws_distro',
  OTEL_PYTHON_CONFIGURATOR: 'aws_configurator',
  OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
}
```

### 確認方法

CloudWatch Console → **Bedrock AgentCore GenAI Observability** → Agents View / Sessions View / Traces View
