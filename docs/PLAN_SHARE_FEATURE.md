# スライド共有機能（#9）詳細実装プラン

> **ステータス**: レビュー待ち
> **作成日**: 2026-02-03

---

## 1. UIの表現について

### 問題点
現在のボタン名「ダウンロード」の中に「URLで共有」を入れると、ダウンロードではないので違和感がある。

### 提案: ボタン名を「エクスポート」に変更

| 案 | ボタン名 | メニュー項目 | 評価 |
|----|---------|-------------|------|
| **A（推奨）** | エクスポート | PDF / PPTX / URLで公開 | 「外部に出力する」という統一概念 |
| B | 出力 | PDF / PPTX / URLで公開 | シンプルだが日本語として堅い |
| C | 共有 | PDFで保存 / PPTXで保存 / URLで公開 | ダウンロードが「共有」と言えるか微妙 |

**推奨案AのUI**:
```
[エクスポート ▼]
├─ PDF形式
├─ PPTX形式
├─ ────────────  (セパレーター)
└─ URLで公開
```

セパレーターで「ローカル保存」と「Web公開」を視覚的に区別。

---

## 2. 公開URL方式の比較

### 方式A: S3署名付きURL（Pre-signed URL）

| 項目 | 内容 |
|------|------|
| **仕組み** | S3オブジェクトへの一時的なアクセス権を含むURL |
| **インフラ** | S3のみ（シンプル） |
| **URL長** | 約500-1000文字（署名パラメータ含む） |
| **有効期限** | 設定可能だが**Lambda/IAMロール経由では最大12時間**（※重要） |

**Lambda/AgentCoreでの制限（※訂正）**:
- ~~署名付きURLの有効期限は「設定値」と「認証情報の有効期限」の短い方~~
- **CLIやSDKを使用すれば最大7日間に設定可能**（福知先生情報）
- AWSコンソールからの生成は12時間が上限

参考: [AWS re:Post - S3 Presigned URL Limitations](https://repost.aws/questions/QUxaEYVXbVREamltPSmKRotg/s3-presignedurl-limitations)

### 方式B: CloudFront + S3 OAC（推奨）

| 項目 | 内容 |
|------|------|
| **仕組み** | CloudFront経由でS3にアクセス、URLは永続 |
| **インフラ** | S3 + CloudFront + DynamoDB |
| **URL長** | 約80文字（CloudFrontドメイン + UUID） |
| **有効期限** | S3 Lifecycle Ruleで7日後自動削除 |

**URL例**:
```
https://d1234abcd.cloudfront.net/slides/a1b2c3d4-e5f6-7890-abcd-ef1234567890/index.html
```

### 方式C: リダイレクト方式

| 項目 | 内容 |
|------|------|
| **仕組み** | 短いURL → Lambda → 署名付きURL生成 → 302リダイレクト |
| **インフラ** | S3 + Lambda + API Gateway |
| **URL長** | 短い（カスタム可能） |
| **有効期限** | 7日間（S3 TTLで管理、アクセス時に都度署名生成） |

**URL例**:
```
https://api.example.com/s/a1b2c3d4
```

### 方式比較まとめ

| 観点 | 署名付きURL | CloudFront + S3 | リダイレクト |
|------|------------|-----------------|-------------|
| インフラ複雑度 | 低 | 中 | 中 |
| URL長 | 長い（約500-1000文字） | 短い（約80文字） | 最短 |
| 7日間有効 | OK（SDK使用時） | OK | OK |
| コスト | 低 | 中（CF料金） | 中（Lambda呼出） |
| 推奨度 | ○ | **◎** | ○ |

---

## 3. 推奨: 方式B（CloudFront + S3 OAC）

### 理由
1. **URLが短くて見やすい** - 共有しやすい
2. **7日間有効が確実** - S3 Lifecycle Ruleで管理
3. **追加の認証情報管理が不要** - Secrets Manager設定不要
4. **キャッシュで高速** - CloudFrontのエッジキャッシュ

### インフラ構成

```
┌─────────────────────────────────────────────────────────────┐
│  ユーザー                                                    │
│  共有URL: https://xxxx.cloudfront.net/slides/{uuid}/index.html │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  CloudFront Distribution                                     │
│  - HTTPS強制                                                 │
│  - キャッシュ最適化                                          │
│  - OAC経由でS3アクセス                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  S3 Bucket                                                   │
│  - パブリックアクセスブロック有効（直接アクセス禁止）        │
│  - Lifecycle Rule: 7日後自動削除                             │
│  - オブジェクト: slides/{uuid}/index.html                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Amplify Gen2でのリソース追加方法

### 調査結果

| リソース | Amplify Gen2ネイティブ | カスタムCDK |
|---------|----------------------|------------|
| S3バケット | defineStorage（認証ユーザー向け） | aws-cdk-lib/aws-s3 |
| DynamoDB | defineData（GraphQL経由） | aws-cdk-lib/aws-dynamodb |
| CloudFront | 非対応 | aws-cdk-lib/aws-cloudfront |

参考: [Amplify Gen2 Custom Resources](https://docs.amplify.aws/react/build-a-backend/add-aws-services/custom-resources/)

### 結論: カスタムCDKリソースで統一

**理由**:
1. CloudFrontはAmplify Gen2ネイティブ非対応
2. S3とCloudFrontの連携（OAC設定）がカスタムCDKなら簡単
3. defineStorageはCognito認証ユーザー向けで、匿名公開には不向き

---

## 5. 実装詳細

### 5.1 インフラ（新規ファイル: amplify/storage/resource.ts）

```typescript
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';

export class SharedSlidesConstruct extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, nameSuffix: string) {
    super(scope, id);

    // S3バケット
    this.bucket = new s3.Bucket(this, 'Bucket', {
      bucketName: `marp-shared-slides-${nameSuffix}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [{
        id: 'DeleteAfter7Days',
        expiration: cdk.Duration.days(7),
      }],
    });

    // CloudFront
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
    });
  }
}
```

### 5.2 backend.ts への統合

```typescript
// カスタムスタック作成
const sharedSlidesStack = backend.createStack('SharedSlidesStack');
const sharedSlides = new SharedSlidesConstruct(
  sharedSlidesStack,
  'SharedSlides',
  isSandbox ? 'sandbox' : environment
);

// フロントエンドに出力
backend.addOutput({
  custom: {
    sharedSlidesBucket: sharedSlides.bucket.bucketName,
    sharedSlidesDistributionDomain: sharedSlides.distribution.distributionDomainName,
  },
});
```

### 5.3 AgentCore権限追加（agent/resource.ts）

```typescript
// S3書き込み権限
runtime.addToRolePolicy(new iam.PolicyStatement({
  actions: ['s3:PutObject'],
  resources: [`${sharedSlides.bucket.bucketArn}/*`],
}));

// 環境変数
environmentVariables: {
  SHARED_SLIDES_BUCKET: sharedSlides.bucket.bucketName,
  CLOUDFRONT_DOMAIN: sharedSlides.distribution.distributionDomainName,
}
```

### 5.4 バックエンドAPI（agent.py）

```python
def share_slide(markdown: str, theme: str) -> dict:
    """スライドをHTML化してS3に保存し、公開URLを返す"""
    bucket_name = os.environ.get('SHARED_SLIDES_BUCKET')
    cloudfront_domain = os.environ.get('CLOUDFRONT_DOMAIN')

    slide_id = str(uuid.uuid4())
    html_content = generate_standalone_html(markdown, theme)

    s3_key = f"slides/{slide_id}/index.html"
    s3_client.put_object(
        Bucket=bucket_name,
        Key=s3_key,
        Body=html_content.encode('utf-8'),
        ContentType='text/html; charset=utf-8',
    )

    share_url = f"https://{cloudfront_domain}/slides/{slide_id}/index.html"
    expires_at = int((datetime.utcnow() + timedelta(days=7)).timestamp())

    return {'url': share_url, 'expiresAt': expires_at}
```

### 5.5 フロントエンドUI

**SlidePreview.tsx の変更**:
- ボタン名: 「ダウンロード」→「エクスポート」
- メニュー追加: セパレーター + 「URLで公開」

**新規モーダル**:
- `ShareConfirmModal.tsx`: 公開確認（全世界公開の警告）
- `ShareResultModal.tsx`: URL表示 + コピーボタン

---

## 6. 実装順序

| Phase | 作業内容 | ファイル |
|-------|---------|---------|
| 1 | インフラ作成 | `amplify/storage/resource.ts`（新規）, `amplify/backend.ts` |
| 2 | AgentCore権限付与 | `amplify/agent/resource.ts` |
| 3 | バックエンドAPI | `amplify/agent/runtime/agent.py` |
| 4 | フロントエンドUI | `SlidePreview.tsx`, `App.tsx` |
| 5 | モーダルコンポーネント | `ShareConfirmModal.tsx`, `ShareResultModal.tsx`（新規）|
| 6 | API連携 | `useAgentCore.ts` |

---

## 7. 検証方法

1. **sandbox環境でデプロイ**: `npx ampx sandbox`
2. **CloudFormationでリソース確認**: S3, CloudFrontが作成されていること
3. **E2Eテスト**:
   - スライド生成 → エクスポート → URLで公開
   - 別ブラウザ（シークレットモード）でURL開いてスライド表示確認
   - 7日後に自動削除されること（S3 Lifecycle確認）

---

## 8. 参考ドキュメント

- [Amplify Gen2 Custom Resources](https://docs.amplify.aws/react/build-a-backend/add-aws-services/custom-resources/)
- [S3 Presigned URL Limitations](https://repost.aws/questions/QUxaEYVXbVREamltPSmKRotg/s3-presignedurl-limitations)
- [CloudFront OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)

---

## 9. UI修正（2026-02-03追加）

### 9.1 エクスポートドロップダウンの修正

**ファイル**: `src/components/SlidePreview.tsx`

| 修正箇所 | Before | After |
|---------|--------|-------|
| PDF形式 | `PDF形式` | `PDF形式でダウンロード` |
| PPTX形式 | `PPTX形式` | `PPTX形式でダウンロード` |
| 区切り線 | 色違いのセパレーター | 通常のborder-t（並列デザイン） |
| URLで公開 | `URLで公開` | `URLで公開` + 青色「NEW」バッジ |

### 9.2 ShareConfirmModal.tsxの修正

**ファイル**: `src/components/ShareConfirmModal.tsx`

| 修正箇所 | Before | After |
|---------|--------|-------|
| アイコン | `<span className="text-yellow-500">!</span>` | 黄色ビックリマーク絵文字 |
| 注意枠の背景 | `bg-yellow-50 border-yellow-200` | `bg-gray-50 border-gray-200` |
| 注意枠の文字色 | `text-yellow-800` | `text-gray-700` |

### 9.3 ShareResultModal.tsxの修正

**ファイル**: `src/components/ShareResultModal.tsx`

| 修正箇所 | Before | After |
|---------|--------|-------|
| アイコン | `<span className="text-green-500">OK</span>` | 緑チェックマーク絵文字 |

---

## 10. OGP対応（Twitterサムネイル表示）

### 10.1 概要

共有URLをTwitter等でシェアした際に、スライドのサムネイル画像が表示されるようにする。

### 10.2 実装内容

**ファイル**: `amplify/agent/runtime/agent.py`

#### 10.2.1 サムネイル画像生成

Marp CLIの`--image png`オプションで1枚目のスライドをPNG出力：

```python
def generate_thumbnail(markdown: str, theme: str = 'gradient') -> bytes:
    """Marp CLIで1枚目のスライドをPNG画像として生成"""
    with tempfile.TemporaryDirectory() as tmpdir:
        md_path = Path(tmpdir) / "slide.md"
        png_path = Path(tmpdir) / "slide.001.png"  # Marpは連番で出力

        md_path.write_text(markdown, encoding="utf-8")

        cmd = [
            "marp",
            str(md_path),
            "--image", "png",
            "--allow-local-files",
            "-o", str(Path(tmpdir) / "slide.png"),
        ]

        theme_path = Path(__file__).parent / f"{theme}.css"
        if theme_path.exists():
            cmd.extend(["--theme", str(theme_path)])

        subprocess.run(cmd, capture_output=True, text=True)

        return png_path.read_bytes()
```

#### 10.2.2 S3アップロード（PNG追加）

```python
# share_slide関数に追加

# サムネイル生成
thumbnail_bytes = generate_thumbnail(markdown, theme)

# S3にサムネイルをアップロード
s3_client.put_object(
    Bucket=bucket_name,
    Key=f"slides/{slide_id}/thumbnail.png",
    Body=thumbnail_bytes,
    ContentType='image/png',
)
```

#### 10.2.3 HTMLにOGPタグを挿入

```python
def inject_ogp_tags(html: str, title: str, image_url: str, page_url: str) -> str:
    """HTMLにOGPメタタグを挿入"""
    ogp_tags = f'''
    <meta property="og:title" content="{title}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="{page_url}">
    <meta property="og:image" content="{image_url}">
    <meta property="og:description" content="パワポ作るマンで作成したスライド">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{title}">
    <meta name="twitter:image" content="{image_url}">
    '''
    # </head>の前にOGPタグを挿入
    return html.replace('</head>', f'{ogp_tags}</head>')
```

#### 10.2.4 share_slide関数の更新

```python
def share_slide(markdown: str, theme: str = 'gradient') -> dict:
    # ... 既存のコード ...

    # サムネイル生成・アップロード
    thumbnail_bytes = generate_thumbnail(markdown, theme)
    thumbnail_key = f"slides/{slide_id}/thumbnail.png"
    s3_client.put_object(
        Bucket=bucket_name,
        Key=thumbnail_key,
        Body=thumbnail_bytes,
        ContentType='image/png',
    )
    thumbnail_url = f"https://{cloudfront_domain}/{thumbnail_key}"

    # HTML生成
    html_content = generate_standalone_html(markdown, theme)

    # スライドタイトルを抽出（フロントマターまたは最初の#見出し）
    title = extract_slide_title(markdown) or "スライド"

    # OGPタグ挿入
    html_content = inject_ogp_tags(html_content, title, thumbnail_url, share_url)

    # S3にHTMLアップロード
    # ... 既存のコード ...
```

### 10.3 スライドタイトル抽出

```python
def extract_slide_title(markdown: str) -> str | None:
    """マークダウンからスライドタイトルを抽出"""
    import re
    # 最初の # 見出しを探す
    match = re.search(r'^#\s+(.+)$', markdown, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return None
```

### 10.4 工数

| 作業 | 工数 |
|------|------|
| サムネイル生成関数 | 20分 |
| S3アップロード追加 | 10分 |
| OGPタグ挿入関数 | 20分 |
| テスト | 10分 |
| **合計** | **1時間** |
