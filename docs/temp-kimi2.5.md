# Kimi K2.5 追加 実装計画

## 概要

既存の4モデル（Sonnet / Opus / Haiku / Kimi K2）に加え、Kimi K2.5を5つ目のモデルとして追加する。
初期実装ではClaude系と同じシンプルなエラーハンドリングのみとし、Kimi K2のような特別な対策（リトライ、テキストバッファリング、thinkタグ除去等）は**入れない**。

## モデルID

- Bedrock モデルID: `moonshotai.kimi-k2.5`
- Kimi K2（`moonshot.kimi-k2-thinking`）とはプロバイダー名が異なる点に注意

## 変更ファイル一覧

### 1. フロントエンド

| ファイル | 変更内容 |
|----------|----------|
| `src/components/Chat/types.ts` | `ModelType` に `'kimi25'` を追加 |
| `src/components/Chat/ChatInput.tsx` | モデルラベル（`'Kimi 2.5'`）とselectオプション追加 |
| `src/components/Chat/constants.ts` | 豆知識テキストに Kimi K2.5 の言及を追加（任意） |

### 2. バックエンド

| ファイル | 変更内容 |
|----------|----------|
| `amplify/agent/runtime/config.py` | `get_model_config()` に `kimi25` 分岐を追加 |
| `amplify/agent/runtime/session/manager.py` | 変更不要（model_typeがそのまま流れる） |
| `amplify/agent/runtime/agent.py` | 変更不要（Kimi K2特有の処理は `model_type == "kimi"` でガードされているため影響なし） |

### 3. インフラ（CDK）

| ファイル | 変更内容 |
|----------|----------|
| `amplify/agent/resource.ts` | 変更不要（`arn:aws:bedrock:*::foundation-model/*` でワイルドカード許可済み） |

## 変更詳細

### 1. `src/components/Chat/types.ts`

```typescript
// Before
export type ModelType = 'sonnet' | 'kimi' | 'opus' | 'haiku';

// After
export type ModelType = 'sonnet' | 'kimi' | 'kimi25' | 'opus' | 'haiku';
```

### 2. `src/components/Chat/ChatInput.tsx`

**モデルラベル（26行目）：**
```typescript
// Before
const modelLabel = modelType === 'sonnet' ? 'Sonnet' : modelType === 'opus' ? 'Opus' : modelType === 'haiku' ? 'Haiku' : 'Kimi';

// After
const modelLabel = modelType === 'sonnet' ? 'Sonnet' : modelType === 'opus' ? 'Opus' : modelType === 'haiku' ? 'Haiku' : modelType === 'kimi25' ? 'Kimi 2.5' : 'Kimi';
```

**selectオプション（47-52行目）：**
```html
<option value="sonnet">バランス（Claude Sonnet 4.5）</option>
<option value="opus">最高性能（Claude Opus 4.6）</option>
<option value="haiku">高速（Claude Haiku 4.5）</option>
<option value="kimi25">マルチモーダル（Kimi K2.5）</option>      <!-- 追加 -->
<option value="kimi">サステナブル（Kimi K2 Thinking）</option>
```

### 3. `amplify/agent/runtime/config.py`

```python
def get_model_config(model_type: str = "sonnet") -> dict:
    if model_type == "kimi25":
        # Kimi K2.5（Moonshot AI）
        # - クロスリージョン推論なし
        # - cache_prompt/cache_tools非対応（K2と同様の想定）
        return {
            "model_id": "moonshotai.kimi-k2.5",
            "cache_prompt": None,
            "cache_tools": None,
        }
    elif model_type == "kimi":
        # ... 既存のKimi K2設定（変更なし）
```

### 4. `amplify/agent/runtime/session/manager.py`

変更不要。`_create_bedrock_model()` は `get_model_config()` を呼ぶだけなので、config.py の変更で自動対応。

`cache_prompt` が `None` の場合はキャッシュオプションなしで `BedrockModel` を作成するロジックも既存で対応済み。

### 5. `amplify/agent/runtime/agent.py`

変更不要。Kimi K2特有の処理はすべて `model_type == "kimi"` でガードされているため、`kimi25` はClaude系と同じコードパスを通る：
- リトライループ → `kimi25` は `model_type == "kimi"` に該当しないのでリトライなし
- テキストバッファリング → `model_type == "kimi"` のみなので適用されない
- thinkタグ除去 → 同上

## エラーハンドリング方針

| 項目 | Kimi K2.5（今回） | Kimi K2（既存） |
|------|-----------------|----------------|
| ツール名破損リトライ | なし | あり（最大5回） |
| テキストバッファリング | なし | あり |
| thinkタグ除去 | なし | あり |
| reasoningContent抽出 | なし | あり |
| マークダウンフォールバック | なし | あり |

→ 問題が発生したら段階的に追加していく

## テスト確認事項

- [ ] フロントエンドでKimi K2.5がセレクターに表示される
- [ ] Kimi K2.5を選択してスライド生成が動作する
- [ ] 既存のKimi K2の動作に影響がない
- [ ] Claude系モデルの動作に影響がない
