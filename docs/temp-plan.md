# Sonnet 5 モデル選択対応 - 実装計画

> **対象Issue**: (新規 - Sonnet 5リリース対応)
> **作成日**: 2026-02-03
> **ステータス**: ✅ 実装完了

---

## 概要

Claude Sonnet 5のリリースに備えて、フロントエンドでモデルIDを選択できるように設定しておく。

---

## 要件

1. **リージョン**: us-east-1固定
2. **モデルID**: `us.anthropic.claude-sonnet-5-20260203-v1:0`
3. **選択肢名**: 「Claude 5」
4. **デフォルト**: Sonnet 4.5のまま（claude）
5. **未リリース時の挙動**: エラーを画面に表示し「モデルのリリースを待ってね」メッセージ

---

## 修正箇所

### 1. バックエンド: `amplify/agent/runtime/agent.py`

`_get_model_config()` に `claude5` を追加:

```python
elif model_type == "claude5":
    # Claude Sonnet 5（2026年リリース予定）
    # リリース前はエラーになるが、フロントエンドでユーザーに通知
    return {
        "model_id": "us.anthropic.claude-sonnet-5-20260203-v1:0",
        "cache_prompt": "default",
        "cache_tools": "default",
    }
```

### 2. フロントエンド: `src/components/Chat.tsx`

- 型定義: `ModelType = 'claude' | 'kimi' | 'claude5';`
- モデル名表示: claude5 → 「宇宙最速」
- セレクター選択肢追加: 「宇宙最速（Claude Sonnet 5）」

### 3. フロントエンド: `src/hooks/useAgentCore.ts`

- 型定義: `ModelType = 'claude' | 'kimi' | 'claude5';`

### 4. エラーハンドリング: `src/components/Chat.tsx`

Claude 5がBedrockで未リリースの場合、`model identifier is invalid` エラーを検出してユーザーフレンドリーなメッセージを疑似ストリーミング表示:

```typescript
ERROR_MODEL_NOT_AVAILABLE: 'Claude Sonnet 5はまだリリースされていないようです。Amazon Bedrockへのモデル追加をお待ちください！（ブラウザでページ更新すると、別のモデルを選んで新規チャットができます）',
```

---

## 実装完了日

2026-02-03
