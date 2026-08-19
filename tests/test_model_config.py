"""Bedrockモデル設定のユニットテスト。"""

import pytest

import config
from config import (
    ENABLED_MODEL_TYPES,
    get_model_config,
    get_system_prompt,
    normalize_model_type,
)
from tools.http_request import _html_to_text


def test_only_grok_is_enabled():
    """標準はGrok。Sonnet 4.6は停止中の表示だけUIへ残し、Kimiは設定だけ保持する。"""
    assert ENABLED_MODEL_TYPES == {"grok"}
    assert normalize_model_type("grok") == "grok"


@pytest.mark.parametrize(
    "requested_model",
    [None, "kimi", "glm", "sol", "sonnet", "sonnet5", "opus", "unknown"],
)
def test_disabled_model_falls_back_to_grok(requested_model):
    assert normalize_model_type(requested_model) == "grok"


@pytest.mark.parametrize("requested_model", ["kimi", "glm", "sol", "sonnet"])
def test_get_model_config_uses_grok_for_disabled_models(
    monkeypatch,
    requested_model,
):
    monkeypatch.setenv("BEDROCK_GROK_MODEL_ID", "xai.grok-4.6")

    assert get_model_config(requested_model)["model_id"] == "xai.grok-4.6"


def test_grok_runs_on_mantle_in_us_west_2(monkeypatch):
    """Grok 4.6はMantleのus-west-2でだけ提供される（2026-08-19実測）。

    bedrock-runtime側には推論プロファイルが無いため、既定リージョンのままだと
    モデルが見つからない。
    """
    monkeypatch.setenv("BEDROCK_GROK_MODEL_ID", "xai.grok-4.6")
    monkeypatch.delenv("BEDROCK_GROK_REGION", raising=False)
    monkeypatch.delenv("GROK_REASONING_EFFORT", raising=False)

    model_config = get_model_config("grok")

    assert model_config == {
        "provider": "mantle",
        "model_id": "xai.grok-4.6",
        "region": "us-west-2",
        "max_output_tokens": 32768,
        # lowが既定。mediumと品質は同等で、所要時間が3分の1になる（2026-08-19実測）
        "reasoning_effort": "low",
    }


def test_get_model_config_uses_kimi_without_prompt_cache(monkeypatch):
    monkeypatch.setattr(config, "ENABLED_MODEL_TYPES", {"grok", "kimi"})
    monkeypatch.setenv("BEDROCK_KIMI_MODEL_ID", "moonshotai.kimi-k2.5")

    model_config = get_model_config("kimi")

    assert model_config == {
        "provider": "bedrock",
        "model_id": "moonshotai.kimi-k2.5",
        "cache_prompt": None,
        "cache_tools": None,
    }


def test_sol_config_is_ready_for_reenable(monkeypatch):
    monkeypatch.setattr(config, "ENABLED_MODEL_TYPES", {"grok", "sol"})
    monkeypatch.setenv("BEDROCK_SOL_MODEL_ID", "openai.gpt-5.6-sol")
    monkeypatch.setenv("BEDROCK_MANTLE_REGION", "us-east-1")

    model_config = get_model_config("sol")

    assert model_config == {
        "provider": "mantle",
        "model_id": "openai.gpt-5.6-sol",
        "region": "us-east-1",
        "max_output_tokens": 32768,
    }


def test_get_model_config_uses_glm_without_prompt_cache(monkeypatch):
    monkeypatch.setattr(config, "ENABLED_MODEL_TYPES", {"grok", "glm"})
    monkeypatch.setenv("BEDROCK_GLM_MODEL_ID", "zai.glm-5")

    model_config = get_model_config("glm")

    assert model_config == {
        "provider": "bedrock",
        "model_id": "zai.glm-5",
        "cache_prompt": None,
        "cache_tools": None,
    }


def test_get_model_config_rejects_missing_kimi_environment_variable(monkeypatch):
    monkeypatch.setattr(config, "ENABLED_MODEL_TYPES", {"grok", "kimi"})
    monkeypatch.delenv("BEDROCK_KIMI_MODEL_ID", raising=False)

    with pytest.raises(RuntimeError, match="BEDROCK_KIMI_MODEL_ID"):
        get_model_config("kimi")


def test_get_model_config_rejects_missing_sol_environment_variable(monkeypatch):
    monkeypatch.setattr(config, "ENABLED_MODEL_TYPES", {"grok", "sol"})
    monkeypatch.delenv("BEDROCK_SOL_MODEL_ID", raising=False)

    with pytest.raises(RuntimeError, match="BEDROCK_SOL_MODEL_ID"):
        get_model_config("sol")


def test_get_model_config_rejects_missing_glm_environment_variable(monkeypatch):
    monkeypatch.setattr(config, "ENABLED_MODEL_TYPES", {"grok", "glm"})
    monkeypatch.delenv("BEDROCK_GLM_MODEL_ID", raising=False)

    with pytest.raises(RuntimeError, match="BEDROCK_GLM_MODEL_ID"):
        get_model_config("glm")


def test_html_to_text_keeps_heading_structure():
    """記事の見出しは章立て＝ストーリーの骨格なので、Markdownとして残す。"""
    html = (
        "<html><head><style>.a{color:red}</style></head><body>"
        "<nav>メニュー1 メニュー2</nav>"
        "<h1>エージェント時代の開発</h1>"
        "<p>結論から書く。</p>"
        "<h2>何が変わったのか</h2>"
        "<ul><li>設計が変わる</li><li>運用が変わる</li></ul>"
        "<footer>copyright</footer>"
        "</body></html>"
    )

    text = _html_to_text(html)

    assert "# エージェント時代の開発" in text
    assert "## 何が変わったのか" in text
    assert "- 設計が変わる" in text
    # 本文以外のパーツとCSSは落とす
    assert "メニュー1" not in text
    assert "color:red" not in text
    assert "copyright" not in text


def test_url_reference_mode_prompt_prioritizes_the_article():
    """URLを貼った依頼では、記事が主役で検索は補助という契約になっている。"""
    prompt = config.URL_REFERENCE_MODE_PROMPT

    assert "最初に http_request" in prompt
    assert "主役の資料" in prompt
    assert "最大2回" in prompt


def test_grok_system_prompt_only_keeps_mechanical_rules():
    """Grok向けの指示は、Marpの表示と検査に必要なものだけに絞る。

    Kimi向けに積み上げた文章の型（結論を言い切る見出し、リード文を必ず置く、
    表現パターンA〜Eのローテーション）をGrokへ持ち込むと、資料が読者へ
    語りかける調子になって不自然になる（2026-08-20にみのるんから指摘）。
    素のGrokは指示が無いほうが淡々とした資料調で書くので、足すのは
    「無いと崩れる・検査に落ちる」ものだけにする。
    """
    prompt = get_system_prompt("speee", "grok")

    # 残すもの（無いと壊れる・取り違える）
    assert "そのままスライドまで作る" in prompt          # 確認質問をしない
    assert "対象の取り違えを防ぐほうを優先する" in prompt  # 略語の読み違い対策
    assert "依頼の題をそのまま短く置く" in prompt          # 表紙が主張文にならないように
    assert "正式な製品名を本文と表へそのまま書く" in prompt
    assert "<!-- source: https://... -->" in prompt        # 出典の検査に必要

    # 途中の発話は止めない。「検索します」程度の一言はあってよい
    assert "何をしているかを短く言いながら進めるのは構わない" in prompt
    assert "前置き" not in prompt

    # 文章の型は指示しない
    for banned in (
        "結論を述語で言い切った1文",
        "リード文",
        "本文の要素を4〜5つ",
        "判断基準か次の一歩",
        "である",
    ):
        assert banned not in prompt, f"文章の型が残っている: {banned}"

    assert len(prompt) < len(get_system_prompt("speee", "kimi"))


def test_kimi_system_prompt_adds_slide_balance_rules():
    prompt = get_system_prompt("speee", "kimi")

    assert "現在は2026年です。" in prompt
    assert "Kimi K2.5実行契約" in prompt
    assert "狭いテーマは10〜12枚" in prompt
    # レイアウト指示は、Kimiが自分で数えられる単位で与える。
    # 実測（2026-08-19）で行の56%が折り返していたため、文字数ではなく
    # 「折り返す前提で要素数を数える」形にした
    assert "本文の要素は、見出しを除いて5つまでにする" in prompt
    assert "全角32文字を超えると2行として数えられる" in prompt
    # ユーザーが貼ったURLは、検索結果URLと違って本文を取りに行く
    assert "ユーザーが自分でメッセージへ貼ったURLは別で" in prompt
    assert "複数の機能や論点を扱うテーマは14〜18枚" in prompt
    assert "最大20枚" in prompt
    assert "論点を分けて4〜6回検索" in prompt
    assert "最初の可視応答" in prompt
    assert "修正します。" in prompt
    assert "指定枚数を増減しない" in prompt
    assert "合計10" in prompt
    assert "参考文献1" in prompt
    assert "中タイトルを最大2枚" in prompt
    assert "アジェンダ・目次・まとめ" in prompt
    assert "検索結果やユーザー入力にない日付" in prompt
    assert "実在したURLを3件以上" in prompt
    assert "製品名の境界を厳密に守る" in prompt
    assert "対象製品名をURLまたはページタイトルに含むページだけ" in prompt
    assert "site:help.openai.com Codex rate card" in prompt
    assert "検索結果のURLへは、http_requestで本文を取りに行かない" in prompt
    assert "確認できないセルは「公式情報で要確認」" in prompt
    assert "比較の穴埋めとして追加しない" in prompt
    assert "<!-- source: https://... -->" in prompt
    assert "箇条書きの1項目は、句点で終わる1文にする" in prompt
    assert "該当スライドの箇条書きを1項目減らすか、長い項目を1文へ削る" in prompt
    assert "新しい説明・数値・出典を追加しない" in prompt


def test_glm_system_prompt_adds_oss_slide_rules():
    prompt = get_system_prompt("speee", "glm")

    assert "OSS系モデル向け" in prompt
    assert "参考文献1" in prompt


def test_kimi_system_prompt_requires_storytelling_over_bullet_lists():
    """箇条書きの羅列を防ぐ3点（構成の骨格・結論見出し・リード文）が指示されていること。

    Kimiは数えられるルールを優先するため、ストーリー側も数えられる形で
    与えている。この指示を削るとスライドが項目名の羅列へ戻る。
    """
    prompt = get_system_prompt("speee", "kimi")

    # 構成の骨格：ページ単位ではなく、話の流れとして役割を割り当てる
    assert "本文スライドごとの役割を先に割り当てる" in prompt
    assert "隣り合う本文スライドへ同じ役割を割り当てない" in prompt
    assert "事実の列挙で終わらせない" in prompt

    # 見出し：読者が最初に読む場所を、ラベルではなく主張にする
    assert "そのページの結論を述語で言い切った1文にする" in prompt
    assert "項目名を見出しに置かない" in prompt
    assert "見出しだけを縦に並べて読む" in prompt

    # リード文：理由・因果を書く場所を作る
    assert "結論を支える1行を置く" in prompt
    assert "見出しの言い換えにしない" in prompt

    # 指示を増やした分、競合時にどれを捨てるかを明示しておく
    assert "ルールが競合したときの優先順位" in prompt
    assert "見出しとリード文は最後まで残す" in prompt


def test_output_slide_doc_keeps_only_marp_requirements():
    """ツールの説明文は毎回モデルへ渡るので、ここに文章の型を書かない。

    2026-08-20、システムプロンプトから型を外してもスライドの調子が変わらなかった。
    原因は、この説明文に「結論を言い切る見出し」「リード文を必ず置く」
    「表現パターンA〜Eをローテーション」というKimi向けの型が残っていたこと。
    """
    from tools.output_slide import output_slide

    doc = output_slide.__doc__ or ""

    # Marpの表示と、このツール自身の検査に必要なものは残す
    assert "見出しの階層【重要】" in doc
    # 表現の幅（表・引用・太字の使い分けとセクション区切り）は、型の指定ではなく
    # 道具の提示なので残す。これを外すと資料が箇条書きだけの質素な見た目になる
    assert "3〜5枚ごとに" in doc
    assert "箇条書きだけを続けない" in doc
    assert "決まった型に当てはめない" in doc
    assert "通常スライドの見出しは `##`" in doc
    assert "区切り行を必ず置く" in doc
    assert "_class: end" in doc
    assert "9行が上限" in doc

    # 文章の型は書かない
    for banned in (
        "結論を述語で言い切った1文",
        "リード文【重要】",
        "表現パターン",
        "主張+根拠型",
        "因果型",
    ):
        assert banned not in doc, f"文章の型が残っている: {banned}"
