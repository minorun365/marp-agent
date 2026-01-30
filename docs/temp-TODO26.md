# 引き継ぎファイル（一時）

作成日時: 2026-01-30 22:00頃
更新日時: 2026-01-31 01:30頃

## 現在のタスク

**#26 Kimiに変えてみる** - ⌛️ 実装完了、動作確認OK、最終調整中

## 状況サマリー

Strands AgentsでMoonshot AI (Kimi K2 Thinking) の動作確認完了。フロントエンドUIでモデル切り替え機能を実装し、sandboxで動作確認完了。

## 解決済みの問題

### 1. cache_prompt/cache_tools非対応 ✅ 解決済み

**症状**: `AccessDeniedException: You invoked an unsupported model or your request did not allow prompt caching.`

**原因**: Kimi K2 ThinkingはBedrockModelの`cache_prompt`と`cache_tools`をサポートしていない

**解決策**: BedrockModelの設定からキャッシュオプションを削除

**変更前**:
```python
agent = Agent(
    model=BedrockModel(
        model_id=_get_model_id(),
        cache_prompt="default",
        cache_tools="default",
    ),
    ...
)
```

**変更後（現在の状態）**:
```python
agent = Agent(
    model=BedrockModel(
        model_id=_get_model_id(),
        # Kimi K2 Thinkingはcache_prompt/cache_toolsをサポートしていない
        # cache_prompt="default",
        # cache_tools="default",
    ),
    ...
)
```

**ステータス**: agent.pyに適用済み、動作確認OK

### 2. 環境変数がコンテナに反映されない ✅ 解決済み

**症状**: CloudFormationにはTAVILY_API_KEYが正しく設定されているのに、コンテナ内では空文字

**デバッグ結果**:
```
[DEBUG] TAVILY_API_KEY in env: True, value: EMPTY
```
- 環境変数キーは存在する（True）
- しかし値が空文字（EMPTY）

**原因**: AgentCore Hotswapは環境変数の変更を反映しない。最初のデプロイ時に空だった値がそのまま使われている。

**解決策**: sandbox deleteで完全削除してから再起動
```bash
npx ampx sandbox delete --yes
npx ampx sandbox
```

**ステータス**: ✅ sandbox再起動で解決済み

### 3. TypeScript型インポートエラー ✅ 解決済み

**症状**:
```
Uncaught SyntaxError: The requested module '/src/hooks/useAgentCore.ts'
does not provide an export named 'ModelType'
```

**原因**: Vite + esbuild + TypeScriptの型エクスポートの相性問題
- `export type ModelType = ...` は型のみのエクスポート
- esbuildは型のみのエクスポートを適切に処理しないことがある
- `isolatedModules`モード（Viteのデフォルト）で問題が起きやすい

**解決策**: Chat.tsx内でローカルに型定義
```typescript
// useAgentCore.tsからエクスポートせず、Chat.tsx内で定義
type ModelType = 'claude' | 'kimi';
```

**判断理由**（YAGNI原則）:
- 型を使うのは2箇所だけ（Chat.tsx, useAgentCore.ts）
- モデル追加は頻繁ではない
- 複雑になったら後で一元管理に変更すればOK

**ステータス**: ✅ ローカル定義で解決済み

### 4. AgentCore Runtime重複エラー ✅ 解決済み

**症状**:
```
Resource of type 'AWS::BedrockAgentCore::Runtime' with identifier 'marp_agent_dev' already exists.
```

**原因**: 前回のsandboxで作成されたAgentCore Runtimeが残っている

**解決策**: CLIでRuntimeを削除してからsandbox再起動
```bash
# Runtime一覧確認
aws bedrock-agentcore-control list-agent-runtimes --region us-east-1

# Runtime削除
aws bedrock-agentcore-control delete-agent-runtime \
  --agent-runtime-id {runtimeId} \
  --region us-east-1

# 削除完了を待ってからsandbox起動
npx ampx sandbox
```

**代替策**: 別の識別子でsandbox起動
```bash
npx ampx sandbox --identifier kimi
```

**ステータス**: ✅ Runtime削除で解決済み

## 実装詳細

### バックエンド（agent.py）
- リクエストペイロードから `model_type` を取得（デフォルト: `"claude"`）
- `_get_model_config(model_type)`: モデルごとの設定を返す
- `_create_bedrock_model(model_type)`: BedrockModelを作成
- `get_or_create_agent(session_id, model_type)`: キャッシュキーに `session_id:model_type` を使用

### フロントエンド（Chat.tsx）
- `modelType` state を追加（`"claude"` | `"kimi"`）
- 入力欄の左端にセレクター配置
- デザイン：`text-xs text-gray-400` でプレースホルダーと同じトーン
- `invokeAgent` に `modelType` を渡す

### API（useAgentCore.ts）
- `invokeAgent` に `modelType` パラメータ追加
- リクエストbodyに `model_type` を含める

## 次のステップ（ユーザーリクエスト）

1. ~~**sandboxを再起動してTavily環境変数を反映**~~ ✅ 完了

2. ~~**バックエンド：モデル切り替え機能の実装**~~ ✅ 完了
   - `_get_model_config()` でモデルごとの設定を返す
   - `_create_bedrock_model()` でモデルに応じてBedrockModelを作成
   - フロントエンドからのリクエストで `model_type` を受け取るように変更予定

3. ~~**デバッグコードの削除**~~ ✅ 完了
   - print文をすべて削除
   - debug_info出力を削除

4. ~~**フロントエンド：モデル切り替えUI実装**~~ ✅ 完了
   - 入力欄の左端にさりげないセレクター配置
   - デザイン：薄いグレーのテキスト（`Claude ▾`）+ シェブロン
   - プレースホルダーと同じトーンで馴染むUI
   - クリックでドロップダウン（Claude / Kimi）

5. ~~**動作確認**~~ ✅ 完了
   - sandboxで動作テスト
   - フロントエンドUIでモデル切り替え動作確認OK

## ナレッジ更新済み

`~/.claude/rules/strands-agents.md` に以下を追加:
- Kimi K2 Thinkingを利用可能なモデルに追加
- モデル別の設定差異（cache_prompt対応状況）のテーブル

`~/.claude/rules/troubleshooting.md` に追加推奨:
- Vite + TypeScript型エクスポート問題

## 関連ファイル

| ファイル | 状態 |
|---------|------|
| `amplify/agent/runtime/agent.py` | ✅ 変更済み（リクエストからmodel_type受け取り、動的切り替え） |
| `amplify/agent/resource.ts` | ✅ 変更済み（MODEL_TYPE環境変数削除→動的指定に変更） |
| `src/components/Chat.tsx` | ✅ 変更済み（モデル選択UI追加） |
| `src/hooks/useAgentCore.ts` | ✅ 変更済み（model_typeパラメータ追加） |
| `~/.claude/rules/strands-agents.md` | ✅ 更新済み（Kimi K2情報追加） |

## TODO.mdの懸念事項（#26より）

| 項目 | 状況 |
|------|------|
| 日本語サポート | 🟢 動作確認OK |
| Strands統合バグ | 🟢 cache_prompt問題あり→解決済み |
| 速度 | 🟡 Claude Sonnetの約1/3（要検証） |
| Hotswap制限 | 🟢 環境変数変更は反映されない→sandbox再起動で解決 |

## git worktree 状況

| ディレクトリ | ブランチ | 用途 |
|-------------|---------|------|
| `/Users/minorun365/git/minorun365/marp-agent` | **kimi** | 現在の作業（#26 Kimi K2テスト） |
| `/Users/minorun365/git/minorun365/marp-agent-kag` | kag | #34用（未着手） |

**注意**: mainブランチから `kimi` ブランチを新規作成して切り替えました。Kimi K2関連の変更はこのブランチで進めます。
