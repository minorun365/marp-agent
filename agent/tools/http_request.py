"""HTTP リクエストツール

ユーザーがメッセージに貼ったURLのページ本文を取得して、そのままエージェントへ渡す。

⚠️ かつてはここでClaude Haikuに要約させていたが、2026-08-18に廃止した。理由は2つある。

1. 要約を挟むと、記事の「何がキモなのか」という論の骨格が落ちる。要約の指示は
   固有名詞・数値・事実の保持だけを求めていたため、筆者の主張やストーリーが消えていた
2. 新基盤への移行時に BEDROCK_HAIKU_MODEL_ID が渡らなくなっており、要約は例外で落ちて
   フォールバックの「先頭5000文字だけ切り出し」が常時動いていた（本番ログで確認）。
   記事の後半が丸ごとエージェントに届いていなかった

いまはスライドの主役になる記事本文を、見出し構造ごとそのまま渡す。
"""

import re

import requests as req
from strands import tool

# エージェントへ渡す本文の上限。参考資料PDF（agent.py の MAX_EXTRACTED_CHARS）と揃える。
MAX_CONTENT_CHARS = 50000

# ユーザーがURLを貼って本文を取得したかどうか。web_searchの回数制限と、
# output_slideの根拠チェックが参照する（ContextVarはツールが別スレッドで動くため使えない）。
_url_fetched: bool = False


def get_url_fetched() -> bool:
    """このリクエストでユーザー提供URLの本文を取得済みかを返す。"""
    return _url_fetched


def reset_url_fetched() -> None:
    """リクエスト開始時に取得状態をリセットする。"""
    global _url_fetched
    _url_fetched = False


def _html_to_text(html: str) -> str:
    """HTMLから本文を抽出する。見出しはMarkdownとして残す。

    見出しを潰すと記事の章立て＝ストーリーラインが失われ、
    エージェントは平坦な文章の塊から構成を組み立てる羽目になる。
    """
    text = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    # 記事本文ではない周辺パーツを落としてノイズを減らす
    for tag in ("nav", "header", "footer", "aside", "form", "noscript", "svg"):
        text = re.sub(rf"<{tag}[^>]*>.*?</{tag}>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<!--.*?-->", " ", text, flags=re.DOTALL)

    # 見出しはレベルごとにMarkdownへ変換してから、残りのタグを落とす
    for level in (1, 2, 3, 4):
        text = re.sub(
            rf"<h{level}[^>]*>(.*?)</h{level}>",
            lambda match, level=level: f"\n\n{'#' * level} {re.sub(r'<[^>]+>', '', match.group(1)).strip()}\n",
            text,
            flags=re.DOTALL | re.IGNORECASE,
        )
    # 段落・リスト・改行は空白へ潰さず改行として残す
    text = re.sub(r"</(p|div|li|tr|section|article|blockquote)>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<li[^>]*>", "\n- ", text, flags=re.IGNORECASE)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)

    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    text = text.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
    # 行内の空白は詰めつつ、行構造は保つ
    text = re.sub(r"[ \t　]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


@tool
def http_request(url: str, method: str = "GET") -> str:
    """ユーザーがメッセージに貼ったURLのWebページを取得します。

    **使用条件**: ユーザーがURLを直接メッセージに貼った場合のみ使用してください。
    web_searchの検索結果URLには使用しないこと（snippetで十分スライドは作れる）。

    ## 取得した本文の扱い

    取得したページは**そのスライドの主役の資料**です。要約や一般論へ薄めず、
    この記事が何を伝えようとしているのか（筆者の主張・論の展開・結論）を軸に構成してください。
    見出しは `#` `##` としてそのまま残してあるので、記事の章立てを構成の手がかりにできます。

    ## 自動処理

    - HTMLは自動でテキスト変換（script/style/nav/footer等を除去し、見出しはMarkdown化）
    - 本文は最大50,000文字まで。超過分のみ末尾を切り詰め（要約はしません）

    ## 制約

    - タイムアウト: 30秒
    - 認証が必要なページ・動的JSレンダリングページは取得不可
    - PDF・画像・動画URLはテキストとして取得不可

    Args:
        url: リクエスト先のURL（HTTPまたはHTTPS）
        method: HTTPメソッド（デフォルト: GET）

    Returns:
        レスポンスのステータスコードとページ本文
    """
    global _url_fetched
    try:
        response = req.request(
            method,
            url,
            timeout=30,
            headers={
                # UA未指定だとbot扱いで弾くサイトがあるため、一般的なブラウザを名乗る
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
                ),
                "Accept-Language": "ja,en;q=0.8",
            },
        )
        content = response.text
        original_length = len(content)

        content_type = response.headers.get("Content-Type", "")
        if "text/html" in content_type:
            content = _html_to_text(content)

        if len(content) > MAX_CONTENT_CHARS:
            content = (
                content[:MAX_CONTENT_CHARS]
                + f"\n\n（以降省略 - 全{len(content)}文字中、先頭{MAX_CONTENT_CHARS}文字）"
            )

        _url_fetched = True
        print(f"[INFO] URL fetched: {url} (html={original_length} chars, text={len(content)} chars)")
        return (
            f"Status: {response.status_code}\n\n"
            "以下はユーザーが指定したページの本文です。この資料の主張がスライドの主役です。\n\n"
            f"{content}"
        )
    except Exception as e:
        print(f"[ERROR] URL fetch failed: {url}: {e}")
        return f"Error: {e}"
