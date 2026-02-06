# kagブランチ リアーキテクチャ計画

mainブランチのリアーキテクチャ（#23）をkagブランチに適用し、以後のチェリーピックを容易にする。

## 方針

- mainのファイル分割構造に合わせるが、**kag固有のカスタマイズは維持**する
- kag固有: テーマ(`kag`)、ブランディング(`for KAG`)、モデル選択肢(`claude/kimi/claude5`)、KAGグラデーション
- mainからファイルをコピーし、kag固有の差分だけ適用する形で進める

## 作業ステップ

### Phase 1: フロントエンド - Chat.tsx分割 ✅

kagの`src/components/Chat.tsx`（674行）をmainと同じ構造に分割する。

| ファイル | 内容 | kag固有の差分 |
|----------|------|--------------|
| `Chat/types.ts` | 型定義 | `ModelType = 'claude' \| 'kimi' \| 'claude5'` |
| `Chat/constants.ts` | 定数・メッセージ | `ERROR_MODEL_NOT_AVAILABLE`のClaude 5メッセージ |
| `Chat/ChatInput.tsx` | 入力フォーム | モデル選択肢（Claude/Claude5/Kimi）、`bg-kag-gradient`、`btn-kag` |
| `Chat/MessageBubble.tsx` | メッセージ表示 | `bg-kag-gradient`（ユーザーメッセージ） |
| `Chat/MessageList.tsx` | メッセージ一覧 | 変更なし |
| `Chat/StatusMessage.tsx` | ステータス表示 | 変更なし |
| `Chat/hooks/useStreamingText.ts` | ストリーミング表示 | 変更なし |
| `Chat/hooks/useTipRotation.ts` | 豆知識ローテーション | 変更なし |
| `Chat/hooks/useChatMessages.ts` | チャットロジック | シェア無限ループ修正含む |
| `Chat/index.tsx` | エントリポイント | 変更なし |
| 旧`Chat.tsx` | **削除** | - |

### Phase 2: フロントエンド - hooks分割 ✅

kagの`src/hooks/useAgentCore.ts`（498行）をmainと同じ構造に分割する。

| ファイル | 内容 | kag固有の差分 |
|----------|------|--------------|
| `hooks/api/agentCoreClient.ts` | エージェント呼び出し | `ModelType`がkag版 |
| `hooks/api/exportClient.ts` | PDF/PPTX/共有 | デフォルトテーマ`kag` |
| `hooks/streaming/sseParser.ts` | SSE解析 | 変更なし |
| `hooks/mock/mockClient.ts` | モック実装 | デフォルトテーマ`kag` |
| `hooks/useAgentCore.ts` | re-exportのみ | - |

### Phase 3: App.tsxリファクタリング ✅

- `handleDownloadPdf` + `handleDownloadPptx` → `handleExport`に統合（DRY）
- kag固有のブランディング・スタイルは維持

### Phase 4: バックエンド - agent.py分割

kagの`amplify/agent/runtime/agent.py`（926行）をmainと同じ構造に分割する。
※ これは大規模なため、フロントエンドの分割完了後に別コミットで対応する。

| ファイル | 内容 |
|----------|------|
| `config.py` | モデル設定・システムプロンプト（kag固有） |
| `tools/web_search.py` | Web検索ツール |
| `tools/output_slide.py` | スライド出力ツール |
| `tools/generate_tweet.py` | ツイートURL生成ツール |
| `exports/slide_exporter.py` | PDF/PPTX変換 |
| `sharing/s3_uploader.py` | S3アップロード |
| `handlers/kimi_adapter.py` | Kimi K2対応 |
| `session/manager.py` | セッション管理 |

### Phase 5: チェリーピック

リアーキテクチャ完了後、以下のmainコミットをチェリーピックする：

1. `567003f` - 公開スライドのXシェア機能追加（#54）
2. `1553deb` - OGP重複タグ修正
3. `ae556a0` - モデルID修正
4. `cd2d271` - シェアリクエスト無限ループバグ修正
5. `d1718fb` - Claude Opus 4.6に変更 → kag版ではClaude 5のまま維持、バックエンドのみ適用検討
6. `189ea32` - エラー時ストリーミング表示修正
7. `94fcd15` - SSEアイドルタイムアウト対応
8. `e4432c9` - Haiku 4.5追加、sonnetリネーム → kag版では名前を維持、バックエンド部分のみ検討

## 進捗

- [x] Phase 1: Chat.tsx分割
- [x] Phase 2: hooks分割
- [x] Phase 3: App.tsxリファクタリング
- [ ] Phase 4: バックエンド分割
- [ ] Phase 5: チェリーピック
