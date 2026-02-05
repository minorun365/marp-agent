# kagブランチ リアーキテクチャ進捗

> 作成日: 2026-02-06
> ブランチ: `refactor/kag-rearchitecture`
> 参照: mainブランチの `refactor/issue-23-rearchitecture` と同じ方針で実施

## 目的

mainブランチと同じリファクタリングをkagブランチにも適用し、以下を実現する：
1. コードの保守性向上
2. mainとkagの構造を揃えてメンテナンスコスト削減
3. kag固有の機能（Kimi K2対応、kag.cssテーマ等）は保持

## 現状（リファクタリング前）

### バックエンド
```
amplify/agent/runtime/
├── agent.py           (931行) - 全機能が1ファイルに集約
├── beam.css           (CSSテーマ)
├── border.css         (CSSテーマ)
├── gradient.css       (CSSテーマ)
├── kag.css            (kag固有テーマ、1.6MB)
├── Dockerfile
├── pyproject.toml
└── requirements.txt
```

### フロントエンド
```
src/
├── hooks/
│   └── useAgentCore.ts (498行) - API呼び出し全般
└── components/
    ├── Chat.tsx            (674行) - チャットUI全体
    ├── ShareConfirmModal.tsx
    ├── ShareResultModal.tsx
    └── SlidePreview.tsx
```

---

## リファクタリング計画

### フェーズ0: CSS重複対策

- [ ] `package.json` に `copy-themes` スクリプト追加
- [ ] `amplify.yml` にコピーコマンド追加
- [ ] `.gitignore` に `amplify/agent/runtime/*.css` 追加
- [ ] CSSファイルをgit管理から除外（kag.css以外）
  - ※ kag.cssはkag固有のため残す

### フェーズ1: バックエンド分割

**目標構成**:
```
amplify/agent/runtime/
├── agent.py           (目標: 300行以下)
├── config.py          - モデル設定・システムプロンプト
├── kag.css            (kag固有テーマ、維持)
├── tools/
│   ├── __init__.py
│   ├── web_search.py
│   ├── output_slide.py
│   └── generate_tweet.py
├── handlers/
│   ├── __init__.py
│   └── kimi_adapter.py  - Kimi K2対応（kag固有）
├── exports/
│   ├── __init__.py
│   └── slide_exporter.py
├── sharing/
│   ├── __init__.py
│   └── s3_uploader.py
└── session/
    ├── __init__.py
    └── manager.py
```

**タスク**:
- [ ] `config.py` 作成（モデル設定、システムプロンプト抽出）
- [ ] `tools/` ディレクトリ作成
  - [ ] `web_search.py`
  - [ ] `output_slide.py`
  - [ ] `generate_tweet.py`
- [ ] `handlers/` ディレクトリ作成
  - [ ] `kimi_adapter.py` （Kimi K2の`<think>`タグ対応含む）
- [ ] `exports/` ディレクトリ作成
  - [ ] `slide_exporter.py` （PDF/PPTX/HTML生成）
- [ ] `sharing/` ディレクトリ作成
  - [ ] `s3_uploader.py` （S3共有、OGP生成）
- [ ] `session/` ディレクトリ作成
  - [ ] `manager.py`
- [ ] `Dockerfile` 更新（分割モジュールのCOPY追加）
- [ ] テスト実行・修正

### フェーズ2: フロントエンド分割

**useAgentCore.ts 目標構成**:
```
src/hooks/
├── useAgentCore.ts          (re-exportのみ)
├── api/
│   ├── agentCoreClient.ts   - エージェント実行
│   └── exportClient.ts      - PDF/PPTX/共有
├── streaming/
│   └── sseParser.ts         - SSE共通処理
└── mock/
    └── mockClient.ts        - モック実装
```

**タスク**:
- [ ] `api/` ディレクトリ作成
  - [ ] `agentCoreClient.ts`
  - [ ] `exportClient.ts`
- [ ] `streaming/` ディレクトリ作成
  - [ ] `sseParser.ts`
- [ ] `mock/` ディレクトリ作成
  - [ ] `mockClient.ts`
- [ ] `useAgentCore.ts` を re-export に変更

**Chat.tsx 目標構成**:
```
src/components/Chat/
├── index.tsx              (目標: 350行以下)
├── constants.ts           - TIPS, MESSAGES定数
├── types.ts               - 型定義
├── ChatInput.tsx          - 入力フォーム
├── MessageList.tsx        - メッセージ一覧
├── MessageBubble.tsx      - メッセージ吹き出し
├── StatusMessage.tsx      - ステータス表示
└── hooks/
    ├── useTipRotation.ts  - 豆知識ローテーション
    └── useStreamingText.ts - テキストストリーミング
```

**タスク**:
- [ ] `Chat/` ディレクトリ作成
- [ ] コンポーネント分割
  - [ ] `index.tsx`
  - [ ] `constants.ts`
  - [ ] `types.ts`
  - [ ] `ChatInput.tsx`
  - [ ] `MessageList.tsx`
  - [ ] `MessageBubble.tsx`
  - [ ] `StatusMessage.tsx`
- [ ] `hooks/` サブディレクトリ作成
  - [ ] `useTipRotation.ts`
  - [ ] `useStreamingText.ts`
- [ ] 旧`Chat.tsx` 削除

---

## kag固有の差分（mainと異なる部分）

リファクタリング後も以下の差分は維持する：

1. **バックエンド**
   - `kag.css` テーマファイル
   - Kimi K2のモデル設定
   - `<think>` タグフィルタリング処理

2. **フロントエンド**
   - モデル選択UI（Kimi K2対応）
   - Claude 5対応準備コード
   - 疑似ストリーミング処理

3. **その他**
   - `docs/SPEC.md` - kag固有仕様の差分ドキュメント
   - `index.html` - kag用OGP設定

---

## 最終確認チェックリスト

リファクタリング完了後、mainブランチと比較して以下を確認する：

- [ ] ディレクトリ構造がmainと一致
- [ ] 分割されたファイル名がmainと一致
- [ ] kag固有の差分のみが異なる
- [ ] 動作確認（ローカル + サンドボックス）

---

## 進捗ログ

### 2026-02-06
- ブランチ `refactor/kag-rearchitecture` 作成
- 進捗ドキュメント作成
- フェーズ0〜2 完了
- mainとの差分確認完了（kag固有の差分のみ）
- docs/SPEC.md にkagとmainの差分を文書化
