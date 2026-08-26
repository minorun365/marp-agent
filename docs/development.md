# 開発ガイド

このドキュメントはローカル開発とデプロイの手順をまとめたものです。

---

## クイックスタート

```bash
# AWS認証（バックエンド付きのローカル起動前に必要）
# 利用するアカウントのSSOプロファイルを指定する
aws sso login --profile <SSOプロファイル>

# メイン画面だけ（AWS不要）
npm run dev:ui

# 普段の機能開発（Cognito / AgentCore ローカル）
npm run dev

# 配信経路まで含めた確認
npm run dev:full
```

Git への push では本番 AWS は変わりません。本番反映は CDKD を明示実行します。Amplify Gen2 の手順は `legacy/amplify` ブランチを参照してください。

---

## ローカル開発サーバー

| 目的 | コマンド | AWS |
|---|---|---|
| メイン画面だけ | `npm run dev:ui` | 不要 |
| 認証画面だけ | `npm run dev:auth` | 不要 |
| 普段の機能開発 | `npm run dev` | Cognito、Bedrock、Secrets Manager |
| 配信経路まで | `npm run dev:full` | 本番相当の Cognito と CDKD 状態 |

- `npm run dev` は Vite（http://localhost:5173）と AgentCore ローカルを起動する
- `npm run dev:full` は CloudFront 相当経路（http://localhost:8080）まで含める
- AWS を使う入口では `AWS_PROFILE` を付けるか、デフォルトの認証情報チェーンを使う

### 認証つきで起動するときの接続設定

`npm run dev` / `npm run dev:full` はログインを通すので、リポジトリ直下に
`runtime-config.local.json` が要る。**本番の `/runtime-config.json` と同じ形**にしてあるので、
ローカルと本番でブラウザから見た経路が変わらない。Git 管理外なので端末ごとに置く。

```json
{
  "auth": {
    "region": "us-east-1",
    "userPoolId": "us-east-1_xxxxxxxxx",
    "userPoolClientId": "xxxxxxxxxxxxxxxxxxxxxxxxxx",
    "cognitoDomain": "pawapo-minoruonda.auth.us-east-1.amazoncognito.com"
  },
  "agent": {
    "runtimeArn": "arn:aws:bedrock-agentcore:us-east-1:<アカウント>:runtime/pawapo_agent-xxxxxxxx",
    "protocol": "HTTP"
  },
  "sharing": { "baseUrl": "https://pawapo.minoruonda.com/slides" },
  "environment": "local"
}
```

**いちばん確実なのは、本番が返しているものをそのまま持ってくること。**
`environment` だけ `local` に書き換えて、取り違えを防ぐ。

```bash
curl -sS https://pawapo.minoruonda.com/runtime-config.json > runtime-config.local.json
```

`cognitoDomain` を入れるとローカルでも Google ログインが使える
（Cognito のアプリクライアントに `http://localhost:5173/` が登録済み）。
外すと Google のボタンが出なくなり、メールとパスワードだけになる。

ファイルが無い、または `auth.userPoolId` と `agent.runtimeArn` が欠けていると、
Vite が `/runtime-config.json` に 503 と理由を返す。

`npm run dev` は `VITE_AGENT_ENDPOINT=/local-agent` を渡すので、スライド生成は
手元の AgentCore へ向く。`agent.runtimeArn` が本番を指していても、生成は本番へ飛ばない。
ログインだけは本番の Cognito を通る（専用の検証用 User Pool は移行時に廃止した）。

`npm run dev:ui` と `npm run dev:auth` はモックなので、このファイルは要らない。

---

## インフラ（CDK / CDKD）

```bash
npm run infra:synth
npm run infra:diff
npm run infra:dry-run
```

テーマCSSはこれらのコマンドが `copy-themes` で配ります。手で `cdkd` を叩くときは、先に `npm run copy-themes` を実行してください。

`cdk.json` のドメインなどの context は作者の公開アプリ向けです。自分のAWSに載せるときは書き換えてください。

---

## 環境変数

プロジェクトルートの `.env` に置きます。

```bash
VITE_USE_MOCK=false
TAVILY_API_KEYS=tvly-xxxxx,tvly-yyyyy
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=TestPass123!
```

---

## KAG社内版リポジトリへの変更反映

KAG社内版は別リポジトリで運用している。共通変更はマージではなく cherry-pick で反映する。KAG社内版固有のテーマ、ドメイン、認証制限などをこの一般公開リポジトリへ混ぜないため。

```
.
├── marp-agent/             # 一般公開版
└── marp-agent-kag/         # 社内向け別リポジトリ
```

### 反映例

```bash
# 一般公開版で作業後、KAG社内版に反映
cd ../marp-agent-kag
git cherry-pick <commit-hash>
git push origin main
```

**注意**: 公開リポジトリには、一般公開版やKAG社内版の実際の AWS アカウント ID、User Pool ID、証明書 ARN、Role ARN などの具体値は書かない。KAG社内版の運用方針や反映手順は記載してよい。

---

## 本番デプロイ

GitHub へ push しても本番 AWS は変わりません。差分確認、dry-run、明示スタック指定のあとで CDKD を実行します。

複数セッションで作業している場合は、push 前に `git log --oneline origin/main..HEAD` で送信対象を確認する。今回の作業と無関係なコミットが含まれていれば push しない。

旧 Amplify Gen2 の自己ホストと `[skip-cd]` は `legacy/amplify` ブランチの手順です。

---

## トラブルシューティング

### Runtime重複エラー

```
Resource of type 'AWS::BedrockAgentCore::Runtime' with identifier 'xxx' already exists.
```

```bash
aws bedrock-agentcore-control list-agent-runtimes --region us-east-1
aws bedrock-agentcore-control delete-agent-runtime --agent-runtime-id {runtimeId} --region us-east-1
```

Amplify sandbox の起動・削除は `legacy/amplify` ブランチを使います。

---

## 関連ドキュメント

- `docs/new-architecture.html` - 新基盤の構成
- `docs/knowledge/` - 技術的な知見・調査結果
- `docs/spec.md` - 機能仕様
- `docs/todo.md` - タスク管理
