---
name: commit-docs
description: デプロイ不要な変更をコミット（[skip-cd]付きでAmplifyデプロイをスキップ）
argument-hint: [コミットメッセージ（省略可）]
---

# デプロイスキップコミット

デプロイに影響しないファイルの変更を `[skip-cd]` 付きでコミットし、Amplifyの不要なデプロイをスキップします。

## 対象ファイル・ディレクトリ

以下はデプロイに影響しないため、`[skip-cd]` でスキップ可能：

| パス | 内容 |
|------|------|
| `docs/` | ドキュメント |
| `.claude/` | Claude Code設定・スキル |
| `.github/` | GitHub Actions・テンプレート |
| `.vscode/` | エディタ設定 |
| `*.md`（ルート） | README.md など |
| `.gitignore` | Git設定 |

## 使い方

```
/commit-docs              # デフォルトメッセージでコミット
/commit-docs TODO更新     # カスタムメッセージでコミット
```

## 実行手順

1. **変更確認**: 変更されたファイル一覧を確認
2. **対象判定**: デプロイに影響するファイルが含まれていないかチェック
3. **ステージング**: 対象ファイルを `git add`
4. **コミット**: `[skip-cd]` 付きでコミット

## コミットメッセージ形式

```
{メッセージ} [skip-cd]
```

- `$ARGUMENTS` が指定されていれば、それをメッセージとして使用
- 指定がなければ変更内容に応じたデフォルトメッセージを使用

## 実行コマンド例

```bash
# 変更確認
git status --short

# 対象ファイルをステージング（存在するもののみ）
git add docs/ .claude/ .github/ .vscode/ README.md CLAUDE.md .gitignore 2>/dev/null || true

# コミット
git commit -m "${ARGUMENTS:-ドキュメント・設定更新} [skip-cd]"
```

## 注意事項

- **警告が必要なケース**: `src/`, `amplify/`, `package.json` 等が変更されている場合
  - これらはデプロイが必要なので、`[skip-cd]` を付けるべきではない
  - 警告を表示し、ユーザーに確認を求める
- プッシュは自動では行わない（必要に応じて手動で `git push`）

## [skip-cd] について

Amplify Hostingの機能で、コミットメッセージに `[skip-cd]` が含まれるとビルド・デプロイがスキップされます。

参考: [AWS Amplify - Environment Variables](https://docs.aws.amazon.com/amplify/latest/userguide/environment-variables.html)
