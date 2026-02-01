---
name: sync-issues
description: GitHubのissueとdocs/TODO.mdを双方向同期する。新規issueをTODOに追加し、完了したTODOのissueをクローズする。
allowed-tools: Bash(gh issue list:*), Bash(gh issue view:*), Bash(gh issue close:*), Read
---

# GitHub Issue と TODO.md の同期

ユーザーが「issueを同期して」「TODOを更新して」と言った場合、このスキルに従って同期を実行する。

## 同期の方向

1. **GitHub → TODO.md**: 新規issueをTODO.mdに追加
2. **TODO.md → GitHub**: 完了状態（✅）のTODOに対応するissueをクローズ

## 手順

### 1. 現状を確認

```bash
# オープンなissueを一覧
gh issue list --state open --limit 50

# 最近クローズされたissueを確認
gh issue list --state closed --limit 20
```

```bash
# TODO.mdを読み込み
cat docs/TODO.md
```

### 2. 差分を特定

以下を確認：
- **追加が必要**: オープンなissueでTODO.mdにないもの
- **クローズが必要**: TODO.mdで「✅ 完了」かつ **main・kag両方の実装列が完了（✅ or ➖）** のもの
- **削除が必要**: TODO.mdにあるがissueがクローズ済みのもの

**重要**: kagブランチへの反映も含めて完了とみなす。main実装が完了していてもkag実装が「⬜」の場合はissueをクローズしない。

### 3. TODO.mdを更新

新規issueを追加する場合：
- タスク管理表に行を追加（並び順: ①重要度 → ②工数小さい順）
- 工数は「小」「中」「大」で見積もり
- タスク詳細セクションにも概要・修正方法を追記

完了タスクを削除する場合：
- タスク管理表から該当行を削除
- タスク詳細セクションからも該当セクションを削除

### 4. issueをクローズ

TODO.mdで「✅ 完了」になっているissueをクローズ：

```bash
gh issue close <issue番号> --comment "実装が完了しました 🎉"
```

### 5. 変更を確認

```bash
git diff docs/TODO.md
```

## 新規issue追加時のテンプレート

### タスク管理表の行

```markdown
| #XX | タスク名 | 工数 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
```

### タスク詳細セクション

```markdown
### #XX タスク名

**概要**: issueの内容を簡潔に説明

**現状**: 現在の実装状況

**修正方法**: 具体的な修正手順

**工数**: 小（見積もり根拠）

---
```

## 注意事項

- タスク管理表の並び順を維持する（①重要度 → ②工数小さい順）
- **ラベルはGitHubのissueに従う**（勝手に「🔴 重要」をつけない）
  - `gh issue view <番号>` で `labels` を確認し、「重要」ラベルがある場合のみ「🔴 重要」を付与
- kag列は基本的に「➖ 対象外」（mainのみ実装のタスクが多い）
- issueの詳細が不明な場合は `gh issue view <番号>` で確認
- **issueクローズの条件**: main実装だけでなく、kag実装も完了（✅ or ➖）していること
  - kag実装が「⬜」の場合はissueをクローズしない
  - 誤ってクローズした場合は `gh issue reopen <番号>` で再オープン
