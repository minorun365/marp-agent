# プロジェクト固有ルール

## AWS Amplify 環境変数の更新

**重要**: AWS CLI で Amplify のブランチ環境変数を更新する際、`--environment-variables` パラメータは**上書き**であり**マージではない**。

### 正しい手順

1. **既存の環境変数を取得**
   ```bash
   aws amplify get-branch --app-id {appId} --branch-name {branch} --region {region} \
     --query 'branch.environmentVariables' --output json
   ```

2. **既存 + 新規をすべて指定して更新**
   ```bash
   aws amplify update-branch --app-id {appId} --branch-name {branch} --region {region} \
     --environment-variables KEY1=value1,KEY2=value2,NEW_KEY=new_value
   ```

### NG例（既存変数が消える）

```bash
# これだと既存の環境変数がすべて消えてNEW_KEY=valueだけになる
aws amplify update-branch --environment-variables NEW_KEY=value
```

### 補足

- **アプリレベルの環境変数**（`aws amplify get-app`）はブランチ更新で消えない
- **ブランチレベルの環境変数**（`aws amplify get-branch`）は上書きされる

## Git コミットルール

- コミットメッセージは **1行の日本語でシンプルに**
- `Co-Authored-By: Claude` などの **AI協働の痕跡は入れない**

## リリース管理（セマンティックバージョニング）

mainブランチへの機能追加デプロイ後、リリースを作成する。

### バージョン番号の決め方

| 種類 | 例 | 用途 |
|------|-----|------|
| メジャー | v1.0.0 → v2.0.0 | 破壊的変更 |
| マイナー | v1.0.0 → v1.1.0 | 新機能追加 |
| パッチ | v1.0.0 → v1.0.1 | バグ修正 |

### リリース作成コマンド

```bash
gh release create vX.Y.Z --generate-notes --title "vX.Y.Z 変更内容の要約"
```

### リリース対象外

- ドキュメントのみの変更
- CI/CD・開発環境の設定変更
