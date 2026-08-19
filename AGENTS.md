# AGENTS.md

This file provides guidance to coding agents (Claude Code / Codex) when working with code in this repository.

## プロジェクト概要

「パワポ作るマン」- AIがMarp形式でスライドを自動生成するWebアプリ。CloudFront から画面を配信し、ブラウザが Amazon Bedrock AgentCore Runtime へ直接つながる。インフラは AWS CDK を CDKD でデプロイする。

## 開発コマンド

```bash
# AWS認証（バックエンド付きのローカル起動前に必要）
aws login

# メイン画面だけ（AWS不要）
npm run dev:ui

# 普段の機能開発（Cognito / AgentCore ローカル）
npm run dev

# 配信経路まで含めた確認
npm run dev:full

# 認証スキップでUIのみ確認
npm run dev:ui

# リント
npm run lint

# ビルド
npm run build

# テスト（フロントエンド）
npm run test

# テスト（バックエンド）
python -m pytest tests/

# インフラ
npm run infra:synth
npm run infra:diff
npm run infra:dry-run
```

## アーキテクチャ

```
[ブラウザ] ←→ [React + Tailwind] ←SSE→ [AgentCore Runtime]
                                              │
                                              ├── Strands Agent (Python)
                                              ├── Grok 4.6（標準。Bedrock Mantle / us-west-2）
                                              │   Sonnet 4.6は停止中の表示でUIに残す。Kimi K2.5 / GPT-5.6 Sol / GLM-5等は設定保持・無効化中
                                              └── Marp CLI (PDF/PPTX/編集可能PPTX変換)
```

### ディレクトリ構成

| パス | 内容 |
|------|------|
| `src/` | Reactフロントエンド |
| `src/hooks/api/` | API呼び出し（agentCoreClient, exportClient） |
| `src/hooks/streaming/` | SSE処理（sseParser） |
| `src/hooks/mock/` | モックモード用（mockClient） |
| `src/components/Chat/` | チャットUI（index, ChatInput, ChatInput.test, MessageList, MessageBubble, StatusMessage, constants, types） |
| `src/components/Chat/hooks/` | Chat専用フック（useChatMessages, useStreamingText, useTipRotation） |
| `src/components/` | その他UIコンポーネント（SlidePreview, ShareConfirmModal, ShareResultModal） |
| `infra/` | CDK アプリ（Foundation / Auth / Agent / Web） |
| `amplify/agent/runtime/` | Pythonエージェント本体（現行本番もこのパス） |
| `amplify/agent/runtime/tools/` | ツール定義（output_slide, web_search, generate_tweet_url, http_request） |
| `amplify/agent/runtime/exports/` | PDF/PPTX変換（slide_exporter） |
| `amplify/agent/runtime/session/` | セッション管理（manager） |
| `amplify/agent/runtime/sharing/` | 共有機能（s3_uploader） |
| `docs/knowledge/` | 詳細なナレッジベース（下記参照） |

### 主要な技術スタック

- **フロントエンド**: React 19 + Vite + Tailwind CSS v4
- **バックエンド**: Bedrock AgentCore + Strands Agents (Python)
- **認証**: Cognito User Pools（ブラウザは Amplify Auth クライアント）
- **IaC**: AWS CDK + CDKD
- **Web配信**: CloudFront + Lambda Web Adapter

## ナレッジベース

詳細な技術情報は `docs/knowledge/` に分割して蓄積。トラブルシューティングや実装パターンはこちらを参照。

| ファイル | 内容 |
|----------|------|
| [setup.md](docs/knowledge/setup.md) | 使用ライブラリ、Python環境管理（uv） |
| [backend.md](docs/knowledge/backend.md) | AgentCore SDK、Strands Agents、セッション管理、Observability |
| [cdk.md](docs/knowledge/cdk.md) | AgentCore CDK。現行の CDKD と Amplify 時代の Hotswap 知見 |
| [marp.md](docs/knowledge/marp.md) | Marp CLI、テーマ、Marp Core |
| [frontend.md](docs/knowledge/frontend.md) | React、Tailwind CSS、フロントエンド構成 |
| [amplify.md](docs/knowledge/amplify.md) | Amplify Gen2 時代の Cognito・ビルド知見（現行本番の手順ではない） |
| [features.md](docs/knowledge/features.md) | API接続、シェア機能、共有機能、ローカル開発 |
| [temp-improvement.md](docs/temp/temp-improvement.md) | セッション単価改善（分析・施策・効果測定） |

## CloudWatch Logs 調査

CloudWatch Logs の調査には以下の優先順位で手段を選択する：

### 1. CloudWatch MCP サーバー（推奨）

`awslabs-cloudwatch-mcp-server` の MCP ツールを使う。`mcp__awslabs-cloudwatch-mcp-server__*` で自動承認済み。
- `describe_log_groups` → `execute_log_insights_query` → `get_logs_insight_query_results` の流れで調査する
- ログ調査をサブエージェントに委任する場合は `app-test-debug-agent` や `general-purpose` など MCP アクセス可能なエージェントを使う

### 2. Bash フォールバック（MCP が disconnected の場合）

MCP サーバーが利用できない場合のみ、Bash で `aws logs` コマンドを使う。**以下のルールを必ず守ること：**

- **コマンドは必ず `aws` で始める**（先頭にコメント `#` や `sleep` を付けない）
- **1つの Bash 呼び出しに1つの aws コマンド**（複数コマンドを `&&` や改行で繋げない）
- 理由: 自動承認パターン `Bash(aws:*)` は、コマンドの**先頭が `aws` で始まる単一行コマンド**にのみマッチする。複数行コマンドやコメント付きコマンドはマッチせず手動承認になる

## デプロイ先情報の取り扱い

- このリポジトリが公開されていることと、本番環境のAWSアカウント所有者は別の情報として扱う。
- ローカル開発用のAWS profile名、残存する旧リソースから、現行の本番デプロイ先を推測しない。
- 本番環境を調査するときは、Git追跡対象外の運用設定を使い、リポジトリURL・ブランチ・現行Runtimeを照合して対象を特定する。
- AWSアカウントID、profile対応表、組織名とデプロイ先の関係、実リソースIDは、公開ファイル・コミットメッセージ・リリースノートへ記載しない。
- これらの対応表を含む運用スキルはローカル専用とし、Gitへ追加しない。

### Git push と AWS デプロイは分ける

`main` への push は公開リポジトリの正本を更新するだけで、本番 AWS は自動では変わらない。本番反映は CDKD を明示実行する。

旧 Amplify Gen2 の自己ホスト手順と `amplify.yml` は `legacy/amplify` ブランチに残してある。旧 Amplify アプリは切り戻し用に残し、`main` の自動ビルドは止めてある。

⚠️ **「直したはずの修正が消えている」と言われたら、`main` の履歴だけで否定しない。**
新基盤への移行期は `codex/pawapo-rearchitecture` のような作業ブランチから本番へ直接デプロイしていた時期があり、
**そこで入れた修正が `main` へマージされないまま残る**。その後 `main` を正としてデプロイした瞬間に、
本番だけ静かに巻き戻る。テストもビルドも通り、当時の対応レポートは「デプロイ完了」と書いてあるので気づけない。

```bash
git log <ブランチ> --not main --oneline     # main に入っていないコミットを洗う
git merge-base --is-ancestor <sha> HEAD     # 特定コミットが main にあるか
```

> 由来: 2026-08-18、ダイナミックアイランド周りの段差の再発。2026-08-15 に入れた 2c0270c
> （ヘッダー背景を2層にして上端を単色帯と揃える）が `main` に一度も入っておらず、
> 「コードは巻き戻っていない」と誤って報告した。過去の対応レポートに実装内容が書かれていたので、
> **リポジトリの履歴より先に、共有くんの過去レポートを読むほうが速い場面がある**。

テーマCSS（`amplify/agent/runtime/*.css` は `.gitignore` 対象のコピー）は
`npm run infra:synth` / `infra:diff` / `infra:dry-run` / `infra:deploy` が `copy-themes` を実行して配る。
手で `cdkd` を直接叩くときは、先に `npm run copy-themes` を実行する（忘れるとプレビューだけ直って書き出しが古いままになる）。

⚠️ **本番へは `npm run infra:deploy` や素の `cdkd` を直接使わない。** このCDKアプリは
context の有無でリソースを作るかどうかが決まるため、1つでも落とすと既存リソースが
**削除差分**として出る（Googleログイン一式、予算アラートなど）。本番デプロイは
`deploy-prod` スキル（ローカル専用）のラッパー経由で行い、`diff` で「変更したはずのない
スタックが No changes detected か」を先に確認する。

### デプロイの完了条件は「検査2本が通ること」

**`Deployment completed successfully` は動作確認ではない。** 2026年8月に3件続けて、
デプロイが成功したのに利用者の経路が壊れている事故が起きた（コンテナへのファイル同梱漏れで
生成が約28時間全滅、移行元の世代漏れで423人がログイン不可、リクエストヘッダーの許可漏れで
利用統計が空）。3件とも**設定が落ちてもエラーも警告も出ない**性質で、状態表示・HTTP 200・
テストの成功では捕まらなかった。

```bash
npm run prod:verify   # 構成：本番の実リソースを読み、期待値と突き合わせる
npm run prod:smoke    # 経路：ログイン→生成→識別記録→PDF書き出しを実際に通す
```

どちらかが落ちたらデプロイは完了していない。直すか切り戻すまで完了報告しない。

**「落ちても無症状な設定」を新しく足したときは、`infra/scripts/verify-production.mjs` へ
検査を1項目足すところまでを1セットにする。** その設定が外れたときエラーになるなら不要、
何も起きないまま機能が静かに欠けるなら必須、と判断する。

⚠️ **`Deployment completed successfully` の下に、Dockerのpush失敗が隠れることがある。**
ECRの認証トークンは12時間で切れる。切れた状態でデプロイすると、
**スタックのデプロイ自体は「成功」と表示されたまま、コンテナイメージだけが上がらない**。
しかも `prod:verify` は13項目すべて合格する（構成は正しく、古いイメージでRuntimeはREADYのまま）。

```
✓ Deployment completed successfully
Error: 1 node(s) failed, 1 skipped:
  - asset-publish:PawapoAgent:docker:...: Docker push failed:
    error from registry: Your authorization token has expired.
```

**成功表示ではなく終了コードで判定する。** バックグラウンド実行なら通知の status を見る。
踏んだら、ECRへ入り直してデプロイし直す。

```bash
aws ecr get-login-password --profile <本番profile> --region us-east-1 | docker login --username AWS --password-stdin <アカウントID>.dkr.ecr.us-east-1.amazonaws.com
```

> 由来: 2026-08-18、Kimi品質改善のデプロイで発生。出力末尾が成功表示だったため完了と読みかけたが、
> 終了コードが1だった。`prod:verify` も13/13で合格していたので、**検査2本だけでは捕まらない**。
> コード変更を伴うデプロイでは `prod:smoke` まで通して初めて完了と言える。

利用状況の確認は `npm run prod:usage`（旧 `check-app-stats/run.sh` は移行前専用なので使わない）。

## E2Eテスト手順

コード変更後のE2Eテストは、ログイン済みのブラウザでローカルURLを開いて確認する。

### 手順

1. **AWSセッション確認**: `aws sts get-caller-identity`
2. **起動**: 目的に合わせて `npm run dev:ui` / `npm run dev` / `npm run dev:full`
3. **ブラウザで確認**:
   - ログインページの表示確認
   - テスト用ユーザーでログイン（`.env`のTEST_USER_EMAIL/TEST_USER_PASSWORD使用）
   - モデルセレクターの表示・選択肢確認
   - スライド生成の動作確認（必要に応じて）
4. **テスト完了後**: 起動したプロセスを停止

## Git コミットルール

- コミットメッセージは **1行の日本語でシンプルに**
- `Co-Authored-By: Claude` `Co-Authored-By: Codex` などの **AI協働の痕跡は入れない**

## KAG社内版環境（別リポジトリ）

KAG社内版は完全に別のGitHubリポジトリ（`minorun365/marp-agent-kag`）で管理されている（ローカル: `../marp-agent-kag`）。

KAG社内版に変更を反映する際は、**KAG社内版リポジトリに移動してチェリーピック** する：

```bash
cd ../marp-agent-kag
git fetch upstream
git cherry-pick <commit-hash>
git push origin main
```

**注意**: 公開リポジトリには、実際の AWS アカウントID、User Pool ID、証明書ARN、IAM Role ARN などの具体値を書かない。KAG社内版固有の設定やデプロイ先詳細は KAG社内版リポジトリ側だけに保持する。

## リリース管理（セマンティックバージョニング）

mainブランチへの機能追加デプロイ後、リリースを作成する。

### バージョン番号の決め方

| 種類 | 例 | 用途 |
|------|-----|------|
| メジャー | v1.0.0 → v2.0.0 | 破壊的変更 |
| マイナー | v1.0.0 → v1.1.0 | 新機能追加 |
| パッチ | v1.0.0 → v1.0.1 | バグ修正 |

### リリース作成手順

1. `git log <前回タグ>..HEAD --oneline` で前回リリースからの全コミットを確認
2. コミット内容を分類してリリースノート本文を作成
3. `--notes` オプションで本文を指定してリリース作成（`--generate-notes` は使わない）

```bash
gh release create vX.Y.Z --title "vX.Y.Z 変更内容の要約" --notes "$(cat <<'EOF'
## 新機能
- 機能の説明

## 改善
- 改善の説明

## バグ修正
- 修正の説明

**Full Changelog**: https://github.com/minorun365/marp-agent/compare/v前回...vX.Y.Z
EOF
)"
```

### リリースノートのルール

- **`--generate-notes` は使わない**（中身スカスカになるため、必ず手書きする）
- **絵文字は使用しない**（シンプルに保つ）
- 「新機能」「改善」「バグ修正」のカテゴリに分類する
- 各項目は具体的に何が変わったかを書く（コミットメッセージのコピペではなく、ユーザー視点で）

### リリース対象外

- ドキュメントのみの変更
- CI/CD・開発環境の設定変更
- **KAG社内版リポジトリ**（このリポジトリではリリースを作成しない）
