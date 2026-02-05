# AgentCore CDK・Hotswap・デプロイ

## AgentCore Runtime CDK（TypeScript）

### パッケージ
```bash
npm install @aws-cdk/aws-bedrock-agentcore-alpha
```

### Runtime定義
```typescript
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import * as path from 'path';

// ローカルDockerイメージからビルド（ARM64必須）
const artifact = agentcore.AgentRuntimeArtifact.fromAsset(
  path.join(__dirname, 'agent/runtime')
);

const runtime = new agentcore.Runtime(stack, 'MarpAgent', {
  runtimeName: 'marp-agent',
  agentRuntimeArtifact: artifact,
});

// エンドポイントはDEFAULTを使用（addEndpoint不要）
// runtime.addEndpoint() を呼ぶと不要なエンドポイントが増えるため注意
```

### Runtimeクラスのプロパティ
| プロパティ | 説明 |
|-----------|------|
| `agentRuntimeArn` | Runtime ARN |
| `agentRuntimeId` | Runtime ID |
| `agentRuntimeName` | Runtime名 |
| `role` | IAMロール |

※ `runtimeArn` や `invokeUrl` は存在しない（alpha版の注意点）

### RuntimeEndpointクラスのプロパティ
| プロパティ | 説明 |
|-----------|------|
| `agentRuntimeEndpointArn` | Endpoint ARN |
| `endpointName` | Endpoint名 |
| `agentRuntimeArn` | 親RuntimeのARN |

### Cognito認証統合
```typescript
authorizerConfiguration: agentcore.RuntimeAuthorizerConfiguration.usingCognito(
  userPool,
  [userPoolClient]
)
```

### Bedrockモデル権限付与
```typescript
runtime.addToRolePolicy(new iam.PolicyStatement({
  actions: [
    'bedrock:InvokeModel',
    'bedrock:InvokeModelWithResponseStream',
  ],
  resources: [
    'arn:aws:bedrock:*::foundation-model/*',      // 基盤モデル
    'arn:aws:bedrock:*:*:inference-profile/*',    // 推論プロファイル（クロスリージョン推論）
  ],
}));
```

**重要**: クロスリージョン推論（`us.`/`jp.`等のプレフィックス付きモデルID）を使用する場合、`inference-profile/*` リソースへの権限も必要。`foundation-model/*` だけでは `AccessDeniedException` が発生する。

### Amplify Gen2との統合
```typescript
// amplify/backend.ts
const backend = defineBackend({ auth });
const stack = backend.createStack('AgentCoreStack');

// Amplifyの認証リソースを参照
const userPool = backend.auth.resources.userPool;
const userPoolClient = backend.auth.resources.userPoolClient;
```

---

## CDK Hotswap × AgentCore Runtime

### 概要
- 2025/1/24、CDK hotswap が Bedrock AgentCore Runtime に対応
- k.goto さん（@365_step_tech）による実装・調査

### 参考リンク
- [CDK Hotswap × AgentCore Runtime](https://go-to-k.hatenablog.com/entry/cdk-hotswap-bedrock-agentcore-runtime)

### 対応状況（2026/1時点）

| 項目 | 状況 |
|------|------|
| CDK hotswap | AgentCore Runtime 対応済み（v1.14.0〜） |
| Amplify toolkit-lib | まだ対応バージョン（1.14.0）に未更新 |
| ECRソースのバグ | AWS SDK（smithy/core）のリグレッション。近々自動修正見込み |
| Amplify Console | Docker build 未サポート |

### Amplify との組み合わせ

#### sandbox 環境
- `AgentRuntimeArtifact.fromAsset` でローカルビルド可能
- Mac ARM64 でビルドできるなら `deploy-time-build` は不要
- Amplify の toolkit-lib 更新後は hotswap も使える

#### sandbox起動時の環境変数読み込み

`backend.ts` に `import 'dotenv/config'` を追加しても、Amplify sandbox の内部実行環境では `.env` が正しく読み込まれないことがある。

**原因（推測）**: Amplify sandbox が TypeScript をトランスパイル・実行する際のカレントディレクトリが、`dotenv` が期待するプロジェクトルートと異なる可能性がある。

**確実な解決策**: シェル環境変数として明示的に設定してから起動する。

```bash
export TAVILY_API_KEY=$(grep TAVILY_API_KEY .env | cut -d= -f2) && npx ampx sandbox
```

**package.json スクリプト化（推奨）**:

```json
{
  "scripts": {
    "sandbox": "export $(grep -v '^#' .env | xargs) && npx ampx sandbox"
  }
}
```

これで `npm run sandbox` だけで環境変数付きで起動できる。

| 部分 | 説明 |
|------|------|
| `grep -v '^#' .env` | .env からコメント行を除外 |
| `xargs` | 各行を `KEY=value` 形式でスペース区切りに |
| `export $(...)` | 全部まとめてexport |

**メリット**: `.env` に変数を追加しても package.json の変更不要。

**identifier指定**: `npm run sandbox -- --identifier todo10`

### sandboxのブランチ名自動設定

git worktreeで複数ブランチを並行開発する際、サンドボックスの識別子を手動で指定するのを忘れがち。`npm run sandbox` で自動的にブランチ名を取得して識別子に設定する。

#### package.json スクリプト

```json
{
  "scripts": {
    "sandbox": "export $(grep -v '^#' .env | xargs) && BRANCH=$(git branch --show-current | tr '/' '-') && npx ampx sandbox --identifier \"sb-${BRANCH}\""
  }
}
```

| 部分 | 説明 |
|------|------|
| `git branch --show-current` | 現在のブランチ名を取得 |
| `tr '/' '-'` | `feature/xxx` → `feature-xxx` に変換（識別子にスラッシュは使えない） |
| `--identifier "sb-${BRANCH}"` | **`sb-`（sandbox）プレフィックス** + ブランチ名で識別子を設定 |

#### 本番環境とのバッティング回避

| 環境 | 命名規則 | 例 |
|------|----------|-----|
| **本番 Amplify** | ブランチ名そのまま | `main`, `kag`, `feature-xxx` |
| **サンドボックス** | `sb-` プレフィックス付き | `sb-main`, `sb-kag`, `sb-feature-xxx` |

これでCloudFormationスタック名やリソース名が衝突しない。

#### 使用例

```bash
# main ブランチで実行 → sb-main で起動
npm run sandbox

# feature/new-ui ブランチで実行 → sb-feature-new-ui で起動
npm run sandbox

# 追加の引数も渡せる
npm run sandbox -- --no-open
```

### identifierとRuntime名の連携（二重管理にならない）

「`--identifier` と `RUNTIME_SUFFIX` を同じ値で毎回揃える必要があるのでは？」という懸念があるが、**二重管理にならない**。

AmplifyはCDKコンテキストに `amplify-backend-name` として identifier を設定しているため、backend.ts から直接取得できる：

```typescript
// amplify/backend.ts
const backendName = agentCoreStack.node.tryGetContext('amplify-backend-name') as string;
// Runtime名に使えない文字をサニタイズ（本番と同様）
nameSuffix = (backendName || 'dev').replace(/[^a-zA-Z0-9_]/g, '_');
```

| やること | 管理場所 |
|---------|---------|
| 環境変数（APIキー等） | `.env` → `npm run sandbox` で自動読込 |
| identifier | `--identifier` → CDKコンテキストで自動取得 |

**参考**: [aws-amplify/amplify-backend - CDKContextKey.ts](https://github.com/aws-amplify/amplify-backend/blob/main/packages/platform-core/src/cdk_context_key.ts)

**なぜシェル環境変数は動くか**:
1. シェルで `export` した値は子プロセス（amplify sandbox）に自動継承される
2. `dotenv/config` は既存の `process.env` を上書きしない
3. よってシェル環境変数が優先される

#### sandbox環境でDockerイメージがキャッシュされる問題

**症状**: Dockerfileに新しいファイル（例: `border.css`）を追加しても、sandbox環境で反映されない

**原因**: HotswapはPythonコードの変更は検知するが、Dockerイメージの再ビルドは自動では行わない

**解決策**: sandboxを完全に削除して再起動

```bash
# sandbox削除（Dockerイメージも削除される）
npx ampx sandbox delete --yes

# 再起動（Dockerイメージが再ビルドされる）
npx ampx sandbox
```

#### sandbox環境で環境変数が反映されない問題

**症状**: CloudFormationには環境変数（例: `TAVILY_API_KEY`）が正しく設定されているのに、コンテナ内では空文字になる

**デバッグ方法**: コンテナ内の環境変数を確認するコードを追加
```python
# 一時的なデバッグコード
debug_info = f"[DEBUG] TAVILY_API_KEY in env: {'TAVILY_API_KEY' in os.environ}, value: {os.environ.get('TAVILY_API_KEY', 'NOT_SET')[:15] if os.environ.get('TAVILY_API_KEY') else 'EMPTY'}"
```

**原因**: AgentCore Hotswapは**環境変数の変更を反映しない**。最初のデプロイ時に空だった値がそのまま使われる。

**解決策**: sandboxを完全に削除して再起動（上記と同じ）

**注意**: `.env`ファイルと`dotenv/config`が正しく設定されていても、sandbox起動前に環境変数をエクスポートしていないと最初のデプロイで空になる可能性がある。

```bash
# 確実な方法: 環境変数を明示的にエクスポートしてからsandbox起動
export TAVILY_API_KEY=$(grep TAVILY_API_KEY .env | cut -d= -f2) && npx ampx sandbox
```

#### AgentCore Runtime重複エラー

**症状**:
```
Resource of type 'AWS::BedrockAgentCore::Runtime' with identifier 'marp_agent_dev' already exists.
```

**原因**: 前回のsandboxで作成されたAgentCore Runtimeが削除されずに残っている

**解決策**: CLIでRuntimeを削除してからsandbox再起動

```bash
# 1. Runtime一覧を確認
aws bedrock-agentcore-control list-agent-runtimes --region us-east-1

# 2. 該当するRuntimeを削除
aws bedrock-agentcore-control delete-agent-runtime \
  --agent-runtime-id {runtimeId} \
  --region us-east-1

# 3. 削除完了を確認（DELETINGからDELETED）
aws bedrock-agentcore-control list-agent-runtimes --region us-east-1 \
  --query "agentRuntimes[?agentRuntimeName=='marp_agent_dev']"

# 4. sandbox起動
npx ampx sandbox
```

**代替策**: 別の識別子でsandbox起動
```bash
npx ampx sandbox --identifier kimi
```
→ `marp_agent_kimi` として新規作成される

#### Amplify で Hotswap を先行利用する方法（Workaround）

Amplify の公式アップデートを待たずに試す場合、`package.json` の `overrides` を使用：

```json
{
  "overrides": {
    "@aws-cdk/toolkit-lib": "1.14.0",
    "@smithy/core": "^3.21.0"
  }
}
```

| パッケージ | バージョン | 理由 |
|-----------|-----------|------|
| `@aws-cdk/toolkit-lib` | `1.14.0` | AgentCore Hotswap 対応版 |
| `@smithy/core` | `^3.21.0` | AWS SDK のリグレッションバグ対応 |

**注意**: 正攻法ではないのでお試し用途。Amplify の公式アップデートが来たら overrides を削除する。

参考: [go-to-k/amplify-agentcore-cdk](https://github.com/go-to-k/amplify-agentcore-cdk)

#### 本番環境（Amplify Console）
- Docker build 未サポートのため工夫が必要
- 選択肢：
  1. GitHub Actions で ECR プッシュ → CDK で ECR 参照
  2. sandbox と main でビルド方法を分岐
  3. Amplify Console の Docker 対応を待つ

---

## deploy-time-build（本番環境ビルド）

### 概要

sandbox環境ではローカルでDockerビルドできるが、本番環境（Amplify Console）ではCodeBuildでビルドする必要がある。`deploy-time-build` パッケージを使用してビルドをCDK deploy時に実行する。

### 環境分岐

```typescript
// amplify/agent/resource.ts
const isSandbox = !branch || branch === 'sandbox';

const artifact = isSandbox
  ? agentcore.AgentRuntimeArtifact.fromAsset(runtimePath)  // ローカルビルド
  : agentcore.AgentRuntimeArtifact.fromAsset(runtimePath, {
      platform: ecr_assets.Platform.LINUX_ARM64,
      bundling: {
        // deploy-time-build でCodeBuildビルド
      },
    });
```

### ⚠️ コンテナイメージのタグ指定に関する重要な注意

**`tag: 'latest'` を指定すると、コード変更時にAgentCoreランタイムが更新されない問題が発生する。**

#### 問題の仕組み

1. コードをプッシュ → ECRに新イメージがプッシュ（タグ: `latest`）
2. CDKがCloudFormationテンプレートを生成
3. CloudFormation: 「タグは同じ `latest` だから変更なし」と判断
4. **AgentCoreランタイムが更新されない**

#### NG: 固定タグを使用

```typescript
containerImageBuild = new ContainerImageBuild(stack, 'ImageBuild', {
  directory: path.join(__dirname, 'runtime'),
  platform: Platform.LINUX_ARM64,
  tag: 'latest',  // ❌ CloudFormationが変更を検知できない
});
agentRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromEcrRepository(
  containerImageBuild.repository,
  'latest'  // ❌ ハードコード
);
```

#### OK: タグを省略してassetHashを使用

```typescript
containerImageBuild = new ContainerImageBuild(stack, 'ImageBuild', {
  directory: path.join(__dirname, 'runtime'),
  platform: Platform.LINUX_ARM64,
  // tag を省略 → assetHashベースのタグが自動生成される
});
// 古いイメージを自動削除（直近5件を保持）
containerImageBuild.repository.addLifecycleRule({
  description: 'Keep last 5 images',
  maxImageCount: 5,
  rulePriority: 1,
});
agentRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromEcrRepository(
  containerImageBuild.repository,
  containerImageBuild.imageTag,  // ✅ 動的なタグ
);
```

#### 比較表

| 項目 | `tag: 'latest'` | タグ省略（推奨） |
|------|-----------------|-----------------|
| デプロイ時の更新 | ❌ 反映されないことがある | ✅ 常に反映される |
| ECRイメージ数 | 1つのみ | 蓄積（要Lifecycle Policy） |
| ロールバック | ❌ 不可 | ✅ 可能 |

### 参考

- [deploy-time-build](https://github.com/tmokmss/deploy-time-build)
