# パワポ作るマン TODO

> **注意**: TODO管理は **mainブランチのみ** で行います。kagブランチのTODOファイルは参照用のリンクのみです。

## タスク管理

反映先の凡例: ✅ 完了 / 🔧 作業中 / ⬜ 未着手 / ➖ 対象外
ラベル: 🔴 重要
並び順: ①重要度が高い順 → ②実装が簡単な順（工数が小さい順）

| # | タスク | 工数 | 状態 | ラベル | main 実装 | main docs | kag 実装 | kag docs |
|---|--------|------|------|--------|-----------|-----------|----------|----------|
| #10 | テーマ選択 | 中 | ✅ 完了 | 🔴 重要 | ✅ | ✅ | ➖ | ➖ |
| #26 | Kimiに変えてみる | 小〜中 | ⬜ 未着手 | 🔴 重要 | ⬜ | ⬜ | ➖ | ➖ |
| #21 | 企業のカスタムテンプレをアップロードして使えるようにしたい | 中〜大 | ⬜ 未着手 | 🔴 重要 | ⬜ | ⬜ | ➖ | ➖ |
| #33 | TavilyのExtractに対応 | 小 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #30 | スライドタイトルをAIが再設定するよう改善 | 小 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #32 | deploy-time-build: Repositoryを自前で渡す方式に修正 | 小 | ⬜ 未着手 | | ⬜ | ➖ | ➖ | ➖ |
| #29 | 絵文字（❌✅）直後の文字が改行される問題 | 小 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #28 | 表のセル内パディング調整 | 小 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #27 | 既存テーマにデザインバリエーション追加（タイトル・仕切りなど） | 小〜中 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #19 | ツイートおすすめメッセージのストリーミング対応 | 小 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #14 | 環境識別子リネーム（main→prod, dev→sandbox） | 小 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #6 | Tavilyレートリミット枯渇通知 | 中 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #7 | エラー監視・通知 | 中 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #22 | 参考資料などをアップロードして使えるようにしたい | 中〜大 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #23 | コードベースのリアーキテクチャ | 中〜大 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #16 | スライド編集（マークダウンエディタ） | 大 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #9 | スライド共有機能 | 大 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |

---

## タスク詳細

> **並び順**: 上記タスク管理表と同じ順番（①重要度が高い順 → ②実装が簡単な順）で記載しています。

### #10 テーマ選択 🔴重要 ✅完了

**実装済み（2026-01-31）**

#### テーマ一覧（3種類）

| ID | 表示名 | 種類 | 特徴 |
|----|--------|------|------|
| `border` | Border | カスタム | 白黒グラデーション＋太枠（デフォルト） |
| `gradient` | Gradient | コミュニティ | カラフル対角グラデーション |
| `beam` | Beam | コミュニティ | LaTeX Beamer風、学術向け |

#### UI配置

プレビュー画面のヘッダー左側にテーマ選択（ラベル＋ドロップダウン）を縦配置：

```
┌───────────────────────────────────────────────────────┐
│ テーマ                       [修正] [ダウンロード▼] │
│ [Border ▼]                                            │
└───────────────────────────────────────────────────────┘

各スライドカードの下部に「スライド 1/28」形式で表示
```

#### 実装ファイル

| ファイル | 内容 |
|---------|------|
| `src/components/SlidePreview.tsx` | THEMES配列、テーマ選択UI、マークダウンへのテーマ注入 |
| `src/themes/*.css` | border.css, gradient.css, beam.css |
| `amplify/agent/runtime/agent.py` | PDF/PPTX生成時のテーマ指定 |
| `amplify/agent/runtime/*.css` | 同上（バックエンド用） |

---

### #30 スライドタイトルをAIが再設定するよう改善

**概要**: ユーザーの質問がそのままスライドタイトルになってしまう問題。Web検索後にAIエージェントがスライドタイトルを適切に設定し直す必要がある。

**現状**:
- ユーザーの入力（例：「AWSについて教えて」）がそのままスライドの `# タイトル` になってしまう
- Web検索結果を踏まえた適切なタイトル設定がされていない

**原因**:
- システムプロンプトでタイトル設定のガイドラインが不足

**修正方法**:

**agent.py の SYSTEM_PROMPT に追加**:
```markdown
## スライドタイトルの設定ルール
- ユーザーの質問文をそのままタイトルにしないこと
- Web検索結果を踏まえて、内容を端的に表す**名詞句**でタイトルを設定
- 例:
  - ❌「AWSについて教えて」→ ✅「AWS入門ガイド」
  - ❌「生成AIの最新動向を調べて」→ ✅「生成AI最新トレンド 2025」
```

**工数**: 小（システムプロンプト修正のみ、30分程度）

---

### #29 絵文字（❌✅）直後の文字が改行される問題

**概要**: Marp内で❌や✅の絵文字を使うと、その直後の文字が改行されて表示されてしまう問題。

**原因の可能性**:
- 絵文字の幅計算とフォント・行高の相性問題
- MarpのCSS（デフォルトまたはborderテーマ）における行ボックス処理

**調査項目**:
1. 特定のフォント設定で発生するか確認
2. `border.css` の line-height 設定を確認
3. 絵文字の前後にゼロ幅スペースや改行が入っていないか確認

**考えられる対策**:
- システムプロンプトで❌✅の代わりに「×」「○」や「NG」「OK」を使うよう指示
- CSSで絵文字を含む要素の `white-space: nowrap` を設定
- フォントファミリーに絵文字対応フォントを追加

**工数**: 小（調査＋修正で1-2時間）

---

### #28 表のセル内パディング調整

**概要**: 表の中の文字と表の枠の間のパディングが少ないため、見た目のバランスが悪い問題を修正する。

**現状**:
- `border.css` にはテーブル固有のスタイルが**未定義**（`@import "default"` で継承しているのみ）
- Marpのデフォルトテーマではパディングが小さめに設定されている

**修正ファイル**:
| ファイル | 変更内容 |
|---------|---------|
| `src/themes/border.css` | テーブルスタイルを追加 |
| `amplify/agent/runtime/border.css` | 同じ内容を追加 |

**実装コード（border.css の末尾に追加）**:
```css
/* || TABLE: セル内パディング調整 */
section table {
  border-collapse: collapse;
  margin: 1em 0;
}

section table th,
section table td {
  padding: 0.6em 1.2em;  /* 上下0.6em、左右1.2em */
  border: 1px solid var(--border-color);
}

section table th {
  background-color: var(--bg-color-alt);
  font-weight: 700;
}

/* 偶数行の背景色（視認性向上） */
section table tr:nth-child(even) td {
  background-color: rgba(0, 0, 0, 0.03);
}
```

**パディング値の根拠**:
| 値 | 選定理由 |
|-----|---------|
| 上下 `0.6em` | 行間に余裕を持たせつつ、スライド内でコンパクトに収まる |
| 左右 `1.2em` | 列間の区切りを明確にし、文字が枠に接触しない |

**注意点**:
- フロントエンド（`src/themes/`）とバックエンド（`amplify/agent/runtime/`）の**両方を同じ内容に更新**すること
- プレビューとPDF出力で同じ見た目になることを確認

**工数**: 小（30分〜1時間）

---

### #27 既存テーマにデザインバリエーション追加（タイトル・仕切りなど）

**概要**: 現在の`border`テーマにスライドクラスを追加し、タイトルスライド・セクション区切り・引用など、デザインバリエーションを使えるようにする。

**現在のテーマ構成**:
- `src/themes/border.css` / `amplify/agent/runtime/border.css`（同一内容）
- 既存クラス: `tinytext`（参考文献用の小さい文字）のみ

**Marpのスライドクラス機能**:
```markdown
<!-- _class: title -->
# タイトル

<!-- _class: crosshead -->
## セクション区切り
```
`_` プレフィックス = **そのスライドのみ**に適用

**追加するクラス定義（border.css に追加）**:

```css
/* タイトルスライド - グラデーション背景 + 中央配置 */
section.title {
  background: linear-gradient(135deg, #0e0d6a 0%, #1a3a6e 100%);
  color: white;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
}

section.title h1 {
  font-size: 3.5em;
  margin: 0.5em 0;
  font-weight: 700;
}

section.title h3 {
  font-size: 1.3em;
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
  font-weight: 400;
}

/* セクション区切り - グレー背景 + 左ボーダー */
section.crosshead {
  background: linear-gradient(to bottom right, #f0f0f0 0%, #e0e0e0 100%);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  border-left: 1em solid var(--border-color);
}

section.crosshead h2 {
  font-size: 2.5em;
  color: var(--border-color);
  margin: 0;
}

/* 引用スライド - 左ボーダー + イタリック */
section.quote {
  background: linear-gradient(to bottom right, #fffaf0 0%, #fff5e6 100%);
  border-left: 5px solid #5ba4d9;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 2em;
}

section.quote blockquote {
  font-size: 1.8em;
  font-style: italic;
  color: var(--border-color);
  margin: 0;
  border: none;
  padding: 0;
}

/* 画像中心スライド */
section.image {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 1.5em;
}

section.image img {
  max-width: 90%;
  max-height: 60%;
  object-fit: contain;
}

/* ダークモード */
section.invert {
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  color: #ffffff;
  border-color: #ffffff;
}

/* ハイライト背景 */
section.highlight {
  background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
  border-left: 1em solid #ff9800;
}
```

**システムプロンプト更新（agent.py）**:

```markdown
## スライドクラス（デザインバリエーション）【推奨】

### タイトルスライド【必須】
1枚目は必ず `title` クラス:
<!-- _class: title -->
# タイトル
### サブタイトル

### セクション区切り【推奨】
3〜4スライドごとに `crosshead`:
<!-- _class: crosshead -->
## セクション2. テーマ別展開

### 引用【推奨】
重要な定義は `quote`:
<!-- _class: quote -->
> 「重要なポイント」
— 出典

### 画像中心【推奨】
写真を大きく表示: `image`

### ダーク/ハイライト【オプション】
`invert` / `highlight`
```

**修正ファイル**:
| ファイル | 変更内容 |
|---------|---------|
| `src/themes/border.css` | クラス定義を追加 |
| `amplify/agent/runtime/border.css` | 同じ内容を追加 |
| `amplify/agent/runtime/agent.py` | SYSTEM_PROMPT にクラス使用ガイド追加 |

**注意**: フロントエンド修正不要（CSSとプロンプトのみ）

**工数**: 小〜中（1-2日）

---

### #19 ツイートおすすめメッセージのストリーミング対応

**現状**: シェアボタン押下時、`Chat.tsx`で「無言でツール使用開始すること」という指示を送信しているため、LLMがテキストを出力せずツールを即実行。結果、ツイート推奨メッセージがストリーミング表示されない。

**推奨修正（2箇所、工数：小）**:

1. **Chat.tsxの「無言」指示を削除**
   ```typescript
   // 変更前
   await invoke('今回の体験をXでシェアするURLを提案してください（無言でツール使用開始すること）', ...)
   // 変更後
   await invoke('今回の体験をXでシェアするURLを提案してください', ...)
   ```

2. **システムプロンプトでシェア時の振る舞いを明記**（`agent.py` SYSTEM_PROMPT）
   ```markdown
   ## Xでシェア機能
   ユーザーが「シェアしたい」などと言った場合：
   1. まず体験をシェアすることを勧める短いメッセージを出力
   2. その後 generate_tweet_url ツールを使ってURLを生成
   ```

---

### #14 環境識別子リネーム

**変更内容**: main→prod、dev→sandbox

**変更が必要なファイル**:

| ファイル | 行 | 変更内容 |
|---------|-----|---------|
| `amplify/backend.ts` | 10 | `'dev'` → `'sandbox'` |
| `amplify/agent/resource.ts` | 58 | コメント更新（`marp_agent_dev` → `marp_agent_sandbox` 等） |
| `docs/KNOWLEDGE.md` | 923 | ランタイム名の例を更新 |

**注意**:
- `backend.ts:10` の `branchName` デフォルト値を変えるだけで、ランタイム名は自動追従
- AgentCore Runtimeのランタイム名が変わるため再作成が必要
- Gitブランチ名（main/kag）は変更不要

---

### #33 TavilyのExtractに対応

**概要**: Tavily APIのExtract機能を使えるようにしたい。

**Tavily Extract機能**:
- URLからコンテンツを抽出するAPI
- Web検索とは別のエンドポイント

**実装方法**:
- `agent.py`に`tavily_extract`ツールを追加
- システムプロンプトで使い方を説明

**工数**: 小（新規ツール追加）

---

### #26 Kimiに変えてみる 🔴重要

**概要**: Moonshot AIのKimi（中国製LLM）を試してみる。

**基本情報**:
- 公式: https://platform.moonshot.ai/
- 最新モデル: Kimi K2.5（2026年1月27日リリース）
- **OpenAI互換API**: `base_url` を変えるだけで移行可能

**APIエンドポイント**:
```
https://api.moonshot.ai/v1/chat/completions
```

**料金比較（Claude Sonnetの約1/10）**:
| モデル | 入力 | 出力 |
|--------|------|------|
| Kimi K2 | $0.60/M | $2.50/M |
| Claude Sonnet 4 | - | $10-15/M |

**Python実装例**:
```python
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("MOONSHOT_API_KEY"),
    base_url="https://api.moonshot.ai/v1",
)

response = client.chat.completions.create(
    model="kimi-k2.5-preview",
    messages=[{"role": "user", "content": "スライドを作成して"}],
    stream=True,
)
```

**Strands Agents統合**:
```python
from strands import Agent
from litellm import LiteLLMModel

agent = Agent(
    model=LiteLLMModel("moonshot/kimi-k2-thinking"),
    system_prompt="あなたはアシスタントです",
)
```

**⚠️ 制限事項・懸念点**:
| 項目 | 状況 |
|------|------|
| **日本語サポート** | 🔴 不明（公式に明示なし、要検証） |
| **速度** | 🟡 Claude Sonnetの約1/3（34 vs 91 tokens/sec） |
| **Strands統合** | 🔴 マルチターン会話でバグあり（[Issue #1150](https://github.com/strands-agents/sdk-python/issues/1150)） |
| **地域制限** | 🟢 日本からアクセス可能 |
| **レート制限** | 🟡 無料プラン: 3リクエスト/分 |

**結論**: コストは魅力的だが、**日本語サポート不明**と**Strands統合バグ**があるため、本番利用は慎重に。まずは小規模テストで日本語品質を検証することを推奨。

**工数**: 小〜中（2-3日、テスト含む）

---

### #6 Tavilyレートリミット枯渇通知

**現状**: `agent.py:47-51` でレートリミット検出済み（複数キーフォールバック対応）。全キー枯渇時のユーザー通知あり（`agent.py:54`）。管理者への通知がない。

**実装方法（SNS通知方式）**:

1. **CDKでSNSトピック作成**（`amplify/backend.ts` または `amplify/agent/resource.ts`）
   ```typescript
   const alarmTopic = new sns.Topic(stack, 'TavilyAlertTopic', {
     topicName: `marp-agent-tavily-alerts-${nameSuffix}`,
   });
   ```

2. **IAM権限追加**（`amplify/agent/resource.ts:84-93` に追加）
   ```typescript
   runtime.addToRolePolicy(new iam.PolicyStatement({
     actions: ['sns:Publish'],
     resources: [alarmTopic.topicArn],
   }));
   ```

3. **agent.pyで全キー枯渇時にSNS通知**（`agent.py:54` 付近）
   ```python
   sns_client = boto3.client('sns')
   sns_client.publish(
     TopicArn=os.environ['ALERT_TOPIC_ARN'],
     Subject='Tavily API Rate Limit Exhausted',
     Message='All Tavily API keys have been exhausted.',
   )
   ```

4. **SNSサブスクリプション設定**（メールアドレス登録）

---

### #7 エラー監視・通知

**現状**: OTEL Observability有効（`resource.ts:71-74`）。CloudWatch Alarm/SNS未設定。

**実装方法**:

1. **SNSトピック作成**（#6と共用可能）
   ```typescript
   const alarmTopic = new sns.Topic(stack, 'MarpAgentAlarmTopic', {
     topicName: `marp-agent-alarms-${nameSuffix}`,
   });
   ```

2. **CloudWatch Alarm追加**（`amplify/agent/resource.ts`）
   - AgentCore Runtimeは自動でCloudWatchメトリクスを出力
   - System Errors / User Errors / Throttling を監視

3. **メール通知設定**（SNSサブスクリプション）

**影響範囲**: 既存コード変更なし。CDKリソース追加のみ。

---

### #21 企業のカスタムテンプレをアップロードして使えるようにしたい 🔴重要

**概要**: 企業独自のMarpテーマ（CSS）をアップロードして使用できるようにする。

**現在のテーマ管理**:
- フロントエンド: `src/themes/border.css` を `?raw` でインポート → `marp.themeSet.add()`
- バックエンド: `amplify/agent/runtime/border.css` を Marp CLI `--theme` で指定

**推奨アーキテクチャ**:
```
企業 → アップロードUI → S3バケット保存 → DynamoDBメタデータ登録
                                    ↓
フロントエンド: S3 URLからCSS取得 → Marp Core登録
バックエンド: S3 URLからCSS取得 → Marp CLI --theme指定
```

**必要なインフラ（CDK）**:

```typescript
// S3バケット（テーマCSS保存）
const themeBucket = new s3.Bucket(stack, 'ThemeBucket', {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
});

// DynamoDBテーブル（テーマメタデータ）
const themeTable = new dynamodb.Table(stack, 'ThemeTable', {
  partitionKey: { name: 'organizationId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'themeName', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
});
```

**フロントエンド実装**:

```typescript
// src/hooks/useThemeStorage.ts
export async function uploadTheme(input: { file: File; themeName: string }) {
  // ファイルサイズチェック（100KB制限）
  if (input.file.size > 100 * 1024) throw new Error('ファイルサイズ超過');

  // CSSバリデーション
  const content = await input.file.text();
  if (!content.includes('@theme') && !content.includes('section')) {
    throw new Error('無効なMarpテーマ');
  }

  // Amplify Storage or Lambda経由でS3アップロード
}

// SlidePreview.tsx でS3テーマを動的登録
useEffect(() => {
  if (selectedThemeUrl?.startsWith('http')) {
    fetch(selectedThemeUrl).then(res => res.text()).then(css => {
      marp.themeSet.add(css);
    });
  }
}, [selectedThemeUrl]);
```

**バックエンド実装**（agent.py）:

```python
def generate_pdf(markdown: str, theme_url: str | None = None) -> bytes:
    if theme_url:
        # S3からテーマを取得
        response = requests.get(theme_url, timeout=5)
        theme_path = Path(tmpdir) / "theme.css"
        theme_path.write_bytes(response.content)
        cmd.extend(["--theme", str(theme_path)])
```

**セキュリティ考慮**:
- CSSバリデーション（`javascript:`, `expression(` 等を除外）
- ファイルサイズ制限: 100KB
- S3ブロックパブリックアクセス

**工数**: 中〜大（5-7日）

---

### #22 参考資料などをアップロードして使えるようにしたい

**概要**: PDF/Word/テキスト/画像をアップロードし、その内容に基づいてスライドを生成できるようにする。

**推奨アーキテクチャ**:
```
ユーザー → ファイルアップロードUI → Amplify Storage (S3)
                                    ↓
AgentCore Runtime (agent.py) → ファイル処理ツール
  ├─ PDF → pdfplumber でテキスト抽出
  ├─ Word → python-docx でテキスト抽出
  ├─ テキスト → そのまま使用
  └─ 画像 → Bedrock Multimodal LLM で認識
                                    ↓
LLMプロンプトに埋め込み → スライド生成
```

**対応ファイル形式**:
| 形式 | 処理方法 | ライブラリ | 難度 |
|------|---------|---------|------|
| PDF | テキスト抽出 | `pdfplumber` | 低 |
| Word (.docx) | テキスト抽出 | `python-docx` | 低 |
| テキスト | そのまま | - | 低 |
| 画像 | OCR | Bedrock Multimodal | 中 |

**バックエンド実装**（agent.py に追加）:

```python
import pdfplumber
from docx import Document

_reference_material: str = ""

@tool
def add_reference_material(file_path: str, file_type: str) -> str:
    """参考資料をアップロード・処理します"""
    global _reference_material

    if file_type == "pdf":
        with pdfplumber.open(file_path) as pdf:
            text = "\n".join([page.extract_text() for page in pdf.pages])
    elif file_type == "docx":
        doc = Document(file_path)
        text = "\n".join([p.text for p in doc.paragraphs])
    elif file_type == "txt":
        text = Path(file_path).read_text(encoding="utf-8")

    _reference_material = text[:5000]  # Token節約
    return f"参考資料を処理しました（{len(text)}文字）"
```

**requirements.txt に追加**:
```
pdfplumber
python-docx
```

**フロントエンド実装**（Chat.tsx に追加）:

```typescript
<input
  type="file"
  accept=".pdf,.docx,.txt,image/*"
  onChange={(e) => handleFileUpload(e.target.files?.[0])}
/>
```

**インフラ変更**（CDK）:
```typescript
const referenceBucket = new s3.Bucket(stack, 'ReferenceMaterialBucket', {
  encryption: s3.BucketEncryption.S3_MANAGED,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
});

runtime.addToRolePolicy(new iam.PolicyStatement({
  actions: ['s3:GetObject'],
  resources: [referenceBucket.arnForObjects('*')],
}));
```

**注意点**:
- Token コスト: テキスト抽出時に膨らみやすい → 5000文字制限推奨
- 日本語PDF: `pdfplumber` は画像ベースPDFに弱い → OCR推奨

**工数**: 中〜大（5-7日）

---

### #23 コードベースのリアーキテクチャ

**現状**: コードベース全体を調査した結果、肥大化したファイルの分割・重複解消・テスト追加が必要。

#### 1. フロントエンドの分割（優先度：高）

**Chat.tsx（460行）** — UIロジック・ストリーミング処理・ステータス管理が混在

- コンポーネント分割: `MessageList.tsx`, `ChatInput.tsx` 等
- カスタムフック抽出: `useStreamingChat.ts`, `useStatusMessages.ts` 等
- `setMessages` が40回以上呼ばれており、`useReducer` で状態管理を整理

**useAgentCore.ts（310行）** — チャットSSEとPDF生成が同居

- `useChatStream.ts`, `usePdfExport.ts` に分離
- `lib/sseClient.ts` にSSE共通処理を抽出（`invokeAgent()` と `exportPdf()` で類似ロジックが重複）

#### 2. バックエンドの分割（優先度：中）

**agent.py（328行）** — ツール定義・エージェント管理・PDF生成が1ファイル

- `tools/` ディレクトリにツール定義を分離（`web_search`, `output_slide`, `generate_tweet_url` 等）
- `utils/pdf.py` にPDF生成ロジックを分離
- 未使用の `extract_markdown()` 関数を削除

#### 3. その他の改善

| 項目 | 詳細 |
|------|------|
| border.css の重複解消 | `src/themes/` と `amplify/agent/runtime/` に同一ファイル。ビルド時コピー等で一元管理化 |
| セッション管理のメモリリーク対策 | `_agent_sessions` にTTL付きキャッシュ（`cachetools` 等）導入 |
| フロントエンドテスト追加 | Vitest設定済みだがテストファイルがゼロ。分割後にコンポーネントテスト追加 |

---

### #16 スライド編集（マークダウンエディタ）

**現状**:
- `App.tsx` で `markdown` stateを管理、`SlidePreview.tsx` に渡してプレビュー表示
- タブは `chat` / `preview` の2つ（`hidden` クラスで状態保持）
- マークダウン更新は Chat → AgentCore API → `onMarkdown` コールバック経由のみ

**推奨ライブラリ: @uiw/react-codemirror** ⭐

エディタライブラリ比較結果：

| ライブラリ | サイズ | YAML frontmatter | モバイル | 推奨度 |
|-----------|--------|-----------------|---------|-------|
| **@uiw/react-codemirror** | ~300KB | ✅ `yamlFrontmatter()` | ✅ 優秀 | ⭐推奨 |
| @uiw/react-md-editor | 4.6KB | ❌ 要カスタム | ✅ | 軽量用途 |
| @monaco-editor/react | 5-10MB | ❌ 要カスタム | ❌ 非対応 | 非推奨 |
| react-simplemde-editor | 数MB | ❌ | 不明 | ❌ メンテ停止 |

**選定理由**:
- Marp YAML frontmatter（`---` で囲まれた部分）のシンタックスハイライト対応
- モバイルサポートが優秀
- TypeScriptネイティブ対応
- ダークモード対応

**インストール**:
```bash
npm install @uiw/react-codemirror @codemirror/lang-markdown @codemirror/lang-yaml
```

**実装例**（SlidePreview.tsx に追加）:

```typescript
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { yamlFrontmatter } from '@codemirror/lang-yaml';

// サブタブ state
const [subTab, setSubTab] = useState<'preview' | 'editor'>('preview');

// エディタタブ
{subTab === 'editor' && (
  <CodeMirror
    value={markdown}
    height="100%"
    extensions={[
      markdown(),
      yamlFrontmatter()  // YAML frontmatterサポート
    ]}
    onChange={(value) => onMarkdownChange(value)}
    className="border rounded"
  />
)}
```

**ダークモード対応**:
```typescript
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

<CodeMirror
  theme={isDarkMode ? vscodeDark : 'light'}
  // ...
/>
```

**修正ファイル**:
| ファイル | 変更内容 |
|---------|---------|
| `src/components/SlidePreview.tsx` | サブタブUI + CodeMirrorエディタ追加 |
| `src/App.tsx` | `onMarkdownChange` コールバック追加 |
| `package.json` | `@uiw/react-codemirror` 等追加 |

**工数**: 大（3-5日）

---

### #9 スライド共有機能

**現状**:
- スライドはフロントエンドの React state（メモリ）のみ。永続化なし
- React Router未使用（タブUIのみ）
- Cognito Identity Pool で未認証アクセス対応可能

**実装方法**:

1. **インフラ追加**（CDK）
   - DynamoDB: スライドメタデータ（userId, slideId, shareId, title, s3Key, isPublic, createdAt）
   - S3: マークダウン本体を保存
   - Lambda（または AgentCore に追加ツール）: 保存・取得API

2. **API追加**
   - `POST /slides` - スライド保存、shareId発行
   - `GET /slides/{shareId}` - 共有スライド取得（認証不要）

3. **フロントエンド**
   - `SlidePreview.tsx` のヘッダーに「共有リンクをコピー」ボタン追加
   - URLパラメータ（`?id=xxxx`）で共有スライド表示ページ作成
   - React Router導入、または `URLSearchParams` で実装
