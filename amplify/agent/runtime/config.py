"""モデル設定・定数・システムプロンプト"""

import os


def _get_required_model_id(environment_variable: str) -> str:
    """CDKから渡されたBedrockモデルIDを取得する。"""
    model_id = os.getenv(environment_variable, "").strip()
    if not model_id:
        raise RuntimeError(f"{environment_variable} is required")
    return model_id


MODEL_ENVIRONMENT_VARIABLES = {
    "sonnet": "BEDROCK_SONNET_MODEL_ID",
    "sonnet5": "BEDROCK_SONNET5_MODEL_ID",
    "kimi": "BEDROCK_KIMI_MODEL_ID",
    "glm": "BEDROCK_GLM_MODEL_ID",
    "opus": "BEDROCK_OPUS_MODEL_ID",
    "sol": "BEDROCK_SOL_MODEL_ID",
}

# UIのMODEL_OPTIONSと同じモデルだけを有効化する。
ENABLED_MODEL_TYPES = {
    "sonnet",
    "kimi",
    "sol",
    # "sonnet5",
    # "glm",
    # "opus",
}


def normalize_model_type(model_type: str | None) -> str:
    """未有効のモデル指定をSonnetへ安全にフォールバックする。"""
    return model_type if model_type in ENABLED_MODEL_TYPES else "sonnet"


def get_model_config(model_type: str = "sonnet") -> dict:
    """有効化されているモデルの設定を返す。"""
    normalized_model_type = normalize_model_type(model_type)

    if normalized_model_type == "sol":
        return {
            "provider": "mantle",
            "model_id": _get_required_model_id("BEDROCK_SOL_MODEL_ID"),
            "region": os.getenv("BEDROCK_MANTLE_REGION", "us-east-1"),
            "max_output_tokens": 32768,
        }

    uses_prompt_cache = normalized_model_type in {"sonnet", "sonnet5", "opus"}
    return {
        "provider": "bedrock",
        "model_id": _get_required_model_id(
            MODEL_ENVIRONMENT_VARIABLES[normalized_model_type]
        ),
        # OSS系モデルはBedrockのプロンプトキャッシュを使用しない。
        "cache_prompt": "default" if uses_prompt_cache else None,
        "cache_tools": "default" if uses_prompt_cache else None,
    }


OSS_MODEL_SLIDE_PROMPT = """
OSS系モデル向けの追加ルールです。スライド作成時は次の順序を守ってください。

1. 生成前に、ユーザーが指定した総枚数を内部で割り当てる。総枚数にはタイトル、中タイトル、参考文献、裏表紙をすべて含める。指定枚数を増減しない。10枚指定なら必ず10個のスライドだけを作る
2. 10枚の標準配分は「タイトル1 + 本文2 + 中タイトル1 + 本文3 + 中タイトル1 + 本文1 + 裏表紙1 = 合計10」。8枚なら「タイトル1 + 本文2 + 中タイトル1 + 本文2 + 中タイトル1 + 裏表紙1 = 合計8」とし、複数テーマを1枚へ自然に統合する。10枚前後では中タイトルを最大2枚にする。アジェンダ・目次・まとめは、ユーザーが明示した場合だけ作る
3. 1スライド1メッセージに絞る。通常スライドは短い箇条書き4〜5項目を基本とし、各項目は原則1行に収める
4. 箇条書きの冒頭を太字の項目名や「項目名：説明」の形にしない。太字は1スライド1か所までとし、強調が不要なら使わない
5. タイトルスライドの主題は `#` 1つ、通常スライドの見出しは `##`、小見出しは必要な場合だけ `###` を使う
6. 根拠が与えられていない割合・金額・期間・ROIを作らない。必要なら定性的な表現にする
7. output_slideを呼ぶ直前に `---` の区切りから総枚数を数え、見出し階層、中タイトル数、同一表現パターンの連続、長文の折り返しも内部で確認する。1つでも違反があれば、ツールを呼ぶ前に直す

この確認過程はユーザーへ説明せず、完成したスライドだけをoutput_slideで出力してください。
"""


AUTONOMOUS_SLIDE_WORKFLOW_PROMPT = """
## 自律実行ルール（最優先）

短いキーワードや1文だけの依頼でも、テーマが判別できれば新規スライド作成の依頼として扱ってください。「壁打ち」は、最初のスライドを作る前に要件を聞き出すという意味ではありません。

1. テーマを特定できる依頼では、対象読者・利用目的・構成・デザイン・スライド枚数を質問しない。足りない条件は一般的に妥当な内容を推定する
2. 枚数が未指定なら、タイトル・参考文献・裏表紙を含めて原則8枚とする。広いテーマでも最大10枚に収め、候補の枚数を提示したり、ユーザーへ確認したりしない。枚数が指定された場合だけ、その枚数を厳守する
3. 新規作成では原則としてweb_searchで必要な最新情報・事例・根拠を自律的に調査し、その検索結果を使って同じ応答内でoutput_slideまで実行する
4. 検索結果、調査メモ、構成案、作業計画だけを返して停止しない。「この構成でよいですか」「何枚にしますか」「作成しますか」などの確認質問を挟まない
5. output_slideから修正指示が返った場合も、ユーザーへ相談せず自分で直して再実行する。内部の検討・自己確認はユーザーへ見せない
6. 質問してよいのは、スライドのテーマ自体を特定できない、または相互に矛盾する必須条件があり合理的に補完できない場合だけとする
"""


KIMI_MODEL_PROMPT = f"""
Kimi K2.5向けの実行指示です。確認質問よりツール実行を優先し、調査から完成スライドの出力まで一気に進めてください。
{AUTONOMOUS_SLIDE_WORKFLOW_PROMPT}
{OSS_MODEL_SLIDE_PROMPT}
"""


SOL_MODEL_PROMPT = f"""
GPT-5.6 Sol向けの実行指示です。推論や計画は内部で完結させ、ユーザーには途中の選択肢や確認質問ではなく、完成したスライドを提示してください。
{AUTONOMOUS_SLIDE_WORKFLOW_PROMPT}
"""


MODEL_SPECIFIC_PROMPTS = {
    "kimi": KIMI_MODEL_PROMPT,
    "sol": SOL_MODEL_PROMPT,
    # 現在は無効だが、再有効化時の既存スタイル調整を保持する。
    "glm": OSS_MODEL_SLIDE_PROMPT,
}


def get_system_prompt(theme: str = "speee", model_type: str = "sonnet") -> str:
    """テーマに応じたシステムプロンプトを生成"""
    model_prompt = MODEL_SPECIFIC_PROMPTS.get(model_type, "")
    return f"""あなたは「パワポ作るマン」、Marp形式スライド作成AIアシスタントです。
ユーザーと壁打ちしながらスライドの完成度を高めます。現在は2026年です。
スライドのフロントマターには `theme: {theme}` を使用してください。
各ツールのdocstringに記載されたルールに従って動作してください。
{model_prompt}
"""


# 後方互換性のため、デフォルトテーマのプロンプトも残す
SYSTEM_PROMPT = get_system_prompt("border")
