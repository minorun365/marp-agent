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


def test_kimi_and_grok_are_enabled():
    """標準はKimi。Grokは選択肢として並べ、実利用を見てから標準にするか決める。"""
    assert ENABLED_MODEL_TYPES == {"kimi", "grok"}
    assert normalize_model_type("kimi") == "kimi"
    assert normalize_model_type("grok") == "grok"


@pytest.mark.parametrize(
    "requested_model",
    [None, "glm", "sol", "sonnet", "sonnet5", "opus", "unknown"],
)
def test_disabled_model_falls_back_to_kimi(requested_model):
    assert normalize_model_type(requested_model) == "kimi"


@pytest.mark.parametrize("requested_model", ["glm", "sol", "sonnet", "opus"])
def test_get_model_config_uses_kimi_for_disabled_models(
    monkeypatch,
    requested_model,
):
    monkeypatch.setenv("BEDROCK_KIMI_MODEL_ID", "moonshotai.kimi-k2.5")

    assert get_model_config(requested_model)["model_id"] == "moonshotai.kimi-k2.5"


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


def test_grok_system_prompt_stays_short_and_covers_the_measured_gaps():
    """Grok向けの指示は、実測で足りなかった点だけを足した短い契約に保つ。

    2026-08-19の実測（Sonnet 4.6と同じシンプルなプロンプトで3お題ずつ）では、
    Grokは指定枚数・はみ出し・構造違反・見出しの主張化をSonnetと同等以上に守れた。
    Kimi向けに積み上げた枚数の内訳表や `site:` 指定は、Grokには不要だったので入れない。
    補ったのは、Sonnetと比べて明確に劣っていた次の3点だけ。
    """
    prompt = get_system_prompt("speee", "grok")

    assert "Grok 4.6実行契約" in prompt
    # 1) 表の区切り行が7個中5個で抜け、表として描画されなかった
    assert "区切り行を必ず入れる" in prompt
    # 2) 本文量がSonnetの7割程度で、2〜3項目のページが混ざった
    assert "本文の要素を4〜5つ並べる" in prompt
    assert "要素が2〜3つで終わるページを作らない" in prompt
    # 3) 密度を上げた版で製品名が「Code側」「両社」へ縮み、比較が読めなくなった
    assert "正式な製品名を本文と表へそのまま書く" in prompt

    # Kimi向けの重い指示を持ち込まない（持ち込むと薄く短い出力へ戻る）
    assert "指定枚数を増減しない" not in prompt
    assert "site:help.openai.com" not in prompt
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


def test_output_slide_patterns_all_require_a_lead_line():
    """全パターンにリード文があり、箇条書きだけで完結する型が残っていないこと。"""
    from tools.output_slide import output_slide

    doc = output_slide.__doc__ or ""

    assert "リード文【重要】" in doc
    assert "主張+根拠型" in doc
    assert "因果型" in doc
    # 箇条書きだけで完結していた旧A型が復活していないこと
    assert "**箇条書き型**: `##` + 箇条書き5〜6項目" not in doc
    for pattern_line in ("A. **主張+根拠型**", "B. **小見出し型**", "C. **テーブル型**",
                         "D. **因果型**", "E. **まとめ型**"):
        assert pattern_line in doc
        index = doc.index(pattern_line)
        assert "リード文1行" in doc[index:index + 120], f"{pattern_line} にリード文がない"
