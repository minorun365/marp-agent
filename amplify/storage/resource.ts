import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';

interface SharedSlidesConstructProps {
  nameSuffix: string;
}

/**
 * 共有スライド用のインフラ構成
 * - S3: HTMLファイル保存（7日後自動削除）
 * - CloudFront: 公開URL配信（OAC経由でS3アクセス）
 */
export class SharedSlidesConstruct extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: SharedSlidesConstructProps) {
    super(scope, id);

    const { nameSuffix } = props;

    // S3バケット
    // - パブリックアクセスブロック有効（CloudFront経由のみアクセス可能）
    // - 7日後に自動削除（Lifecycle Rule）
    this.bucket = new s3.Bucket(this, 'Bucket', {
      bucketName: `marp-shared-slides-${nameSuffix}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          id: 'DeleteAfter7Days',
          expiration: cdk.Duration.days(7),
        },
      ],
    });

    // CloudFront Distribution
    // - OAC（Origin Access Control）経由でS3にアクセス
    // - HTTPS強制
    // - キャッシュ最適化
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
    });

    // 出力
    new cdk.CfnOutput(scope, 'SharedSlidesBucketName', {
      value: this.bucket.bucketName,
      description: 'Shared Slides S3 Bucket Name',
    });

    new cdk.CfnOutput(scope, 'SharedSlidesDistributionDomain', {
      value: this.distribution.distributionDomainName,
      description: 'Shared Slides CloudFront Distribution Domain',
    });
  }
}
