# borderテーマ導入の問題整理

## 目標
Marpテーマを `default + invert` から `border`（コミュニティテーマ）に変更する

## 実施した変更

### 1. ファイル追加・修正（完了）

| ファイル | 変更内容 | 状態 |
|---------|---------|------|
| `src/themes/border.css` | カスタムテーマCSS新規作成 | ✅ |
| `amplify/agent/runtime/border.css` | PDF生成用テーマCSS | ✅ |
| `src/components/SlidePreview.tsx` | Marp Coreにテーマ登録 | ✅ |
| `amplify/agent/runtime/agent.py` | システムプロンプト `theme: border` に変更 | ✅ |
| `src/hooks/useAgentCore.ts` | モック実装のテーマ更新 | ✅ |
| `docs/SPEC.md` | テーマをborderに更新 | ✅ |
| `docs/PLAN.md` | ディレクトリ構成・テーマ更新 | ✅ |
| `docs/KNOWLEDGE.md` | borderテーマの説明追加 | ✅ |
| `tests/e2e-test.md` | テスト項目追加 | ✅ |

### 2. ビルド確認（完了）
```
npm run build → 成功
```

### 3. 環境クリーンアップ（完了）

| 項目 | 状態 |
|------|------|
| sandbox delete実行 | ✅ 完了（CloudFormationスタック削除済み） |
| ampxプロセス停止 | ✅ 完了 |
| .amplify/artifacts/ クリア | ✅ 完了 |

## 現在の状況

**環境はクリーンな状態**。次回セッションでsandboxを新規起動してテストを実行する。

## 次のステップ（新しいセッションで実行）

### Step 1: sandbox起動
```bash
# Docker起動を確認してから実行
TAVILY_API_KEY=$(grep TAVILY_API_KEY .env | cut -d= -f2) npx ampx sandbox
```

### Step 2: デプロイ完了待機
- 初回デプロイは5-10分程度かかる
- CloudFormationスタックが `CREATE_COMPLETE` になるまで待機

### Step 3: テスト実行
```bash
# devサーバー起動
npm run dev
```

1. http://localhost:5173 にアクセス
2. ログイン（新規ユーザー登録が必要）
3. 「テスト用のスライドを作って」と入力
4. 生成されたスライドがborderテーマか確認:
   - ✓ グレーグラデーション背景
   - ✓ 濃いグレー枠線
   - ✗ ダークブルー背景（旧テーマ）

### Step 4: スクリーンショット保存
```bash
# tests/screenshots/ に保存（.gitignore済み）
```

## 技術的な補足

### borderテーマの特徴
- 背景: グレーのグラデーション（`#f7f7f7` → `#d3d3d3`）
- 枠線: 濃いグレー（`#303030`）の太枠線
- アウトライン: 白
- フォント: Inter（Google Fonts）

### 旧テーマ（default + invert）の特徴
- 背景: ダークブルー/ネイビー
- テキスト: 白

## 学んだこと

### sandbox管理の正しい方法

1. **停止**: `npx ampx sandbox delete --yes` を使う（pkillはNG）
2. **複数インスタンス競合時**: `.amplify/artifacts/` もクリアする
3. **Docker必須**: AgentCoreのコンテナビルドにDockerが必要

詳細は `~/.claude/rules/amplify-cdk.md` と `~/.claude/rules/troubleshooting.md` に追記済み。
