"""ツイートURL生成ツール"""

import urllib.parse
from strands import tool

# ツイートURL用のグローバル変数
_generated_tweet_url: str | None = None


def get_generated_tweet_url() -> str | None:
    """生成されたツイートURLを取得"""
    return _generated_tweet_url


def reset_generated_tweet_url() -> None:
    """ツイートURLをリセット"""
    global _generated_tweet_url
    _generated_tweet_url = None


@tool
def generate_tweet_url(tweet_text: str) -> str:
    """ツイート投稿用のURLを生成します。ユーザーがXでシェアしたい場合に使用してください。

    Args:
        tweet_text: ツイート本文（100文字以内、ハッシュタグ含む）

    Returns:
        生成完了メッセージ
    """
    global _generated_tweet_url
    # 日本語をURLエンコード
    encoded_text = urllib.parse.quote(tweet_text, safe='')
    # Twitter Web Intent（compose/postではtextパラメータが無視される）
    _generated_tweet_url = f"https://twitter.com/intent/tweet?text={encoded_text}"
    return "ツイートURLを生成しました。"
