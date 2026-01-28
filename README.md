# パワポ作るマン　by みのるん

新規アカウント作成すれば、誰でも使えます！

※1日50名を超えるとエラーになります。その際は翌日までお待ちください🙏

[pawapo.minoruonda.com](https://pawapo.minoruonda.com/)

<p>
  <img src="https://github.com/user-attachments/assets/c0f87329-0fb7-492a-9054-32811b1f6d7d" alt="イメージ1" width="49%" style="display:inline-block;" />
  <img src="https://github.com/user-attachments/assets/70be1846-37ed-4d65-8b9a-be14ccdb5b76" alt="イメージ2" width="49%" style="display:inline-block;" />
</p>


## アーキテクチャ

AWSの最新サービスを活用して、フルサーバーレスで構築。維持費はほぼClaudeのAPI料金のみです。

<img width="1362" height="759" alt="アーキテクチャ図" src="https://github.com/user-attachments/assets/21c580e9-6c09-4ef8-ba82-90014522871b" />


## デプロイ手順

自分のAWS環境にデプロイする場合の手順です。

### 前提条件

- ARMアーキテクチャのPC（MacBookなど）
- Node.js 18以上
- Docker Desktop（起動しておく）
- AWSアカウント
  - リージョンはバージニア/オレゴン/東京のいずれか
  - BedrockプレイグランドからClaudeのユースケース送信をしておく
- [Tavily](https://tavily.com/) APIキー（無料、Web検索機能に必要）

### 1. セットアップ

```bash
git clone --single-branch https://github.com/minorun365/marp-agent.git
cd marp-agent
npm install
```

### 2. 環境変数の設定

プロジェクトルートに `.env` ファイルを作成：

```
TAVILY_API_KEY=tvly-xxxxx
```

※レートリミット対策で複数キーを使う場合は `TAVILY_API_KEY2`, `TAVILY_API_KEY3` も追加可能。

### 3. sandbox環境で起動（ローカル開発）

```bash
npx ampx sandbox
```

初回はCloudFormationスタックの作成に数分かかります。完了すると `amplify_outputs.json` が生成されます。

別ターミナルでフロントエンドを起動：

```bash
npm run dev
```

### 4. 本番環境へのデプロイ（Amplify Console）

1. GitHubリポジトリをAmplify Consoleに接続
2. **ビルドイメージを変更**（Docker対応のため）：
   - Build settings → Build image settings → Custom Build Image
   - `public.ecr.aws/codebuild/amazonlinux-x86_64-standard:5.0`
3. **環境変数を設定**（Amplify Console → Environment variables）：
   - `TAVILY_API_KEY` = 取得したAPIキー
4. デプロイを実行

## 参考ブログ

[Amplify & AgentCoreのAIエージェントをAWS CDKでデプロイしよう！ - Qiita](https://qiita.com/minorun365/items/0b4a980f2f4bb073a9e0)
