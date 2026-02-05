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

### フェーズ2: フロントエンド分割 🔧 進行中

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

**Chat.tsx 分割**: 未着手

---

## 次のステップ

1. TypeScript型チェック実行
2. Chat.tsx 分割（674行）
3. サンドボックスでの動作確認
4. コミット

---

## 残タスク

- [ ] Chat.tsx の分割
  - `src/components/Chat/` ディレクトリ作成
  - `ChatContainer.tsx` + `ChatView.tsx` に分割
  - `hooks/` サブディレクトリに `useMessages.ts`, `useTipRotation.ts` 等
  - `constants.ts` に MESSAGES, TIPS 定数を移動
- [ ] 動作確認（`npm run dev` + `npm run sandbox`）
- [ ] コミット・PR作成
