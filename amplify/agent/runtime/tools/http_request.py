"""HTTP リクエストツール（Haiku要約付き）

strands_tools の http_request はWebページ全文を返すため、
会話履歴のトークンが膨らむ原因になっていた。
このラッパーでは大きなレスポンスをHaikuで要約してコスト削減する。
"""

import re

import boto3
import requests as req
from strands import tool

# 要約を適用するしきい値（この文字数以下ならそのまま返す）
SUMMARIZE_THRESHOLD = 5000

# Haiku要約用の入力上限（これ以上はHaikuにも送らない）
HAIKU_INPUT_LIMIT = 50000

HAIKU_MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0"

_bedrock_client = None


def _get_bedrock_client():
    global _bedrock_client
    if _bedrock_client is None:
        _bedrock_client = boto3.client("bedrock-runtime", region_name="us-east-1")
    return _bedrock_client


def _html_to_text(html: str) -> str:
    """HTMLからテキストを簡易抽出"""
    text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL)
    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _summarize_with_haiku(content: str) -> str:
    """Claude Haikuでコンテンツを要約"""
    client = _get_bedrock_client()
    response = client.converse(
        modelId=HAIKU_MODEL_ID,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "text": (
                            "以下のWebページ内容を、スライド作成の参考資料として簡潔に要約してください。\n"
                            "固有名詞、数値、重要な事実は必ず保持してください。\n\n"
                            f"{content}"
                        ),
                    }
                ],
            }
        ],
        inferenceConfig={"maxTokens": 2000},
    )
    return response["output"]["message"]["content"][0]["text"]


@tool
def http_request(url: str, method: str = "GET") -> str:
    """指定URLにHTTPリクエストを送信し、レスポンスを返します。大きなレスポンスは自動的に要約されます。

    Args:
        url: リクエスト先のURL
        method: HTTPメソッド（デフォルト: GET）

    Returns:
        レスポンスの内容（大きい場合はAIによる要約）
    """
    try:
        response = req.request(method, url, timeout=30)
        content = response.text
        original_length = len(content)

        # HTMLレスポンスはテキスト抽出
        content_type = response.headers.get("Content-Type", "")
        if "text/html" in content_type:
            content = _html_to_text(content)

        # 一定サイズ以上の場合はHaikuで要約
        if len(content) > SUMMARIZE_THRESHOLD:
            try:
                summary = _summarize_with_haiku(content[:HAIKU_INPUT_LIMIT])
                content = f"（以下はWebページの要約です - 元の文字数: {original_length}）\n\n{summary}"
            except Exception as e:
                # 要約失敗時はフォールバックで切り詰め
                print(f"[WARN] Haiku summarization failed, truncating: {e}")
                content = (
                    content[:SUMMARIZE_THRESHOLD]
                    + f"\n\n（以降省略 - 全{original_length}文字中、先頭{SUMMARIZE_THRESHOLD}文字を表示）"
                )

        return f"Status: {response.status_code}\n\n{content}"
    except Exception as e:
        return f"Error: {e}"
