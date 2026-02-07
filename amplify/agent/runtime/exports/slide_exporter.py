"""スライドエクスポート（PDF/PPTX/HTML/サムネイル生成）"""

import subprocess
import tempfile
from pathlib import Path


def _run_marp_cli(markdown: str, output_format: str, theme: str = 'border') -> Path:
    """Marp CLIを実行して出力ファイルのパスを返す（共通処理）

    Args:
        markdown: Marpマークダウン
        output_format: 出力形式（"pdf", "pptx", "html", "png"）
        theme: テーマ名

    Returns:
        出力ファイルのPath
    """
    tmpdir = tempfile.mkdtemp()
    md_path = Path(tmpdir) / "slide.md"

    # 出力ファイル名の決定
    if output_format == "png":
        output_path = Path(tmpdir) / "slide.png"
    else:
        output_path = Path(tmpdir) / f"slide.{output_format}"

    md_path.write_text(markdown, encoding="utf-8")

    # Marp CLIコマンド構築
    cmd = [
        "marp",
        str(md_path),
        "--allow-local-files",
        "-o", str(output_path),
    ]

    # 出力形式に応じたフラグ
    if output_format == "pdf":
        cmd.append("--pdf")
    elif output_format == "pptx":
        cmd.append("--pptx")
    elif output_format == "html":
        cmd.append("--html")
    elif output_format == "png":
        cmd.extend(["--image", "png"])

    # テーマ設定
    theme_path = Path(__file__).parent.parent / f"{theme}.css"
    if theme_path.exists():
        cmd.extend(["--theme", str(theme_path)])

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        raise RuntimeError(f"Marp CLI error: {result.stderr}")

    return output_path


def generate_pdf(markdown: str, theme: str = 'border') -> bytes:
    """Marp CLIでPDFを生成"""
    output_path = _run_marp_cli(markdown, "pdf", theme)
    return output_path.read_bytes()


def generate_pptx(markdown: str, theme: str = 'border') -> bytes:
    """Marp CLIでPPTXを生成"""
    output_path = _run_marp_cli(markdown, "pptx", theme)
    return output_path.read_bytes()


def generate_standalone_html(markdown: str, theme: str = 'border') -> str:
    """Marp CLIでスタンドアロンHTMLを生成（共有用）"""
    output_path = _run_marp_cli(markdown, "html", theme)
    return output_path.read_text(encoding="utf-8")


def generate_thumbnail(markdown: str, theme: str = 'border') -> bytes:
    """Marp CLIで1枚目のスライドをPNG画像として生成（OGP用サムネイル）"""
    output_path = _run_marp_cli(markdown, "png", theme)

    # Marpは複数スライドの場合 slide.001.png, slide.002.png... を生成
    # 1枚目のサムネイルを取得
    png_files = sorted(output_path.parent.glob("slide*.png"))
    if not png_files:
        raise RuntimeError("Thumbnail generation failed: no PNG files created")

    return png_files[0].read_bytes()
