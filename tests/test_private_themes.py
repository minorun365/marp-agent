"""運営者だけに出す非公開テーマのテスト。S3 は差し替える。"""

import io
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "agent"))
import private_themes  # noqa: E402


class FakeS3:
    def __init__(self, objects):
        self.objects = objects
        self.downloaded = []

    def get_object(self, Bucket, Key):
        if Key not in self.objects:
            raise KeyError(Key)
        return {"Body": io.BytesIO(self.objects[Key].encode("utf-8"))}

    def download_file(self, bucket, key, path):
        Path(path).write_text(self.objects[key], encoding="utf-8")
        self.downloaded.append(key)


@pytest.fixture
def s3(monkeypatch, tmp_path):
    fake = FakeS3({
        "themes/manifest.json": json.dumps([{"id": "corp", "name": "Corp"}, {"id": "../bad", "name": "x"}]),
        "themes/corp.css": "/* @theme corp */ section { color: red; }",
    })
    monkeypatch.setenv("PRIVATE_THEMES_BUCKET", "private-themes-test")
    monkeypatch.setattr(private_themes, "_s3", lambda: fake)
    monkeypatch.setattr(private_themes, "CACHE_DIR", tmp_path)
    return fake


def test_一覧は名前とCSSを返し不正なIDは捨てる(s3):
    themes = private_themes.list_private_themes()
    assert [t["id"] for t in themes] == ["corp"]
    assert themes[0]["name"] == "Corp"
    assert "@theme corp" in themes[0]["css"]


def test_バケットが無い環境では空を返す(monkeypatch):
    monkeypatch.delenv("PRIVATE_THEMES_BUCKET", raising=False)
    assert private_themes.list_private_themes() == []


def test_ownerの非公開テーマは取り寄せたCSSのパスになる(s3, tmp_path):
    resolved = private_themes.resolve_export_theme("corp", is_owner=True)
    assert resolved == str(tmp_path / "corp.css")
    assert s3.downloaded == ["themes/corp.css"]


def test_owner以外には非公開テーマを渡さない(s3):
    assert private_themes.resolve_export_theme("corp", is_owner=False) == "corp"
    assert s3.downloaded == []


def test_組み込みのテーマは素通りする(s3, monkeypatch, tmp_path):
    monkeypatch.setattr(private_themes, "__file__", str(tmp_path / "private_themes.py"))
    (tmp_path / "border.css").write_text("/* @theme border */")
    assert private_themes.resolve_export_theme("border", is_owner=True) == "border"
