---
name: sync-to-kag
description: mainブランチの変更をkagブランチにも適用する。「kagにも反映して」「kag環境にも適用して」と言われたらこのスキルを使う。mainとkagは別環境なのでマージではなくチェリーピックで適用する。
allowed-tools: Bash(git:*)
---

# mainの変更をkagブランチに適用

ユーザーが「kagブランチにも適用して」「kag環境にも反映して」と言った場合、このスキルに従ってチェリーピックを実行する。

## 重要：なぜチェリーピックなのか

- **mainとkagは別環境**（本番環境とkag環境）
- 両ブランチは独立して開発されており、全てのコミットを共有しているわけではない
- `git merge` するとコンフリクトが大量発生する
- **必要な変更だけをチェリーピックで適用する**のが正しい方法

## 同期対象

以下のカテゴリの変更はkagブランチにも同期する：

| カテゴリ | 対象 | 例 |
|---------|------|-----|
| **機能** | アプリのコード変更 | agent.py, コンポーネント |
| **Claude Code設定** | スキル、サブエージェント | `.claude/skills/`, `.claude/agents/` |

**同期しないもの:**
- `docs/TODO.md` - ブランチ別に管理
- 環境固有の設定（resource.ts の環境変数など）

## 手順

### 1. 適用するコミットを確認

```bash
git log main --oneline -5
```

直近でコミットした内容を確認し、チェリーピック対象のコミットハッシュをメモする。

### 2. 未コミットの変更をstash

```bash
git stash
```

### 3. kagブランチに切り替えてチェリーピック

```bash
git checkout kag
git pull origin kag
git cherry-pick <commit-hash>
```

### 4. プッシュしてmainに戻る

```bash
git push origin kag
git checkout main
git stash pop
```

## ワンライナー版

```bash
git stash && git checkout kag && git pull origin kag && git cherry-pick <commit-hash> && git push origin kag && git checkout main && git stash pop
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
