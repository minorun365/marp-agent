# 機能実装（API・シェア・共有）

## API接続実装

### 概要
フロントエンド（React）からAgentCoreエンドポイントを呼び出す。

### AgentCore呼び出しAPI仕様

#### エンドポイントURL形式（重要）

```
POST https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{URLエンコードされたARN}/invocations?qualifier={endpointName}
```

**注意**: ARNは `encodeURIComponent()` で完全にURLエンコードする必要がある。

```typescript
// 正しい例
const runtimeArn = "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/my_agent";
const encodedArn = encodeURIComponent(runtimeArn);
const url = `https://bedrock-agentcore.${region}.amazonaws.com/runtimes/${encodedArn}/invocations?qualifier=${endpointName}`;

// 結果: /runtimes/arn%3Aaws%3Abedrock-agentcore%3Aus-east-1%3A123456789012%3Aruntime%2Fmy_agent/invocations?qualifier=my_endpoint
```

#### 過去に試したNG例
| URL形式 | エラー |
|---------|--------|
| `/runtimes/{runtimeId}/invoke` | 404 |
| `/runtimes/{runtimeId}/invocations` | 400 (accountID required) |
| `/accounts/{accountId}/runtimes/{runtimeId}/invocations` | 404 (UnknownOperation) |
| `/runtimes/{encodedArn}/invocations` （ARNエンコードなし） | 404 |

#### ヘッダー
```
Authorization: Bearer {cognitoIdToken}
Content-Type: application/json
Accept: text/event-stream
```

#### リクエストボディ
```json
{
  "prompt": "ユーザーの入力",
  "markdown": "現在のスライド（編集時）"
}
```

#### 認証問題の解決

**現象**: Cognito認証で `Claim 'client_id' value mismatch with configuration.` エラーが発生

**根本原因**: IDトークンとアクセストークンのクレーム構造の違い

| トークン種別 | クライアントIDの格納先 |
|-------------|---------------------|
| IDトークン | `aud` クレーム |
| アクセストークン | `client_id` クレーム |

AgentCore RuntimeのJWT認証（`usingJWT`の`allowedClients`）は **`client_id`クレーム** を検証するため、**アクセストークン** を使用する必要がある。

**解決策**:
```typescript
// useAgentCore.ts
// NG: IDトークン
const idToken = session.tokens?.idToken?.toString();

// OK: アクセストークン
const accessToken = session.tokens?.accessToken?.toString();
```

**参考**: AWS公式ドキュメント
> Amazon Cognito renders the same value in the access token `client_id` claim as the ID token `aud` claim.

---

## 参考資料PDFアップロード

### 概要

チャット入力欄の📎ボタンからPDFを添付し、その内容を参考にスライドを生成する機能。

### データフロー

```
[ChatInput 📎] → File API → Base64変換 → JSON body に含めてPOST
                                              ↓
[AgentCore Runtime] → Base64デコード → /tmp保存 → pdfplumber テキスト抽出
                                              ↓
                   抽出テキストをプロンプトに付加 → 通常のスライド生成フロー
```

### 制約

| 項目 | 値 |
|------|-----|
| 対応形式 | PDF のみ（Phase 1） |
| ファイルサイズ上限 | 10MB |
| テキスト抽出上限 | 50,000文字 |
| ファイル数 | 1ファイル |
| ストレージ | エフェメラル（/tmp、処理後削除） |

### 計画書

詳細な実装計画は `docs/temp/upload.md` を参照。Phase 2（Word、画像、複数ファイル対応）は今後の拡張。

---

## Twitter/X シェア機能

### Web Intent URL形式（重要）

ツイートURLを生成する際は、Twitter Web Intent形式を使用する。

```python
# OK: Web Intent形式（textパラメータが確実に反映される）
url = f"https://twitter.com/intent/tweet?text={encoded_text}"

# NG: compose/post形式（textパラメータが無視されることがある）
url = f"https://x.com/compose/post?text={encoded_text}"
```

**原因**: `compose/post` はXのWeb UI直接アクセス用URLで、`text`パラメータが無視されることがある。`intent/tweet` はシェアボタン用に設計された公式の方法で、パラメータが確実に処理される。

### URLエンコード

日本語やハッシュタグを含むツイート本文は `urllib.parse.quote()` でエンコード：

```python
import urllib.parse
encoded_text = urllib.parse.quote(tweet_text, safe='')
```

**ポイント**: `safe=''` で `#` もエンコードする（URLパラメータ内では必要）

---

## お知らせバナーの追加

チャット画面にシステムからのお知らせを表示する方法。

### 実装場所

`src/components/Chat/index.tsx` のメッセージ一覧の先頭に追加。

```tsx
{/* メッセージ一覧 */}
<div className="flex-1 overflow-y-auto px-6 py-4">
  <div className="max-w-3xl mx-auto space-y-4">
  {/* 一時的なお知らせバナー（不要になったら削除） */}
  <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-blue-700 text-sm">
    お知らせ内容をここに記載
  </div>
  {/* 以下、既存のメッセージ表示 */}
```

### バナーの種類

| 種類 | 背景色 | ボーダー | テキスト | アイコン | 用途 |
|------|--------|---------|----------|---------|------|
| 情報（青） | `bg-blue-50` | `border-blue-200` | `text-blue-700` | - | 復旧報告、お知らせ |
| 警告（黄） | `bg-yellow-50` | `border-yellow-200` | `text-yellow-800` | ⚠️ | 障害発生中、メンテナンス予告 |
| エラー（赤） | `bg-red-50` | `border-red-200` | `text-red-700` | ❌ | 重大な障害 |
| 成功（緑） | `bg-green-50` | `border-green-200` | `text-green-700` | ✅ | 新機能リリース |

### 運用手順

1. `src/components/Chat.tsx` にバナーを追加
2. コミット & 両ブランチにpush（mainとkag）
3. 不要になったらバナーを削除してpush

---

## ローカル開発（認証スキップ）

フロントエンドのデザイン確認時に認証をスキップしてモックモードで起動できる。

### 起動方法

```bash
VITE_USE_MOCK=true npm run dev
```

### 実装

```typescript
// src/main.tsx
const useMock = import.meta.env.VITE_USE_MOCK === 'true';

if (useMock) {
  // Amplify設定をスキップしてモックアプリを表示
  root.render(<MockApp />);
} else {
  // 通常の認証付きアプリを起動
  Amplify.configure(outputs);
  root.render(<AuthenticatedApp />);
}
```

```typescript
// src/App.tsx
// モックモードの場合はAuthenticatorをスキップ
if (useMock) {
  return <MainApp signOut={() => {}} />;
}
```

---

## スライド共有機能（S3 + CloudFront）

### 公開URL方式の比較

| 方式 | メリット | デメリット |
|------|---------|-----------|
| S3署名付きURL | インフラがシンプル | URLが長い（500-1000文字）、Lambda経由では有効期限に制限あり |
| CloudFront + S3 OAC | URLが短い、キャッシュで高速 | インフラが増える（CloudFront） |
| リダイレクト方式 | URLが最短 | 毎回Lambda呼び出しが発生 |

### S3署名付きURLの有効期限について

| 生成方法 | 最大有効期限 |
|---------|-------------|
| AWS CLI / SDK | 7日間 |
| AWSコンソール | 12時間 |
| Lambda実行ロール（一時認証情報）| セッション有効期限に依存（1-12時間） |

**ポイント**: Lambda/AgentCoreから署名付きURLを生成する場合でも、SDKを使えば7日間有効にできる。

参考: [AWS re:Post - S3 Presigned URL Limitations](https://repost.aws/questions/QUxaEYVXbVREamltPSmKRotg/s3-presignedurl-limitations)

### Amplify Gen2でのカスタムリソース追加

Amplify Gen2では `defineStorage` でS3をネイティブに作成できるが、CloudFrontとの連携が必要な場合はカスタムCDKリソースを使う方が柔軟。

```typescript
// amplify/backend.ts
import { SharedSlidesConstruct } from './storage/resource';

// カスタムスタックを作成
const sharedSlidesStack = backend.createStack('SharedSlidesStack');
const sharedSlides = new SharedSlidesConstruct(sharedSlidesStack, 'SharedSlides', {
  nameSuffix,
});

// フロントエンドに出力
backend.addOutput({
  custom: {
    sharedSlidesDistributionDomain: sharedSlides.distribution.distributionDomainName,
  },
});
```

参考: [Amplify Gen2 Custom Resources](https://docs.amplify.aws/react/build-a-backend/add-aws-services/custom-resources/)

### CloudFront OAC（Origin Access Control）

S3バケットを直接公開せず、CloudFront経由でのみアクセスを許可する設定。

```typescript
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';

const distribution = new cloudfront.Distribution(this, 'Distribution', {
  defaultBehavior: {
    // OAC経由でS3にアクセス（バケットポリシー自動設定）
    origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
  },
});
```

### OGP対応（Twitterサムネイル表示）

共有URLをTwitterでシェアした際にサムネイル画像を表示するには、OGPメタタグとサムネイル画像が必要。

#### サムネイル生成（Marp CLI）

```bash
# 1枚目のスライドをPNG画像として出力
marp slide.md --image png -o slide.png
# → slide.001.png が生成される
```

#### OGPメタタグ

```html
<meta property="og:title" content="スライドタイトル">
<meta property="og:type" content="website">
<meta property="og:url" content="https://xxx.cloudfront.net/slides/{id}/index.html">
<meta property="og:image" content="https://xxx.cloudfront.net/slides/{id}/thumbnail.png">
<meta name="twitter:card" content="summary_large_image">
```
