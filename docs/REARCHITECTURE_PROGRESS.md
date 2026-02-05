# リアーキテクチャ進捗（Issue #23）

> 作成日: 2026-02-05
> ブランチ: `refactor/issue-23-rearchitecture`

## 完了済み

### フェーズ0: CSS重複対策 ✅

- `package.json` に `copy-themes` スクリプト追加
- `amplify.yml` にコピーコマンド追加
- `.gitignore` に `amplify/agent/runtime/*.css` 追加
- `amplify/agent/runtime/*.css` をgit管理から除外・削除

### フェーズ1: バックエンド分割 ✅

**分割後の構成**:
```
amplify/agent/runtime/
├── agent.py           (256行, 元883行→70%削減)
├── config.py          (126行) - モデル設定・システムプロンプト
├── tools/
│   ├── __init__.py
│   ├── web_search.py  (72行)
│   ├── output_slide.py (32行)
│   └── generate_tweet.py (36行)
├── handlers/
│   ├── __init__.py
│   └── kimi_adapter.py (97行) - Kimi K2対応
├── exports/
│   ├── __init__.py
│   └── slide_exporter.py (89行) - PDF/PPTX/HTML生成
├── sharing/
│   ├── __init__.py
│   └── s3_uploader.py (115行) - S3共有・OGP
└── session/
    ├── __init__.py
    └── manager.py (51行) - セッション管理
```

**テストファイル更新済み**: `tests/test_agent.py`

**Dockerfile更新**: 分割したモジュールをCOPYするよう修正

### フェーズ2: フロントエンド分割 ✅

**useAgentCore.ts 分割完了**:
```
src/hooks/
├── useAgentCore.ts          (15行, re-exportのみ)
├── api/
│   ├── agentCoreClient.ts   (132行) - エージェント実行
│   └── exportClient.ts      (132行) - PDF/PPTX/共有（重複統合済み）
├── streaming/
│   └── sseParser.ts         (56行) - SSE共通処理
└── mock/
    └── mockClient.ts        (98行) - モック実装
```

**Chat.tsx 分割完了**:
```
src/components/Chat/
├── index.tsx              (326行, 元674行→52%削減) - メインコンポーネント
├── constants.ts           (49行) - TIPS, MESSAGES定数
├── types.ts               (19行) - 型定義
├── ChatInput.tsx          (71行) - 入力フォーム
├── MessageList.tsx        (62行) - メッセージ一覧
├── MessageBubble.tsx      (46行) - メッセージ吹き出し
├── StatusMessage.tsx      (40行) - ステータス表示
└── hooks/
    ├── useTipRotation.ts  (74行) - 豆知識ローテーション
    └── useStreamingText.ts (63行) - テキストストリーミング
```

---

## コミット済み

- `a2c6788` リアーキテクチャ: バックエンド・フロントエンド分割（#23）
- `d719cf5` Chat.tsx分割とDockerfile修正
- `d927eb8` [skip-cd] ドキュメント最新化
- `cd2d271` シェアリクエストの無限ループバグを修正

## 次のステップ

1. ~~Chat.tsx 分割（674行）~~ ✅
2. ~~サンドボックスでの動作確認~~ ✅
3. コミット・PRマージ

---

## 残タスク

- [x] Chat.tsx の分割
  - [x] `src/components/Chat/` ディレクトリ作成
  - [x] コンポーネント分割（index.tsx, ChatInput, MessageList, MessageBubble, StatusMessage）
  - [x] `hooks/` サブディレクトリに `useTipRotation.ts`, `useStreamingText.ts`
  - [x] `constants.ts` に MESSAGES, TIPS 定数を移動
  - [x] `types.ts` に型定義を移動
- [x] 動作確認（`npm run dev` + `npm run sandbox`）
  - [x] Dockerfile修正（分割モジュールのCOPY追加）
  - [x] Chrome DevToolsでE2Eテスト実施
- [x] コミット完了
- [x] Amplify環境でのE2Eテスト
- [x] 無限ループバグ修正
- [ ] PRマージ

---

## リファクタリング中の問題と対応

### 1. Dockerfileの更新漏れ

**症状**: AgentCoreランタイムで `ModuleNotFoundError: No module named 'config'`

**原因**: Dockerfileで分割したPythonモジュールがCOPYされていなかった

**対応**: Dockerfileに以下を追加
```dockerfile
COPY config.py ./
COPY tools/ ./tools/
COPY handlers/ ./handlers/
COPY exports/ ./exports/
COPY sharing/ ./sharing/
COPY session/ ./session/
```

### 2. useEffectの依存配列による無限ループ

**症状**: PPTXダウンロード後、ツイート促進リクエストが無限に送信される

**原因**: useEffectの依存配列に `isLoading` を含めたことで、状態変更のたびに再発火

```javascript
// ❌ バグあり
}, [sharePromptTrigger, modelType, currentMarkdown, sessionId, isLoading]);

// ✅ 修正後
}, [sharePromptTrigger, modelType]);
```

**学び**:
- useEffect内で変更する状態を依存配列に含めない
- リファクタリング時、元のコードの依存配列を正確に維持する
- ESLintの`react-hooks/exhaustive-deps`警告は必要に応じて`eslint-disable`で抑制
