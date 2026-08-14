# パワポ作るマン（marp-agent）実装計画

## 概要

MarpでスライドをAI生成するWebアプリケーション。非エンジニアでもブラウザから指示を出して、スライドの作成・編集・プレビュー・PDFダウンロードができる。

## 主要機能

| 機能 | 説明 |
|------|------|
| スライド生成 | チャットで指示するとMarp形式のスライドを自動生成 |
| スライド修正 | 生成済みスライドに対して「ここを直して」と編集指示 |
| 会話履歴保持 | セッション内で会話を継続（コンテキスト維持） |
| リアルタイムプレビュー | ブラウザ上でスライドを即座に確認 |
| PDFダウンロード | 日本語対応のPDFを生成・ダウンロード |
| Web検索 | Tavilyで最新情報を調べてスライドに反映 |
| Xシェア | PDFダウンロード後にツイートURLを自動生成 |
| モデル選択 | Kimi K2.5を標準モデルとして試験運用。Sonnet 4.6は停止理由を表示して選択不可 |

## 命名規則

| 用途 | 名称 |
|------|------|
| アプリ名（表示用） | パワポ作るマン |
| リポジトリ名 | marp-agent |
| リソース名（AWS） | marp-agent / marp |

## アーキテクチャ

<img width="1362" height="759" alt="アーキテクチャ図" src="https://github.com/user-attachments/assets/21c580e9-6c09-4ef8-ba82-90014522871b" />

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | React + TypeScript (Vite) + Tailwind CSS v4 |
| 認証UI | アプリ内 Auth 画面（Amplify Auth クライアント） |
| AIエージェント | Strands Agents (Python) |
| LLM | Bedrock Kimi K2.5（試験運用中の標準）。Sonnet 4.6とMantle GPT-5.6 Solは設定保持・無効 |
| スライド変換 | Marp Core（プレビュー）/ Marp CLI（PDF生成） |
| 認証 | Cognito User Pools |
| インフラ | AWS CDK + CDKD |
| Web配信 | CloudFront + Lambda Web Adapter |
| ランタイム | Bedrock AgentCore |
| Observability | OpenTelemetry (ADOT) → CloudWatch |

## 環境分岐

| 環境 | ビルド方式 |
|------|-----------|
| ローカル | `npm run dev` / `npm run copy-themes` + CDKD local |
| 本番 | CDKD がコンテナイメージをビルドして AgentCore / Web に載せる |

Amplify Console の `deploy-time-build` は Gen2 時代の手段。自己ホストは [`legacy/amplify`](https://github.com/minorun365/marp-agent/tree/legacy/amplify)。

## KAG社内版運用

### 方針

一般公開版をこのリポジトリの `main` で管理し、テーマや認証制限などが異なる KAG社内版は `minorun365/marp-agent-kag` で管理する。

| リポジトリ | 用途 | 認証 |
|------------|------|------|
| 一般公開版 | 誰でも利用できる公開アプリ | 誰でも登録可 |
| KAG社内版 | KAG社内向けの別用途 | KAG社内版側で管理 |

### 変更反映の責務

| 変更内容 | 作業場所 | 反映方法 |
|---------|----------|---------|
| 共通のバグ修正・機能追加 | 一般公開版 | `src/` と `amplify/agent/runtime/` を選んで cherry-pick。`infra/` と `cdk.json` は持っていかない |
| 一般公開版のドキュメント更新 | 一般公開版 | 公開してよい内容のみ記載 |
| KAG社内版固有（テーマ、ドメイン、認証制限） | KAG社内版 | KAG社内版のみに保持 |

### 運用コマンド

**一般公開版の変更をKAG社内版に反映:**
```bash
cd ../marp-agent-kag
git cherry-pick <commit-hash>
git push
```

**特定のコミットだけ反映（cherry-pick）:**
```bash
# KAG社内版で行った共通バグ修正を一般公開版にも適用したい場合
cd ../marp-agent
git cherry-pick <commit-hash>
git push
```

### 注意事項

- KAG社内版固有の設定を一般公開版へ混ぜない
- 公開ドキュメントには、実際のAWSアカウントID、User Pool ID、証明書ARN、デプロイ先名などを書かない
- 共通のアプリコードは一般公開版で開発し、必要に応じて KAG社内版へ cherry-pick する
- 公開版 `main` は CDK、KAG 社内版は当面 Amplify のまま。インフラ定義を丸ごと混ぜない
- KAG の CDK 移行は公開版が安定してから、公開版と同じ切替手順を会社アカウント向けにやり直す

## タスク管理

→ [TODO.md](./TODO.md) を参照

## 解決済みの問題

| 問題 | 解決策 |
|------|--------|
| Docker Hubレート制限（429エラー） | ECR Public Gallery使用（`public.ecr.aws/docker/library/python:...`） |
| Amplify ConsoleにDockerがない | カスタムビルドイメージ設定（旧）。現行は CDKD |

## ディレクトリ構成

```
marp-agent/
├── docs/                        # ドキュメント
├── infra/                       # 現行の CDK（Foundation / Auth / Agent / Web）
├── amplify/agent/runtime/       # Python エージェント本体
├── src/                         # React フロントエンド
└── package.json
```

## 決定済み事項

| 項目 | 決定 |
|------|------|
| 認証 | 本番のみCognito認証 |
| テーマ | borderテーマ（コミュニティテーマ） |
| モデル | Kimi K2.5のみ有効。Sonnet 4.6は停止理由を表示して選択不可。GPT-5.6 Sol、Sonnet 5、GLM-5、Opus 4.6も設定保持・無効 |
| リージョン | 本番は us-east-1。Amplify 時代はバージニア / オレゴン / 東京も可だった |

## 参考リンク

- [Marp公式](https://marp.app/)
- [Strands Agents](https://github.com/strands-agents/strands-agents)
- [CDKD](https://github.com/go-to-k/cdkd)
- [Bedrock AgentCore](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-agentcore.html)
- [deploy-time-build](https://github.com/tmokmss/deploy-time-build)
