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
| LLM | Bedrock Claude Sonnet 4.5 |
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

## ブランチ運用

### ブランチ構成

```
main (共通機能のベース)
  │
  └── kag (mainを継承 + kag固有の設定)
```

| ブランチ | 用途 | テーマ | 認証 |
|---------|------|--------|------|
| main | 一般公開版 | border | 誰でも登録可 |
| kag | KAG専用版 | kag | KAG限定 |

### ブランチごとの責務

| 変更内容 | 作業ブランチ | 反映方法 |
|---------|------------|---------|
| 共通のバグ修正・機能追加 | main | kagでmainをマージ |
| ドキュメント更新（共通） | main | kagでmainをマージ |
| kag固有（テーマ、ドメイン制限） | kag | kagのみに保持 |

### 運用コマンド

**mainの変更をkagに反映:**
```bash
git checkout kag
git merge main
git push
```

**特定のコミットだけ反映（cherry-pick）:**
```bash
# kagで行ったバグ修正をmainにも適用したい場合
git checkout main
git cherry-pick <commit-hash>
git push
```

### 注意事項

- kagをmainにマージしない（kag固有の設定がmainに混入するため）
- 共通機能は必ずmainで開発し、kagにマージで反映
- mainで変更したら、kagへのマージを忘れずに

## 進捗状況

| ステップ | 状態 |
|---------|------|
| プロジェクト初期化 | ✅ |
| エージェント実装 | ✅ |
| インフラ構築 | ✅ |
| フロントエンド実装 | ✅ |
| 統合・テスト | ✅ |
| 本番デプロイ | ✅ |

## 機能一覧

### MVP（完了）
- [x] ユーザー認証（Cognito）
- [x] チャットUI（指示入力）
- [x] スライド生成（Marp Markdown）
- [x] スライド修正（チャットで編集指示）
- [x] 会話履歴保持（セッションID管理）
- [x] リアルタイムプレビュー（borderテーマ）
- [x] 修正リクエスト（プレビューからチャットへ戻る）
- [x] PDFダウンロード（日本語対応）
- [x] Web検索（Tavily）
- [x] Xシェア機能（PDFダウンロード後に自動でツイートURL生成）
- [x] Observability（OTELトレース → CloudWatch）

### 追加機能・今後のタスク

→ [TODO.md](./TODO.md) を参照

### 既知の問題・技術的負債

なし

### 解決済みの問題

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
| モデル | Claude Sonnet 4.5 |
| リージョン | us-east-1 |

## 参考リンク

- [Marp公式](https://marp.app/)
- [Strands Agents](https://github.com/strands-agents/strands-agents)
- [Amplify Gen2](https://docs.amplify.aws/gen2/)
- [Bedrock AgentCore](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-agentcore.html)
- [deploy-time-build](https://github.com/tmokmss/deploy-time-build)
