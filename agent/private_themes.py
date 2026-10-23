"""運営者（Cognito の owner グループ）だけに出す非公開テーマ。

テーマの中身はこのリポジトリに置かない。非公開の S3（環境変数 PRIVATE_THEMES_BUCKET）に
`themes/manifest.json`（[{"id": "...", "name": "..."}]）と `themes/<id>.css` を置き、
owner の利用者にだけ一覧と中身を返す。書き出しでは CSS をコンテナへ取り寄せて marp-cli に渡す。
バケットが無い・空の環境では、何も足さずに素通りする。
"""

import json
import os
import re
from pathlib import Path

import boto3

PREFIX = "themes/"
CACHE_DIR = Path("/tmp/private-themes")
_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")


def _bucket() -> str:
    return os.getenv("PRIVATE_THEMES_BUCKET", "").strip()


def _s3():
    return boto3.client("s3")


def _manifest(bucket: str) -> list[dict]:
    try:
        body = _s3().get_object(Bucket=bucket, Key=f"{PREFIX}manifest.json")["Body"].read()
    except Exception as error:  # バケットや一覧が無いのは正常（非公開テーマを使わない環境）
        print(f"[INFO] private themes unavailable: {error.__class__.__name__}")
        return []
    entries = json.loads(body)
    return [e for e in entries if isinstance(e, dict) and _ID_PATTERN.match(str(e.get("id", "")))]


def list_private_themes() -> list[dict]:
    """[{id, name, css}] を返す。呼び出し側で owner かどうかを確かめてから呼ぶ。"""
    bucket = _bucket()
    if not bucket:
        return []
    themes = []
    for entry in _manifest(bucket):
        theme_id = entry["id"]
        css = _s3().get_object(Bucket=bucket, Key=f"{PREFIX}{theme_id}.css")["Body"].read().decode("utf-8")
        themes.append({"id": theme_id, "name": str(entry.get("name") or theme_id), "css": css})
    return themes


def resolve_export_theme(theme: str, is_owner: bool) -> str:
    """書き出しに渡すテーマ。owner の非公開テーマなら取り寄せた CSS の絶対パスを返す。"""
    builtin = Path(__file__).parent / f"{theme}.css"
    if builtin.exists() or not is_owner or not _ID_PATTERN.match(theme or ""):
        return theme
    bucket = _bucket()
    if not bucket or theme not in {e["id"] for e in _manifest(bucket)}:
        return theme
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{theme}.css"
    _s3().download_file(bucket, f"{PREFIX}{theme}.css", str(path))
    return str(path)
