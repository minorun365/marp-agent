# 開発ガイド

このドキュメントはローカル開発・サンドボックス・デプロイの手順をまとめたものです。

---

## クイックスタート

```bash
# フロントエンドのローカル開発サーバー起動
npm run dev

# サンドボックス起動（ブランチ名が自動で識別子になる）
npm run sandbox

# 認証スキップでUIだけ確認したい場合
VITE_USE_MOCK=true npm run dev
```

---

## ローカル開発サーバー

### フロントエンドのみ起動

```bash
npm run dev
```

- Vite開発サーバーが起動（http://localhost:5173）
- ホットリロード対応
- バックエンド（AgentCore）は別途サンドボックスが必要

### 認証スキップ（モックモード）

```bash
VITE_USE_MOCK=true npm run dev
```

- Cognito認証をスキップしてUIのみ確認
- デザイン調整やコンポーネント開発に便利

---

## サンドボックス（Amplify sandbox）

### 起動コマンド

```bash
npm run sandbox
```

### 仕組み

このコマンドは以下を自動で行う：

1. `.env` から環境変数を読み込み
2. 現在のブランチ名を取得
3. `sb-{ブランチ名}` を識別子としてサンドボックス起動

```bash
# 実際に実行されるコマンド
export $(grep -v '^#' .env | xargs) && \
  BRANCH=$(git branch --show-current | tr '/' '-') && \
  npx ampx sandbox --identifier "sb-${BRANCH}"
```

### 識別子の命名規則

| 環境 | 命名規則 | 例 |
|------|----------|-----|
| **本番 Amplify** | ブランチ名そのまま | `main`, `kag` |
| **サンドボックス** | `sb-` プレフィックス付き | `sb-main`, `sb-kag` |

これによりCloudFormationスタック名やリソース名が衝突しない。

### 追加オプション

```bash
# ブラウザを自動で開かない
npm run sandbox -- --no-open

# 特定のAWSプロファイルを使用
npm run sandbox -- --profile my-profile
```

### サンドボックスの削除

```bash
npx ampx sandbox delete --yes
```

Dockerイメージのキャッシュをクリアしたい場合や、環境変数が反映されない場合に実行。

---

## 環境変数

### .env ファイル

```bash
# ローカル開発時は認証スキップ
VITE_USE_MOCK=false

# Tavily APIキー
TAVILY_API_KEY=tvly-xxxxx
TAVILY_API_KEY2=tvly-xxxxx  # フォールバック用
TAVILY_API_KEY3=tvly-xxxxx  # フォールバック用
```

### サンドボックスでの読み込み

`npm run sandbox` は `.env` の内容を自動でシェル環境変数としてエクスポートする。
`dotenv/config` に依存せず確実に読み込まれる。

---

## Git ワークツリー構成

このプロジェクトでは `main` と `kag` ブランチを並行開発している。

```
~/git/minorun365/
├── marp-agent/          # main ブランチ
└── marp-agent-kag/      # kag ブランチ（ワークツリー）
```

### kagブランチへの変更反映

```bash
# mainで作業後、kagに反映
cd ../marp-agent-kag
git cherry-pick <commit-hash>
git push origin kag
```

**注意**: `git switch kag` ではなく、kagのワークツリーで直接作業する。

---

## 本番デプロイ

### 自動デプロイ

GitHubにプッシュすると、Amplify Consoleが自動でビルド・デプロイを実行。

```bash
git push origin main  # mainブランチにデプロイ
git push origin kag   # kagブランチにデプロイ
```

### デプロイ状況の確認

```bash
# Amplify CLIで確認
aws amplify list-jobs --app-id d3i0gx3tizcqc1 --branch-name main --region us-east-1
```

または `/check-deploy-status` スキルを使用。

### デプロイスキップ

ドキュメントのみの変更でデプロイを避けたい場合：

```bash
git commit -m "ドキュメント更新 [skip-cd]"
```

---

## トラブルシューティング

### サンドボックスが起動しない

```bash
# 既存のサンドボックスを削除
npx ampx sandbox delete --yes

# 再起動
npm run sandbox
```

### 環境変数が反映されない

AgentCore Hotswapは環境変数の変更を反映しない。サンドボックスを完全削除して再起動。

### Runtime重複エラー

```
Resource of type 'AWS::BedrockAgentCore::Runtime' with identifier 'xxx' already exists.
```

CLIでRuntimeを削除：

```bash
aws bedrock-agentcore-control list-agent-runtimes --region us-east-1
aws bedrock-agentcore-control delete-agent-runtime --agent-runtime-id {runtimeId} --region us-east-1
```

---

## 関連ドキュメント

- `docs/KNOWLEDGE.md` - 技術的な知見・調査結果
- `docs/SPEC.md` - 機能仕様
- `docs/TODO.md` - タスク管理
