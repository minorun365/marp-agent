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
    """指定URLにHTTPリクエストを送信し、レスポンスのテキスト内容を返します。

    このツールはHTTPおよびHTTPS URLへのリクエストをサポートし、取得したWebページや
    APIレスポンスの内容をスライド作成の参考情報として返します。大きなレスポンスは
    自動的にClaude Haikuで要約してトークン消費を最小限に抑えます。

    ## 主な用途

    - 特定のWebページのコンテンツを詳しく取得する（ニュース記事・製品ページ・公式ドキュメントなど）
    - web_searchで見つけたURLのページ本文を精読して正確な情報を把握する
    - REST APIのエンドポイントにリクエストを送信してJSONデータを取得する
    - 公開されているデータセットや統計情報・調査レポートを参照する
    - Webページ上の具体的な数値・引用文・事例を確認してスライドに活用する

    ## urlパラメータの詳細

    - HTTPまたはHTTPSで始まる完全なURL形式で指定してください
    - 例: "https://example.com/article" や "https://api.example.com/v1/data"
    - URLにクエリパラメータを含める場合は適切にエンコードしてください
    - ローカルホスト（localhost）や社内ネットワークのURLには到達できません
    - 認証が必要なページ（ログイン必須）は取得できません
    - JavaScriptで動的に描画されるコンテンツは取得できない場合があります

    ## methodパラメータの詳細

    通常はデフォルトの "GET" をそのまま使用してください。

    - "GET"  : URLで指定したリソースを取得する（最も一般的なメソッド）
    - "POST" : フォームデータやJSONをサーバーに送信する（レスポンスボディあり）
    - "HEAD" : レスポンスヘッダーのみ取得しコンテンツは受け取らない
    - "OPTIONS": サーバーがサポートするHTTPメソッド一覧を取得する

    ## 自動処理の仕組み

    1. **HTMLの自動テキスト変換**:
       Content-TypeがHTML形式の場合、script・styleタグや不要なHTMLタグを自動除去し、
       読みやすいプレーンテキストに変換してから返します。

    2. **大きなレスポンスの自動要約**:
       取得内容が5,000文字を超える場合、Claude Haiku 4.5がスライド作成に有用な情報を
       抽出・要約します。固有名詞・数値・重要な事実は優先的に保持されます。
       元の内容が50,000文字を超える場合は先頭50,000文字のみを要約対象とします。

    3. **要約失敗時のフォールバック**:
       Haiku要約が何らかの理由で失敗した場合は先頭5,000文字を切り詰めて返します。

    ## レスポンスの形式

    - 成功（小さいレスポンス）: "Status: 200\\n\\n（ページの内容）"
    - 成功（大きいレスポンス）: "Status: 200\\n\\n（以下はWebページの要約です - 元の文字数: XXXXX）\\n\\n（要約テキスト）"
    - HTTPエラー: "Status: 404\\n\\n（エラーページの内容）"
    - 接続エラー: "Error: （エラーメッセージ）"

    ## 使用例

    スライドのデータソースとして使う場合:
    - web_searchで "AWS re:Invent 2024 新機能" を検索
    - 検索結果に含まれるURLを本ツールで参照して詳細を確認
    - 取得した情報をスライドの箇条書きや数値として活用

    ## 注意事項

    - タイムアウトは30秒に設定されています（応答の遅いサイトはエラーになります）
    - Basic認証・Cookie認証・OAuth認証が必要なページにはアクセスできません
    - ロボット排除規約（robots.txt）に配慮して利用してください
    - PDF・画像・動画ファイルのURLはテキストとして取得できません

    Args:
        url: リクエスト先のURL（HTTPまたはHTTPS形式の完全なURL）
        method: HTTPメソッド（デフォルト: GET。GET / POST / HEAD / OPTIONS が使用可能）

    Returns:
        レスポンスのHTTPステータスコードとコンテンツ本文。コンテンツが5,000文字を超える場合は
        Claude Haiku 4.5による要約テキストが返されます。エラー時は Error: に続いてエラー内容が返されます。
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
