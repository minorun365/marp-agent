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
| モデル選択 | 高品質のSonnet 4.6と高速なKimi K2.5を用途に応じて切り替え |

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
| 認証UI | Amplify UI React |
| AIエージェント | Strands Agents (Python) |
| LLM | Bedrock Claude Sonnet 4.6（デフォルト）/ Kimi K2.5（高速オプション） |
| スライド変換 | Marp Core（プレビュー）/ Marp CLI（PDF生成） |
| 認証 | Amplify Auth (Cognito) |
| インフラ | AWS CDK + Amplify Gen2 |
| ランタイム | Bedrock AgentCore |
| Observability | OpenTelemetry (ADOT) → CloudWatch |

## 環境分岐

| 環境 | ビルド方式 |
|------|-----------|
| sandbox（ローカル） | `fromAsset()` + ローカルARM64ビルド |
| 本番（Amplify Console） | `deploy-time-build` + CodeBuild ARM64 |

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
| 共通のバグ修正・機能追加 | 一般公開版 | KAG社内版へ cherry-pick |
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
- 共通機能は一般公開版で開発し、必要に応じてKAG社内版へ cherry-pick する

## タスク管理

→ [TODO.md](./TODO.md) を参照

## 解決済みの問題

| 問題 | 解決策 |
|------|--------|
| Docker Hubレート制限（429エラー） | ECR Public Gallery使用（`public.ecr.aws/docker/library/python:...`） |
| Amplify ConsoleにDockerがない | カスタムビルドイメージ設定 |

## ディレクトリ構成

```
marp-agent/
├── docs/                        # ドキュメント
│   ├── PLAN.md                  # 実装計画
│   ├── TODO.md                  # タスク管理
│   ├── SPEC.md                  # 仕様書
│   └── KNOWLEDGE.md             # ナレッジベース
├── public/
│   ├── agentcore.png            # ファビコン
│   ├── ogp.jpg                  # OGP画像
│   └── robots.txt               # クローラー制御
├── amplify/
│   ├── auth/resource.ts         # Cognito認証設定
│   ├── agent/
│   │   ├── resource.ts          # AgentCore CDK定義
│   │   └── runtime/
│   │       ├── Dockerfile       # エージェントコンテナ
│   │       ├── agent.py         # Strands Agent実装
│   │       └── border.css       # カスタムテーマ（PDF用）
│   └── backend.ts               # バックエンド統合
├── tests/
│   └── e2e-test.md              # E2Eテストチェックリスト
├── src/
│   ├── main.tsx                 # Viteエントリーポイント
│   ├── App.tsx                  # メインアプリ
│   ├── index.css                # グローバルスタイル
│   ├── components/
│   │   ├── Chat.tsx             # チャットUI
│   │   └── SlidePreview.tsx     # スライドプレビュー
│   ├── hooks/useAgentCore.ts    # AgentCore API呼び出し
│   └── themes/border.css        # カスタムテーマ（プレビュー用）
└── package.json
```

## 決定済み事項

| 項目 | 決定 |
|------|------|
| 認証 | 本番のみCognito認証 |
| テーマ | borderテーマ（コミュニティテーマ） |
| モデル | Sonnet 4.6がデフォルト。Kimi K2.5を選択可能。Sonnet 5、GLM-5、Opus 4.6は設定保持・無効 |
| リージョン | us-east-1 / us-west-2 / ap-northeast-1 |

## 参考リンク

- [Marp公式](https://marp.app/)
- [Strands Agents](https://github.com/strands-agents/strands-agents)
- [Amplify Gen2](https://docs.amplify.aws/gen2/)
- [Bedrock AgentCore](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-agentcore.html)
- [deploy-time-build](https://github.com/tmokmss/deploy-time-build)
