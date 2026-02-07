# プロジェクト固有ルール

> **開発手順は `docs/DEVELOPMENT.md` を参照** - サンドボックス起動、デプロイ、環境変数の設定方法など

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

## E2Eテスト手順

コード変更後のE2Eテストは以下の手順で実施する。Chrome DevTools MCPを使用してブラウザ操作を自動化する。

### 手順

1. **SSOセッション確認**: `aws sts get-caller-identity --profile sandbox`
2. **サンドボックス起動**: `npm run sandbox` にprofileオプション `--profile sandbox` を追加してバックグラウンド実行
3. **フロントエンド起動**: `npm run dev`（別プロセスでバックグラウンド実行）
4. **Chrome DevTools MCPで確認**:
   - `localhost:5173` にアクセス
   - ログインページの表示確認
   - テスト用ユーザーでログイン（`.env`のTEST_USER_EMAIL/TEST_USER_PASSWORD使用）
   - モデルセレクターの表示・選択肢確認
   - スライド生成の動作確認（必要に応じて）
5. **テスト完了後**: 起動したプロセスを停止

### 注意事項

- サンドボックスのデプロイには3-5分かかる（Hotswap時は30秒程度）
- `npm run sandbox` は `--profile sandbox` が必要（package.jsonのスクリプトには含まれていない）

## Git コミットルール

- コミットメッセージは **1行の日本語でシンプルに**
- `Co-Authored-By: Claude` などの **AI協働の痕跡は入れない**

## Git ワークツリー構成

kagブランチは別のワークツリーで管理されている（同じ階層の `../marp-agent-kag`）。

kagに変更を反映する際は、`git switch kag` ではなく **kagのワークツリーで直接作業** する：

```bash
cd ../marp-agent-kag
git cherry-pick <commit-hash>
git push origin kag
```

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
- **kagブランチ**（リリースは作成しない）
