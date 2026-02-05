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
# Claude Sonnet 4.5（推奨・デフォルト）
model = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"

# Claude Opus 4.6（日付なしのフォーマット）
model = "us.anthropic.claude-opus-4-6-v1"

# Claude Haiku 4.5（高速・低コスト）
model = "us.anthropic.claude-haiku-4-5-20251001-v1:0"

# Kimi K2 Thinking（Moonshot AI）
# 注意: クロスリージョン推論なし、cache_prompt/cache_tools非対応
model = "moonshot.kimi-k2-thinking"
```

### モデル別の設定差異

| モデル | クロスリージョン推論 | cache_prompt | cache_tools | 備考 |
|--------|-------------------|--------------|-------------|------|
| Claude Sonnet 4.5 | ✅ `us.`/`jp.` | ✅ 対応 | ✅ 対応 | 推奨・デフォルト |
| Claude Opus 4.6 | ✅ `us.`/`jp.` | ✅ 対応 | ✅ 対応 | |
| Claude Haiku 4.5 | ✅ `us.`/`jp.` | ✅ 対応 | ✅ 対応 | 高速・低コスト |
| Kimi K2 Thinking | ❌ なし | ❌ 非対応 | ❌ 非対応 | Moonshot AI |

**Kimi K2 Thinking使用時の注意**:
- BedrockModelの`cache_prompt`と`cache_tools`を指定しないこと
- 指定すると `AccessDeniedException: You invoked an unsupported model or your request did not allow prompt caching` が発生する

```python
# NG: Kimi K2では使用不可
agent = Agent(
    model=BedrockModel(
        model_id="moonshot.kimi-k2-thinking",
        cache_prompt="default",  # エラーになる
        cache_tools="default",   # エラーになる
    ),
)

# OK: キャッシュオプションなし
agent = Agent(
    model=BedrockModel(
        model_id="moonshot.kimi-k2-thinking",
    ),
)
```

### Kimi K2 トラブルシューティング

#### Web検索後にスライドが生成されない

**症状**: Web検索を実行すると「Web検索完了」と表示された後、スライドが生成されずに終了する。「〜検索しておきます」というテキストは表示される。

**原因**: Kimi K2がWeb検索ツール実行後に、空のメッセージで`end_turn`している。既存のフォールバック条件（`not has_any_output`）では、検索前のテキスト出力があるためフォールバックが発動しない。

**解決策**: `has_any_output`ではなく`web_search_executed`フラグで判定

```python
web_search_executed = False

# Web検索ツール実行時にフラグを立てる
if tool_name == "web_search":
    web_search_executed = True

# フォールバック条件を変更
# 旧: if not has_any_output and not markdown_to_send and _last_search_result:
# 新:
if web_search_executed and not markdown_to_send and _last_search_result:
    # 検索結果を表示してユーザーに次のアクションを促す
    yield {"type": "text", "data": f"Web検索結果:\n\n{_last_search_result[:500]}...\n\n---\nスライドを作成しますか？"}
```

#### ツール引数のJSON内マークダウンが抽出できない

**症状**: 「お願いします」と言ってスライド生成を依頼すると、何も応答せずに終了する。ログを見ると`reasoningText`内にツール呼び出しがJSON引数ごと埋め込まれている。

**原因**: `extract_marp_markdown_from_text`関数が直接的なマークダウン（`---\nmarp: true`）のみを抽出していたが、Kimi K2は`{"markdown": "---\\nmarp: true\\n..."}`のようなJSON引数内にマークダウンを埋め込むことがある。エスケープされた改行（`\\n`）が正規表現パターンにマッチしない。

**ログの特徴**:
```json
"reasoningText": {
  "text": "...スライドを作成します。 <|tool_call_argument_begin|> {\"markdown\": \"---\\nmarp: true\\ntheme: gradient\\n...\"} <|tool_call_end|>"
}
"finish_reason": "end_turn"
```

**解決策**: JSON引数からもマークダウンを抽出できるようにフォールバック関数を拡張

```python
def extract_marp_markdown_from_text(text: str) -> str | None:
    # ケース1: JSON引数内のマークダウンを抽出
    json_arg_pattern = r'<\|tool_call_argument_begin\|>\s*(\{[\s\S]*?\})\s*<\|tool_call_end\|>'
    json_match = re.search(json_arg_pattern, text)
    if json_match:
        try:
            data = json.loads(json_match.group(1))
            if "markdown" in data and "marp: true" in data["markdown"]:
                return data["markdown"]
        except json.JSONDecodeError:
            pass

    # ケース2: 直接的なマークダウンを抽出（既存の処理）
    # ...
```

#### その他の既知問題

| 問題 | 原因 | 対応状況 |
|------|------|---------|
| ツール実行後に応答が表示されない | `reasoning`イベントを処理していない | ✅ 対応済み |
| ツール名が破損してツールが実行されない | 内部トークンがツール名に混入 | ✅ リトライロジックで対応 |
| ツール呼び出しがreasoningText内に埋め込まれる | tool_useイベントに変換されない | ✅ 検出してリトライ |
| テキストストリームへのマークダウン混入 | ツールを呼ばずに直接出力 | ✅ バッファリングで抽出 |
| ツール引数のJSON内マークダウンが抽出できない | エスケープされた改行がパターンにマッチしない | ✅ JSON引数からの抽出に対応 |
| フロントマター区切り（---）なしのマークダウン | Kimi K2が---を省略して出力 | ✅ パターン緩和で対応 |
| `<think></think>`タグがチャットに表示される | テキストストリームに思考過程が混入 | ✅ リアルタイムフィルタリングで対応 |

### フロントエンドからのモデル切り替え

リクエストごとにモデルを動的に切り替える実装パターン：

#### フロントエンド（Chat.tsx）
```typescript
type ModelType = 'claude' | 'kimi' | 'opus';
const [modelType, setModelType] = useState<ModelType>('claude');

// 入力欄の左端にセレクター配置（矢印は別要素で表示）
<div className="relative flex items-center">
  <select
    value={modelType}
    onChange={(e) => setModelType(e.target.value as ModelType)}
    className="text-xs text-gray-400 bg-transparent appearance-none"
  >
    <option value="claude">標準（Claude Sonnet 4.5）</option>
    <option value="opus">宇宙最速（Claude Opus 4.6）</option>
    <option value="kimi">サステナブル（Kimi K2 Thinking）</option>
  </select>
  <span className="pointer-events-none text-gray-400 text-xl ml-1">▾</span>
</div>

// APIコールにmodelTypeを渡す
await invokeAgent(prompt, markdown, callbacks, sessionId, modelType);
```

**ポイント**: `<option>`に▾を入れるとドロップダウンメニューにも表示されてしまうので、別の`<span>`で表示し、`pointer-events-none`でクリック透過させる。

**会話中のモデル切り替え無効化**: モデルを変えると別のAgentになり会話履歴が引き継がれないため、ユーザーが発言したらセレクターを無効化する。

```typescript
// ユーザー発言があるかで判定（初期メッセージは除外）
const hasUserMessage = messages.some(m => m.role === 'user');

disabled={isLoading || hasUserMessage}
className={hasUserMessage ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 cursor-pointer'}
title={hasUserMessage ? '会話中はモデルを変更できません' : '使用するAIモデルを選択'}
```

**注意**: `messages.length > 0` だと初期メッセージ（アシスタントの挨拶）も含まれてしまうため、`messages.some(m => m.role === 'user')` でユーザー発言の有無を判定する。

**スマホ対応（矢印のみ表示）**: スマホではモデル名が幅を取りすぎるので、矢印だけ表示してタップでドロップダウンを開く。

```typescript
<select
  className="w-0 sm:w-auto sm:pl-3 sm:pr-1 ..."
>
  <option value="claude">Claude</option>
  <option value="opus">宇宙最速</option>
  <option value="kimi">Kimi</option>
</select>
<span className="ml-2 sm:ml-1">▾</span>
```

- スマホ（sm未満）: `w-0` でテキスト非表示、矢印のみ
- PC（sm以上）: `sm:w-auto` で通常表示

#### API（useAgentCore.ts）
```typescript
body: JSON.stringify({
  prompt,
  markdown: currentMarkdown,
  model_type: modelType,  // リクエストに含める
}),
```

#### バックエンド（agent.py）
```python
def _get_model_config(model_type: str = "claude") -> dict:
    if model_type == "kimi":
        return {"model_id": "moonshot.kimi-k2-thinking", "cache_prompt": None}
    elif model_type == "opus":
        return {"model_id": "us.anthropic.claude-opus-4-6-v1", "cache_prompt": "default"}
    else:
        return {"model_id": "us.anthropic.claude-sonnet-4-5-20250929-v1:0", "cache_prompt": "default"}

@app.entrypoint
async def invoke(payload, context=None):
    model_type = payload.get("model_type", "claude")
    agent = get_or_create_agent(session_id, model_type)
```

**セッション管理の注意**: モデル切り替え時に新しいAgentを作成するため、キャッシュキーは `session_id:model_type` の形式で管理する。

### 新モデル追加時のチェックリスト

新しいモデルを追加する際は、以下のファイルを更新する：

| ファイル | 修正内容 |
|---------|---------|
| `amplify/agent/runtime/agent.py` | `_get_model_config()` に新モデルの設定を追加 |
| `src/components/Chat.tsx` | `ModelType` 型に追加、セレクター選択肢を追加 |
| `src/hooks/useAgentCore.ts` | `ModelType` 型に追加 |

**バックエンド修正例**:
```python
def _get_model_config(model_type: str = "claude") -> dict:
    if model_type == "opus":
        # Claude Opus 4.6
        return {
            "model_id": "us.anthropic.claude-opus-4-6-v1",
            "cache_prompt": "default",
            "cache_tools": "default",
        }
    # ...
```

**未リリースモデルの先行対応**:
- リリース前でもモデルIDを設定しておける
- Bedrockがモデルを認識できないと `ValidationException: The provided model identifier is invalid` エラーになる
- フロントエンドの `onError` コールバックでエラーメッセージを判定し、ユーザーフレンドリーなメッセージを疑似ストリーミング表示

```typescript
// Chat.tsx - onErrorコールバック内
onError: (error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const isModelNotAvailable = errorMessage.includes('model identifier is invalid');
  const displayMessage = isModelNotAvailable
    ? MESSAGES.ERROR_MODEL_NOT_AVAILABLE  // 「Claude Opus 4.6はまだリリースされていないようです...」
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
@tool
def web_search(query: str) -> str:
    try:
        # 検索処理...
    except Exception as e:
        error_str = str(e).lower()
        # レートリミット（無料枠超過）を検出
        if "rate limit" in error_str or "429" in error_str or "quota" in error_str:
            return "現在、利用殺到でみのるんの検索API無料枠が枯渇したようです。修正をお待ちください"
        return f"検索エラー: {str(e)}"
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
@tool
def output_slide(markdown: str) -> str:
    """生成したスライドのマークダウンを出力します。"""
    global _generated_markdown
    _generated_markdown = markdown
    return "スライドを出力しました。"
```

**注意**: イベントのペイロードは `content` または `data` フィールドに格納される。両方に対応するコードが必要：

```typescript
const textValue = event.content || event.data;
```

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
