# パワポ作るマン（marp-agent）実装計画

## 概要

MarpでスライドをAI生成するWebアプリケーション。非エンジニアでもブラウザから指示を出して、スライドの作成・編集・プレビュー・PDFダウンロードができる。

## 命名規則

| 用途 | 名称 |
|------|------|
| アプリ名（表示用） | パワポ作るマン |
| リポジトリ名 | marp-agent |
| リソース名（AWS） | marp-agent / marp |

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                        AWS Cloud                                 │
│  ┌─────────────────┐    ┌─────────────────────────────────────┐ │
│  │    Amplify      │    │         AgentCore Runtime           │ │
│  │  ┌───────────┐  │    │  ┌─────────────────────────────────┐│ │
│  │  │   React   │  │───▶│  │      Strands Agent             ││ │
│  │  │ Frontend  │  │SSE │  │  ┌─────────┐  ┌─────────────┐  ││ │
│  │  └───────────┘  │    │  │  │ Claude  │  │ Marp Tools  │  ││ │
│  │  ┌───────────┐  │    │  │  │ Sonnet  │  │ ・generate  │  ││ │
│  │  │  Cognito  │  │    │  │  └─────────┘  │ ・edit      │  ││ │
│  │  │   認証    │  │    │  │              │ ・export    │  ││ │
│  │  └───────────┘  │    │  └─────────────────────────────────┘│ │
│  └─────────────────┘    └─────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | React + TypeScript (Vite) + Tailwind CSS v4 |
| AIエージェント | Strands Agents (Python) |
| LLM | Bedrock Claude Sonnet 4.5 |
| スライド変換 | Marp CLI / Marp Core |
| 認証 | Amplify Auth (Cognito) |
| インフラ | AWS CDK + Amplify Gen2 |
| ランタイム | Bedrock AgentCore |

## 環境分岐

| 環境 | ビルド方式 |
|------|-----------|
| sandbox（ローカル） | `fromAsset()` + ローカルARM64ビルド |
| 本番（Amplify Console） | `deploy-time-build` + CodeBuild ARM64 |

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
- [x] リアルタイムプレビュー（borderテーマ）
- [x] PDFダウンロード（日本語対応）
- [x] Web検索（Tavily）

### 追加機能（Phase 2）

| タスク | 工数 |
|--------|------|
| ~~箇条書き行頭記号問題~~ | ✅ |
| ~~プレビュー画面から修正指示ボタン~~ | ✅ |
| ~~会話履歴の保持（セッションID）~~ | ✅ |
| チャット画面の横幅制限 | 小 |
| チャット応答末尾のカーソル記号を除去 | 小 |
| チャット応答のマークダウンレンダリング | 中 |
| スライドプレビューのレスポンシブ対応（スマホで横幅に収まるよう調整） | 小 |
| テーマ選択 | 中 |
| スライド編集（マークダウンエディタ） | 大 |
| 画像アップロード・挿入 | 大 |
| スライド履歴管理 | 大 |

### 既知の問題・技術的負債

| 問題 | 対応 |
|------|------|
| Tavily `get_search_context()` が非推奨 | 新しいAPIへの移行が必要（`agent.py:30`） |

## ディレクトリ構成

```
marp-agent/
├── docs/                        # ドキュメント
│   ├── PLAN.md                  # 実装計画
│   ├── SPEC.md                  # 仕様書
│   └── KNOWLEDGE.md             # ナレッジベース
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
│   ├── App.tsx                  # メインアプリ
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
