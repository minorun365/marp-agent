"""スライド共有（S3アップロード・OGP生成）"""

import os
import re
import html as html_escape
import uuid
from datetime import datetime, timedelta

import boto3

from exports import generate_standalone_html, generate_thumbnail

# S3クライアント（遅延初期化）
_s3_client = None


def _get_s3_client():
    """S3クライアントを取得（遅延初期化）"""
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client('s3')
    return _s3_client


def _extract_slide_title(markdown: str) -> str | None:
    """マークダウンからスライドタイトルを抽出"""
    # 最初の # 見出しを探す
    match = re.search(r'^#\s+(.+)$', markdown, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return None


def _inject_ogp_tags(html: str, title: str, image_url: str, page_url: str) -> str:
    """HTMLにOGPメタタグを挿入（既存のOGP/Twitterタグは削除して置換）"""
    # タイトルをHTMLエスケープ
    safe_title = html_escape.escape(title)

    # Marp CLIが生成する既存のOGP/Twitterタグを削除（重複防止）
    html = re.sub(r'<meta\s+property="og:[^"]*"[^>]*>\s*', '', html)
    html = re.sub(r'<meta\s+name="twitter:[^"]*"[^>]*>\s*', '', html)

    ogp_tags = f'''
    <meta property="og:title" content="{safe_title}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="{page_url}">
    <meta property="og:image" content="{image_url}">
    <meta property="og:description" content="パワポ作るマンで作成したスライド">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{safe_title}">
    <meta name="twitter:image" content="{image_url}">
    '''
    # </head>の前にOGPタグを挿入
    return html.replace('</head>', f'{ogp_tags}</head>')


def share_slide(markdown: str, theme: str = 'border') -> dict:
    """スライドをHTML化してS3に保存し、公開URLを返す（OGP対応）"""
    bucket_name = os.environ.get('SHARED_SLIDES_BUCKET')
    cloudfront_domain = os.environ.get('CLOUDFRONT_DOMAIN')

    if not bucket_name or not cloudfront_domain:
        raise RuntimeError("共有機能が設定されていません（環境変数未設定）")

    # スライドID生成（UUID v4）
    slide_id = str(uuid.uuid4())
    s3_client = _get_s3_client()

    # サムネイル生成・アップロード
    thumbnail_url = None
    try:
        thumbnail_bytes = generate_thumbnail(markdown, theme)
        thumbnail_key = f"slides/{slide_id}/thumbnail.png"
        s3_client.put_object(
            Bucket=bucket_name,
            Key=thumbnail_key,
            Body=thumbnail_bytes,
            ContentType='image/png',
        )
        thumbnail_url = f"https://{cloudfront_domain}/{thumbnail_key}"
        print(f"[INFO] Thumbnail uploaded: {thumbnail_url}")
    except Exception as e:
        # サムネイル生成に失敗してもHTML共有は続行
        print(f"[WARN] Thumbnail generation failed: {e}")

    # 共有URL（OGPタグ挿入前に決定）
    share_url = f"https://{cloudfront_domain}/slides/{slide_id}/index.html"

    # HTML生成
    html_content = generate_standalone_html(markdown, theme)

    # OGPタグ挿入（サムネイルがある場合のみ）
    if thumbnail_url:
        title = _extract_slide_title(markdown) or "スライド"
        html_content = _inject_ogp_tags(html_content, title, thumbnail_url, share_url)

    # S3にHTMLアップロード
    s3_key = f"slides/{slide_id}/index.html"
    s3_client.put_object(
        Bucket=bucket_name,
        Key=s3_key,
        Body=html_content.encode('utf-8'),
        ContentType='text/html; charset=utf-8',
    )

    # 有効期限（7日後）
    expires_at = int((datetime.utcnow() + timedelta(days=7)).timestamp())

    print(f"[INFO] Slide shared: {share_url} (expires: {expires_at})")

    return {
        'slideId': slide_id,
        'url': share_url,
        'expiresAt': expires_at,
    }
