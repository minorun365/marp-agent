# Haiku 4.5 モデル追加 + claude→sonnet リネーム 作業計画

## 進捗状況

- [x] コード変更（全ファイル完了）
- [x] ビルド確認 OK
- [x] フロントエンドUI確認（モックモード）OK
- [x] ドキュメント更新（CLAUDE.md, backend.md, frontend.md）
- [x] S3バケット名衝突の修正（bucketName削除→CFn自動生成）
- [x] 孤児CloudFrontリソースのクリーンアップ（sbmain, sb-issue23）
- [x] サンドボックスE2Eテスト ✅

## 変更済みファイル一覧

### コード変更

| # | ファイル | 変更内容 | 状態 |
|---|---------|---------|------|
| 1 | `src/components/Chat/types.ts` | `'claude'` → `'sonnet'`, `'haiku'` 追加 | ✅ |
| 2 | `src/components/Chat/ChatInput.tsx` | ラベル・option の `claude` → `sonnet` + Haiku追加 | ✅ |
| 3 | `src/hooks/api/agentCoreClient.ts` | ModelType の `'claude'` → `'sonnet'`, `'haiku'` 追加 | ✅ |
| 4 | `src/hooks/mock/mockClient.ts` | デフォルト値 `'claude'` → `'sonnet'` | ✅ |
| 5 | `src/components/Chat/hooks/useChatMessages.ts` | useState デフォルト `'claude'` → `'sonnet'` | ✅ |
| 6 | `amplify/agent/runtime/config.py` | `"claude"` → `"sonnet"`, haiku 設定追加 | ✅ |
| 7 | `amplify/agent/runtime/agent.py` | デフォルト `"claude"` → `"sonnet"` | ✅ |
| 8 | `amplify/agent/runtime/session/manager.py` | デフォルト `"claude"` → `"sonnet"` | ✅ |
| 9 | `tests/test_agent.py` | `"claude"` → `"sonnet"` | ✅ |

### インフラ変更

| ファイル | 変更内容 | 状態 |
|---------|---------|------|
| `amplify/storage/resource.ts` | `bucketName` 削除（CFn自動生成に変更）、`nameSuffix` props 削除 | ✅ |
| `amplify/backend.ts` | `nameSuffixForS3` 削除、`SharedSlidesConstruct` の引数簡素化 | ✅ |

### ドキュメント更新

| ファイル | 変更内容 | 状態 |
|---------|---------|------|
| `CLAUDE.md` | アーキテクチャ図のモデル一覧更新、E2Eテスト手順追記 | ✅ |
| `docs/knowledge/backend.md` | ModelType、ファイルパス、コード例を最新に更新 | ✅ |
| `docs/knowledge/frontend.md` | ModelType の例を最新に更新 | ✅ |

## 完了済みタスク

### サンドボックスE2Eテスト ✅

以下すべて確認済み：

1. `npm run dev` でフロントエンド起動 ✅
2. Chrome DevTools MCP でログイン（.envのテストユーザー） ✅
3. モデルセレクターに4つの選択肢が表示されること ✅（Sonnet, Opus, Haiku, Kimi K2）
4. Haikuを選択してスライド生成が動作すること ✅（Web検索→4枚スライド生成成功）

## 技術的な補足

### S3バケット名衝突の修正

- **問題**: `bucketName: 'marp-shared-slides-${nameSuffix}'` で固定名を付けていたため、フォーク先でバケット名が衝突する可能性があった
- **修正**: `bucketName` を削除し、CloudFormationに自動生成させる
- CDKのベストプラクティスに従い、リソース名は明示指定しない方がポータブル

### 孤児リソースのクリーンアップ

以前のサンドボックス失敗デプロイで、以下のリソースが孤児として残っていた：
- **sbmain**: CloudFrontディストリビューション `EPJHFHQNH53GE` + OAC `E28JD8YCAOI6P8` → 削除済み
- **sb-issue23**: CloudFrontディストリビューション `E2NW4ESKX8RFOS` + OAC `E16D1J4JI3U9F` → 削除済み
