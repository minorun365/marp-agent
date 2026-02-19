# セットアップ・ライブラリ

## 使用ライブラリ・SDK

**方針**: すべて最新版を使用する

### フロントエンド
- React
- TypeScript
- Vite
- Tailwind CSS v4（ゼロコンフィグ、@theme でカスタムカラー定義）
- Vitest + React Testing Library（テスト）

### AWS Amplify
- @aws-amplify/backend
- @aws-amplify/ui-react

### エージェント・インフラ
- strands-agents（Python >=3.13）
- bedrock-agentcore（AgentCore SDK）
- @marp-team/marp-cli
- @aws-cdk/aws-bedrock-agentcore-alpha
- pdfplumber（PDF テキスト抽出、参考資料アップロード用）

---

## Python環境管理（uv）

### 概要
- Rustで書かれた高速なPythonパッケージマネージャー
- pip/venv/pyenvの代替

### 基本コマンド
```bash
# プロジェクト初期化
uv init --no-workspace

# 依存追加
uv add strands-agents bedrock-agentcore

# スクリプト実行
uv run python script.py
```

### AWS CLI login 認証を使う場合
```bash
uv add 'botocore[crt]'
```
※ `aws login` で認証した場合、botocore[crt] が必要
