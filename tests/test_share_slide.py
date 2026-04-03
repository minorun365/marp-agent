"""share_slide のユニットテスト"""

from uuid import UUID
from unittest.mock import MagicMock, patch

from sharing.s3_uploader import share_slide


def test_share_slide_uses_public_domain():
    """独自ドメインがある場合は共有URLとOGP画像にそれを使う"""
    s3_client = MagicMock()

    with patch.dict(
        "os.environ",
        {
            "SHARED_SLIDES_BUCKET": "shared-bucket",
            "CLOUDFRONT_DOMAIN": "d111111abcdef8.cloudfront.net",
            "SHARED_SLIDES_PUBLIC_DOMAIN": "slides.pawapo.minoruonda.com",
        },
        clear=False,
    ):
        with patch("sharing.s3_uploader._get_s3_client", return_value=s3_client):
            with patch("sharing.s3_uploader.generate_thumbnail", return_value=b"png"):
                with patch(
                    "sharing.s3_uploader.generate_standalone_html",
                    return_value="<html><head></head><body>ok</body></html>",
                ):
                    with patch(
                        "sharing.s3_uploader.uuid.uuid4",
                        return_value=UUID("12345678-1234-5678-1234-567812345678"),
                    ):
                        result = share_slide("# テスト")

    assert result["url"] == "https://slides.pawapo.minoruonda.com/slides/12345678-1234-5678-1234-567812345678/index.html"
    assert s3_client.put_object.call_count == 2
    assert s3_client.put_object.call_args_list[0].kwargs["Key"] == "slides/12345678-1234-5678-1234-567812345678/thumbnail.png"
    assert b"slides.pawapo.minoruonda.com/slides/12345678-1234-5678-1234-567812345678/thumbnail.png" in (
        s3_client.put_object.call_args_list[1].kwargs["Body"]
    )


def test_share_slide_falls_back_to_cloudfront_domain():
    """独自ドメイン未設定時はCloudFrontドメインを使う"""
    s3_client = MagicMock()

    with patch.dict(
        "os.environ",
        {
            "SHARED_SLIDES_BUCKET": "shared-bucket",
            "CLOUDFRONT_DOMAIN": "d111111abcdef8.cloudfront.net",
            "SHARED_SLIDES_PUBLIC_DOMAIN": "",
        },
        clear=False,
    ):
        with patch("sharing.s3_uploader._get_s3_client", return_value=s3_client):
            with patch("sharing.s3_uploader.generate_thumbnail", return_value=b"png"):
                with patch(
                    "sharing.s3_uploader.generate_standalone_html",
                    return_value="<html><head></head><body>ok</body></html>",
                ):
                    with patch(
                        "sharing.s3_uploader.uuid.uuid4",
                        return_value=UUID("87654321-4321-8765-4321-876543218765"),
                    ):
                        result = share_slide("# テスト")

    assert result["url"] == "https://d111111abcdef8.cloudfront.net/slides/87654321-4321-8765-4321-876543218765/index.html"
