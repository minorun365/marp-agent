"""Kimi K2専用処理（thinkタグ除去、ツール名破損検出、マークダウン抽出）"""

import re
import json

from config import VALID_TOOL_NAMES


def extract_markdown(text: str) -> str | None:
    """レスポンスからマークダウンを抽出（```markdownブロックから）"""
    pattern = r"```markdown\s*([\s\S]*?)\s*```"
    match = re.search(pattern, text)
    if match:
        return match.group(1).strip()
    return None


def is_tool_name_corrupted(tool_name: str) -> bool:
    """ツール名が破損しているかチェック（Kimi K2対策）"""
    if not tool_name:
        return False
    # 有効なツール名でなければ破損とみなす
    if tool_name not in VALID_TOOL_NAMES:
        return True
    # 内部トークンが混入していたら破損
    if "<|" in tool_name or "tooluse_" in tool_name:
        return True
    return False


def remove_think_tags(text: str) -> str:
    """<think>...</think>タグを除去する（Kimi K2 Thinking対策）

    Kimi K2 Thinkingモデルはテキストストリームに<think>タグで思考過程を出力することがある。
    これをチャット欄に表示しないよう除去する。
    """
    # <think>...</think> タグとその中身を除去（複数行対応）
    return re.sub(r'<think>[\s\S]*?</think>', '', text)


def extract_marp_markdown_from_text(text: str) -> str | None:
    """テキストからMarpマークダウンを抽出（フォールバック用）

    Kimi K2がoutput_slideツールを呼ばずにテキストとしてマークダウンを出力した場合に使用。
    以下の2パターンに対応：
    1. 直接的なマークダウン: ---\nmarp: true\n...
    2. JSON引数内のマークダウン: {"markdown": "---\\nmarp: true\\n..."}
    """
    if not text:
        return None

    # "marp: true" または "marp:" がない場合はスキップ（エスケープ版も考慮）
    if "marp:" not in text and 'marp\\":' not in text:
        return None

    # ケース1: JSON引数内のマークダウンを抽出（Kimi K2がreasoningText内にツール呼び出しを埋め込んだ場合）
    # パターン: <|tool_call_argument_begin|> {"markdown": "..."} <|tool_call_end|>
    json_arg_pattern = r'<\|tool_call_argument_begin\|>\s*(\{[\s\S]*?\})\s*<\|tool_call_end\|>'
    json_match = re.search(json_arg_pattern, text)
    if json_match:
        try:
            json_str = json_match.group(1)
            # エスケープされた改行を処理
            data = json.loads(json_str)
            if isinstance(data, dict) and "markdown" in data:
                markdown = data["markdown"]
                if markdown and "marp: true" in markdown:
                    print(f"[INFO] Extracted markdown from JSON tool argument in reasoningText")
                    return markdown
        except json.JSONDecodeError as e:
            print(f"[WARN] Failed to parse JSON from tool argument: {e}")

    # ケース2: テキスト内に直接出力されたマークダウンを抽出
    text_lower = text.lower()
    if "marp: true" in text_lower:
        # パターンA: 正規のフロントマター形式 "---\nmarp: true\n..."
        pattern_with_frontmatter = r'(---\s*[\r\n]+marp:\s*true[\s\S]*?)(?:<\|tool_call|$)'
        match = re.search(pattern_with_frontmatter, text, re.IGNORECASE)

        if not match:
            # パターンB: フロントマター区切り(---)なしで出力された場合
            pattern_without_frontmatter = r'(marp:\s*true[\s\S]*?)(?:<\|tool_call|$)'
            match = re.search(pattern_without_frontmatter, text, re.IGNORECASE)
            if match:
                # フロントマターの開始記号を補完
                markdown = "---\n" + match.group(1).strip()
                print(f"[INFO] Extracted markdown without frontmatter delimiter (added ---)")
            else:
                # デバッグ: マッチしなかった場合、先頭100文字をログ出力
                preview = text[:200].replace('\n', '\\n').replace('\r', '\\r')
                print(f"[WARN] Marp markdown detected but extraction failed. Text preview: {preview}")
                return None
        else:
            markdown = match.group(1).strip()

        # 内部トークンが残っていたら除去
        markdown = re.sub(r'<\|[^>]+\|>', '', markdown)
        # 末尾の不完全な行を除去
        lines = markdown.split('\n')
        # 最後の行が不完全（閉じタグなど）なら除去
        while lines and (lines[-1].strip().startswith('<|') or not lines[-1].strip()):
            lines.pop()
        return '\n'.join(lines) if lines else None

    return None
