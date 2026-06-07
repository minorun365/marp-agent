# Amplify Gen2・Cognito認証

## Cognito Pre Sign-up Trigger

### メールドメイン制限

特定のメールドメインのみアカウント登録を許可する：

```typescript
// amplify/auth/pre-sign-up/handler.ts
import type { PreSignUpTriggerHandler } from 'aws-lambda';

const ALLOWED_DOMAIN = 'example.com';

export const handler: PreSignUpTriggerHandler = async (event) => {
  const email = event.request.userAttributes.email;
  const domain = email?.split('@')[1]?.toLowerCase();

  if (domain !== ALLOWED_DOMAIN) {
    throw new Error(`このサービスは @${ALLOWED_DOMAIN} のメールアドレスでのみ登録できます`);
  }

  return event;
};
```

```typescript
// amplify/auth/pre-sign-up/resource.ts
import { defineFunction } from '@aws-amplify/backend';

export const preSignUp = defineFunction({
  name: 'pre-sign-up',
  entry: './handler.ts',
});
```

```typescript
// amplify/auth/resource.ts
import { defineAuth } from '@aws-amplify/backend';
import { preSignUp } from './pre-sign-up/resource';

export const auth = defineAuth({
  loginWith: { email: true },
  triggers: { preSignUp },
});
```

**必要な依存**:
```bash
npm install --save-dev @types/aws-lambda
```

---

## Cognito User Migration Trigger

別の Cognito User Pool から既存ユーザーを段階的に移す場合は、Cognito の User Migration Trigger を使う。旧 User Pool は残したまま、新環境で再ログインしたユーザーだけを新 User Pool に作成できるため、全ユーザーの一括移行やパスワード再設定を避けられる。

### 有効化条件

このリポジトリでは、次の環境変数がすべて設定されている場合のみ User Migration Trigger を作成する。

| 環境変数 | 用途 |
|----------|------|
| `OLD_USER_POOL_ID` | 移行元 User Pool ID |
| `OLD_USER_POOL_CLIENT_ID` | 移行元 App Client ID |
| `OLD_ACCOUNT_ROLE_ARN` | 移行元 Cognito を読むために AssumeRole する IAM Role ARN |

未設定の環境ではトリガーを作らないため、通常の新規デプロイやローカル sandbox には影響しない。

### 認証フロー

1. 新環境の Cognito でメールアドレスとパスワードによるログインを試行する
2. 新 User Pool にユーザーが存在しない場合、User Migration Trigger が起動する
3. Lambda が `OLD_ACCOUNT_ROLE_ARN` を AssumeRole して移行元 Cognito に問い合わせる
4. `ADMIN_USER_PASSWORD_AUTH` で旧パスワードを検証する
5. 認証できた場合のみ、メールアドレスと `email_verified` を新 User Pool に登録する

フロントエンドは、移行期間だけ `VITE_USE_USER_PASSWORD_AUTH=true` にして `USER_PASSWORD_AUTH` を使う。これにより、Cognito が User Migration Trigger にパスワードを渡せる。

### IAM と旧 User Pool 側の条件

- 移行元アカウントに、移行先 Lambda から AssumeRole できる IAM Role を作る
- その Role には移行元 User Pool への `cognito-idp:AdminInitiateAuth` と `cognito-idp:AdminGetUser` のみを許可する
- 移行元 App Client では `ALLOW_ADMIN_USER_PASSWORD_AUTH` を有効にする
- 旧 User Pool は削除せず、移行期間中は参照元として残す

### 注意点

- User Migration Trigger は初回ログイン時の移行なので、ログインしないユーザーは新 User Pool に作成されない
- `ForgotPassword` 起点でもユーザー属性を移せるが、パスワード再設定の体験は Cognito の標準フローに従う
- 移行が完了したと判断するまでは、旧 User Pool と AssumeRole 用 IAM Role を残しておく
- 公開ドキュメントには実際の User Pool ID、App Client ID、AWS Account ID、Role ARN を書かない

---

## Amplify UI Authenticatorのカスタマイズ

Cognito認証画面のヘッダー/フッターをカスタマイズして、アプリ名やメールアドレスの利用目的を表示できる。

```tsx
const authComponents = {
  Header() {
    return (
      <div className="text-center py-4">
        <h1 className="text-2xl font-bold text-gray-800">アプリ名</h1>
        <p className="text-sm text-gray-500 mt-1">
          誰でもアカウントを作って利用できます！（1日50人まで）
        </p>
      </div>
    );
  },
  Footer() {
    return (
      <div className="text-center py-3 px-4">
        <p className="text-xs text-gray-400 leading-relaxed">
          登録されたメールアドレスは認証目的でのみ使用します。
        </p>
      </div>
    );
  },
};

<Authenticator components={authComponents}>
  {({ signOut }) => <MainApp signOut={signOut} />}
</Authenticator>
```

**用途**:
- ヘッダー: アプリ名、利用ガイド
- フッター: プライバシーポリシー、免責事項

---

## Amplify UI 配色のカスタマイズ（CSS方式）

`createTheme`/`ThemeProvider`ではグラデーションが使えないため、CSSで直接スタイリングするのが確実。

```css
/* src/index.css */

/* プライマリボタン（グラデーション対応） */
[data-amplify-authenticator] .amplify-button--primary {
  background: linear-gradient(to right, #1a3a6e, #5ba4d9);
  border: none;
}

[data-amplify-authenticator] .amplify-button--primary:hover {
  background: linear-gradient(to right, #142d54, #4a93c8);
}

/* リンク（パスワードを忘れた等） */
[data-amplify-authenticator] .amplify-button--link {
  color: #1a3a6e;
}

[data-amplify-authenticator] .amplify-button--link:hover {
  color: #5ba4d9;
  background: transparent;
}

/* タブ（サインイン/サインアップ切り替え） */
[data-amplify-authenticator] .amplify-tabs__item--active {
  color: #1a3a6e;
  border-color: #5ba4d9;
}

/* 入力フォーカス */
[data-amplify-authenticator] input:focus {
  border-color: #5ba4d9;
  box-shadow: 0 0 0 2px rgba(91, 164, 217, 0.2);
}
```

**方針**:
- `createTheme`ではなくCSS直接指定（グラデーション対応のため）
- `[data-amplify-authenticator]`セレクタで認証画面のみに適用
- アプリ本体と同じ配色（`#1a3a6e` → `#5ba4d9`）を使用

---

## Amplify ビルドスキップ（Diff-based Deploy）

### 概要

ドキュメントのみの変更でフロントエンドのビルド・デプロイを避けるための設定。

### 設定済み環境変数

| 対象 | 環境変数 |
|------|----------|
| デプロイ対象ブランチ | `AMPLIFY_DIFF_DEPLOY=true` |

### 動作

- `src/` や `amplify/` に変更がない場合、フロントエンドビルドがスキップされる
- `docs/` のみの変更はスキップ対象

### 手動スキップ

コミットメッセージに `[skip-cd]` を追加することでも可能：

```bash
git commit -m "ドキュメント更新 [skip-cd]"
```

**注意**: `[skip ci]` や `[ci skip]` は Amplify では無効。`[skip-cd]` のみ。

### 設定コマンド（参考）

```bash
# 既存の環境変数を確認してからマージして更新すること
aws amplify update-branch --app-id {appId} --branch-name {branch} \
  --environment-variables AMPLIFY_DIFF_DEPLOY=true --region us-east-1
```

---

## Amplify Gen2 でカスタム出力を追加

```typescript
// amplify/backend.ts
const { endpoint } = createMarpAgent({ ... });

backend.addOutput({
  custom: {
    agentEndpointArn: endpoint.agentRuntimeEndpointArn,
  },
});
```

フロントエンドでアクセス:
```typescript
import outputs from '../amplify_outputs.json';
const endpointArn = outputs.custom?.agentEndpointArn;
```

---

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

### 独自ドメイン切り替え時のハマりどころ

共有用 CloudFront の独自ドメインを branch や AWS アカウント間で切り替えるときは、環境変数の更新だけでは足りない。

1. `aws amplify get-branch` で対象 branch の `SHARED_SLIDES_PUBLIC_DOMAIN` / `SHARED_SLIDES_CERTIFICATE_ARN` を確認する
2. `customOutputs.sharedSlidesPublicDomain` と `sharedSlidesDistributionDomain` を見て、デプロイ後に何が実際に反映されたか確認する
3. 同じ独自ドメインを持つ旧環境がある場合は、先にそちらの環境変数を外して再デプロイし、CloudFront の alternate domain name を解放する
4. 移行先環境で `SHARED_SLIDES_PUBLIC_DOMAIN` と、移行先 AWS アカウントの `us-east-1` ACM 証明書 ARN を設定して再デプロイする
5. Route53 の Alias を `customOutputs.sharedSlidesDistributionDomain` に切り替える

CloudFront の alternate domain name は同時に1つの distribution にしか付けられない。旧環境の Distribution が `Deployed` になり、Aliases が空になってから移行先を更新すると失敗しにくい。

### 環境変数を外すときの注意

`aws amplify update-branch --environment-variables '{}'` では、既存の branch 環境変数が消えないことがあった。

このリポジトリではコード側で `trim()` して空文字を未設定扱いにしているため、次のように空文字で更新して再デプロイすると独自ドメイン設定を外せる。

```bash
aws amplify update-branch --app-id {appId} --branch-name {branch} --region {region} \
  --environment-variables SHARED_SLIDES_PUBLIC_DOMAIN=,SHARED_SLIDES_CERTIFICATE_ARN=
```
