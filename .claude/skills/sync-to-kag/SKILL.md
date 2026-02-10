---
name: sync-to-kag
description: mainリポジトリの変更をkagリポジトリにも適用する。「kagにも反映して」「kag環境にも適用して」と言われたらこのスキルを使う。mainとkagは別リポジトリなのでマージではなくチェリーピックで適用する。
allowed-tools: Bash(git:*), Bash(cd:*), Bash(cp:*)
---

# mainの変更をkagリポジトリに適用

ユーザーが「kagにも適用して」「kag環境にも反映して」と言った場合、このスキルに従ってチェリーピックを実行する。

## 構成

mainとkagは**完全に別のGitHubリポジトリ**として管理されている：

| 環境 | リポジトリ | ローカルパス | ブランチ |
|------|-----------|------------|---------|
| main（本番） | `minorun365/marp-agent` | `../marp-agent` | main |
| kag | `minorun365/marp-agent-kag` | `../marp-agent-kag` | main |

kagリポジトリには `upstream` リモートとして marp-agent が登録されている。

## 重要：なぜチェリーピックなのか

- mainとkagは**別リポジトリ**で独立して開発されている
- `git merge` するとコンフリクトが大量発生する
- **必要な変更だけをチェリーピックで適用する**のが正しい方法

## 同期対象

| カテゴリ | 対象 | 例 |
|---------|------|-----|
| **機能** | アプリのコード変更 | agent.py, コンポーネント |
| **Claude Code設定** | スキル、サブエージェント | `.claude/skills/`, `.claude/agents/` |

**同期しないもの:**
- `docs/` 配下のドキュメント - kagは差分のみ記載する方針のため、mainのドキュメント変更は反映しない
- `docs/todo.md` - リポジトリ別に管理
- 環境固有の設定（resource.ts の環境変数など）

## 手順

### 1. mainリポジトリで適用するコミットを確認

```bash
git log main --oneline -5
```

直近でコミットした内容を確認し、**コード変更のみ**をチェリーピック対象とする（ドキュメント変更は除外）。

### 2. kagリポジトリに移動してチェリーピック

```bash
cd ../marp-agent-kag
git pull origin main
git fetch upstream
git cherry-pick <commit-hash>
```

### 3. プッシュしてmainリポジトリに戻る

```bash
git push origin main
cd ../marp-agent
```

## ワンライナー版

```bash
cd ../marp-agent-kag && git pull origin main && git fetch upstream && git cherry-pick <commit-hash> && git push origin main && cd ../marp-agent
```

## コンフリクト発生時

```bash
# コンフリクトファイル確認
git diff --name-only --diff-filter=U

# 手動解決後
git add <files>
git cherry-pick --continue

# 中止する場合
git cherry-pick --abort
```

## 注意

- 環境固有の設定ファイル（resource.ts等）はkag側で別の値になっている可能性あり
- コンフリクト発生時はユーザーに確認を取ること
