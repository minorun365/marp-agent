---
name: sync-to-kag
model: sonnet
description: 一般公開版（marp-agent）の変更を、KAG社内版（marp-agent-kag）へマージで取り込む。公開版を本番へデプロイしたら必ず実行する。「kagにも反映して」「kag環境にも適用して」「同期して」で起動。
allowed-tools: Bash
---

# KAG社内版へ取り込む（マージ方式）

公開版 `marp-agent` の変更を、KAG社内版 `marp-agent-kag`（ローカル `../marp-agent-kag`）へ
`git merge` で流す。**方向は公開版 → KAG版の一方向だけ。**

## いつ実行するか

**公開版を本番へデプロイしたら、その場で実行する。** `deploy-prod` の完了条件に入っている。
みのるんは「本番側を触らせたときに自動で発動すればいい」と明示している（2026-08-22）ので、
**聞かずに実行する。**「KAGにも反映しますか？」と確認しない。

デプロイを伴わないコード変更でも、公開版の `main` へ push したなら実行してよい。

## ⚠️ チェリーピックは使わない

KAG版は公開版から**280コミット以上先行**している（版設定の抽象化、GHE対応、社内テーマ）。
必要なものを1つずつ拾う方式は破綻するので、`git merge` だけを使う。
両リポジトリの `.githooks/prepare-commit-msg` がチェリーピックを機械的に拒否する。

2026-08-20 に「ディレクトリ構成が食い違うので同期そのものを停止」していたが、
**2026-08-22 のリアーキテクチャで構成が揃い、停止は解除された。**
実測では `agent/` 配下は自動マージで通り、コンフリクトしたのは
両側で別々に育てたドキュメント1件だけだった。

## 手順

### 1. 公開版がpush済みか確かめる

```bash
git -C ~/git/minorun365/marp-agent status --short
git -C ~/git/minorun365/marp-agent log --oneline @{u}..HEAD
```

未pushのコミットがあれば先にpushする（マージはリモートの `upstream/main` を見るため）。

### 2. KAG版の作業ツリーが空いているか確かめる

```bash
git -C ~/git/minorun365/marp-agent-kag status --short
git -C ~/git/minorun365/marp-agent-kag branch --show-current
```

⚠️ **未コミットの変更があったら、そこで止めてみのるんへ報告する。**
みのるんは20本以上の並行セッションを回しており、**別のセッションがKAG版で作業中の可能性がある**。
勝手に stash したりコミットしたりしない。ブランチが `main` でない場合も同じく止める。

### 3. 取り込む

```bash
git -C ~/git/minorun365/marp-agent-kag fetch upstream
git -C ~/git/minorun365/marp-agent-kag log --oneline main..upstream/main
```

差分が無ければ「取り込むものはありません」と報告して終わる。あれば：

```bash
git -C ~/git/minorun365/marp-agent-kag merge upstream/main
```

### 4. コンフリクトしたら

**自分の判断で解決してよいのは、次の場合だけ。**

| 状況 | 解決 |
|---|---|
| KAG版固有の設定（ドメイン・モデル・テーマ・デプロイ手順） | **KAG版側を採る** |
| 公開版で直したロジック・バグ修正 | **公開版側を採る** |
| 両側で別々に書き足したドキュメント | **両方を残す**（並べて統合する） |

判断がつかないものが1つでもあれば、`git merge --abort` して**みのるんへ聞く**。
中途半端に解決してpushしない。

`.gitattributes` で `merge=ours` を指定しているファイル（`cdk.json` `AGENTS.md` `CLAUDE.md`
`README.md` `LICENSE`）は、そもそもコンフリクトせずKAG版の内容が残る。
新しくそういうファイルが増えたら `.gitattributes` へ足す。

### 5. テストを通してからpush

```bash
cd ~/git/minorun365/marp-agent-kag/agent && uv run --with pytest python -m pytest ../tests/ -q
cd ~/git/minorun365/marp-agent-kag && npm run lint && npm run test
```

**落ちたら push しない。** マージで壊れたということなので、原因を直すか `git merge --abort` する。

通ったら push する。KAG版は `github`（GitHub.com・プライベート）と `origin`（GHE）の
2つのリモートを持つので、**現在のブランチが追跡している側へ push する**（`git push` だけでよい）。

### 6. 本番へ反映するかは別の判断

**マージしただけではKAG版の本番は変わらない。** 取り込んだ内容がエージェントの挙動や
画面に影響するなら、KAG版のデプロイが要る:

```bash
cd ~/git/minorun365/marp-agent-kag && npm run infra:diff   # 削除差分が無いことを先に確認
cd ~/git/minorun365/marp-agent-kag && npm run infra:deploy
cd ~/git/minorun365/marp-agent-kag && npm run prod:verify
cd ~/git/minorun365/marp-agent-kag && npm run prod:smoke
```

ドキュメントだけの取り込みならデプロイは不要。**判断して、やるなら実行し、報告に書く。**

## KAG版で得た知見を公開版へ戻したいとき

**この経路では戻さない。** KAG版には社内固有のテーマ・ドメイン・移行元リソースIDが入っており、
逆方向のマージは**公開リポジトリへ社内情報が流れる経路**になる。
公開版にも当てはまる知見は、**公開版側で書き直してコミットする**。

そのため、共通のドキュメント（`docs/knowledge/` など）は**公開版で書き、マージで流す**のが正しい向き。
KAG固有の記述はKAG版の `docs/knowledge/kag-specific.md` と `docs/kag-migration.md` にだけ置く。
