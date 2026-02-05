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

| ブランチ | 環境変数 |
|----------|----------|
| main | `AMPLIFY_DIFF_DEPLOY=true` |
| kag | `AMPLIFY_DIFF_DEPLOY=true` |

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
aws amplify update-branch --app-id d3i0gx3tizcqc1 --branch-name main \
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
