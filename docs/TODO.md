# パワポ作るマン TODO

> **注意**: TODO管理は **mainブランチのみ** で行います。kagブランチのTODOファイルは参照用のリンクのみです。

## タスク管理

反映先の凡例: ✅ 完了 / 🔧 作業中 / ⬜ 未着手 / ➖ 対象外

| # | タスク | 工数 | 状態 | main 実装 | main docs | kag 実装 | kag docs |
|---|--------|------|------|-----------|-----------|----------|----------|
| #13 | PDFダウンロード中の表示改善 | 小 | ✅ 完了 | ✅ | ⬜ | ⬜ | ⬜ |
| #11 | プロンプトキャッシュ適用 | 小 | ✅ 完了 | ✅ | ⬜ | ⬜ | ⬜ |
| #14 | 環境識別子リネーム（main→prod, dev→sandbox） | 小 | ⬜ 未着手 | ⬜ | ⬜ | ⬜ | ⬜ |
| #6 | Tavilyレートリミット枯渇通知 | 中 | ⬜ 未着手 | ⬜ | ⬜ | ⬜ | ⬜ |
| #2 | 追加指示の文脈理解改善 | 中 | ⬜ 未着手 | ⬜ | ⬜ | ⬜ | ⬜ |
| #7 | エラー監視・通知 | 中 | ⬜ 未着手 | ⬜ | ⬜ | ⬜ | ⬜ |
| #10 | テーマ選択 | 中 | ⬜ 未着手 | ⬜ | ⬜ | ➖ | ➖ |
| #12 | PowerPoint形式出力 | 中 | ⬜ 未着手 | ⬜ | ⬜ | ⬜ | ⬜ |
| #9 | スライド共有機能 | 大 | ⬜ 未着手 | ⬜ | ⬜ | ➖ | ➖ |
| #16 | スライド編集（マークダウンエディタ） | 大 | ⬜ 未着手 | ⬜ | ⬜ | ⬜ | ⬜ |

---

## タスク詳細

### #13 PDFダウンロード中の表示改善

**修正箇所**: `src/components/SlidePreview.tsx:89`

```tsx
// 現在
{isDownloading ? '生成中...' : 'PDFダウンロード'}

// 変更後
{isDownloading ? 'ダウンロード中...' : 'PDFダウンロード'}
```

**関連フロー**:
- `App.tsx:105` で `setIsDownloading(true)` → ボタン表示変更
- `App.tsx:107` で `exportPdf()` → AgentCore APIでPDF生成
- `App.tsx:140` で `setIsDownloading(false)` → ボタン表示復帰

---

### #11 プロンプトキャッシュ適用

**現状**: `agent.py:195-197` で文字列モデルID指定。キャッシュ未設定。

**実装方法**:

```python
from strands.models import BedrockModel

bedrock_model = BedrockModel(
    model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    cache_prompt="default",   # System promptキャッシング
    cache_tools="default",    # Tool定義キャッシング
)

agent = Agent(
    model=bedrock_model,
    system_prompt=SYSTEM_PROMPT,
    tools=[web_search, output_slide, generate_tweet_url],
)
```

**キャッシュ対象**:
- System prompt（約1,800行 → 1,024トークン以上で条件クリア）
- Tool定義（3個）
- TTL: デフォルト5分

**依存パッケージ**: 追加不要（`strands-agents>=1.23.0` で対応済み）

**効果**: 同一セッション内の2回目以降の呼び出しでSystem prompt + Tool定義のトークンがキャッシュから読み込まれ、コスト削減・レイテンシ改善。

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

### #2 追加指示の文脈理解改善

**現状の仕組み**:
- `agent.py:186-211`: セッションIDごとにAgentインスタンスをメモリ管理 → Strands Agentsの会話履歴を自動保持
- `agent.py:281-282`: 追加指示時に現在のマークダウン全文をプロンプトに埋め込み
  ```python
  user_message = f"現在のスライド:\n```markdown\n{current_markdown}\n```\n\nユーザーの指示: {user_message}"
  ```

**考えられる原因と対策**:

1. **システムプロンプト改善**（`agent.py` SYSTEM_PROMPT に追加）
   ```
   ## 重要: 会話の文脈
   - ユーザーの追加指示は、直前のスライドに対する修正依頼です
   - 「もっと」「さらに」「他に」などの言葉は、前回の内容を維持しつつ追加することを意味します
   - 修正時は既存スライドの構成を保ちつつ、指示された部分のみ変更してください
   ```

2. **マークダウンが長すぎる問題**: 長いスライドは要約版をプロンプトに含めるか、スライド枚数と主要トピックのみ伝える

3. **会話履歴のサマリー**: Strands Agents の `memory` 機能で古い会話を要約

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

### #10 テーマ選択

**現状**:
- テーマは `border` 固定（フロント: `src/themes/border.css`、バックエンド: `amplify/agent/runtime/border.css`）
- `SlidePreview.tsx:28-30` で `marp.themeSet.add(borderTheme)` としてハードコード
- `agent.py:109-115` のシステムプロンプトで `theme: border` を固定指示
- PDF生成時も `border.css` を固定指定（`agent.py:224-255`）

**実装方法**:

1. **フロントエンド**
   - `App.tsx` に `selectedTheme` state追加
   - `src/themes/` に複数テーマCSS配置（default, gaia等）
   - `SlidePreview.tsx` で全テーマを `themeSet.add()` で登録
   - ヘッダーにテーマ選択UIを追加

2. **バックエンド**
   - `amplify/agent/runtime/` に複数テーマCSS配置
   - `generate_pdf()` でマークダウンの `theme:` フィールドから動的にテーマファイルを選択
   - システムプロンプトを更新（利用可能テーマリストを提示）

3. **データフロー**: フロントでテーマ選択 → マークダウンのフロントマター `theme:` を変更 → プレビュー/PDF両方に反映

---

### #12 PowerPoint形式出力

**Marp CLIはPPTX出力に対応済み**（`--pptx` フラグ）。

**実装方法**:

1. **バックエンド**（`agent.py`）
   - `generate_pdf()` を汎用化、または `generate_pptx()` を追加
   ```python
   cmd = ["marp", str(md_path), "--pptx", "--allow-local-files", "-o", str(pptx_path)]
   ```
   - `action == "export_pptx"` を追加
   - MIMEタイプ: `application/vnd.openxmlformats-officedocument.presentationml.presentation`

2. **フロントエンド**
   - `useAgentCore.ts` に `exportPptx()` 関数追加（`exportPdf()` とほぼ同じ）
   - `SlidePreview.tsx` にPPTXダウンロードボタン追加（またはドロップダウンで形式選択）

3. **Dockerfile変更不要**（Marp CLIは既にインストール済み）

**注意**: PPTX出力はプレレンダリング画像ベース。テキスト編集不可。編集可能版（`--pptx-editable`）は実験的で不安定。

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

---

### #16 スライド編集（マークダウンエディタ）

**現状**:
- `App.tsx` で `markdown` stateを管理、`SlidePreview.tsx` に渡してプレビュー表示
- タブは `chat` / `preview` の2つ（`hidden` クラスで状態保持）
- マークダウン更新は Chat → AgentCore API → `onMarkdown` コールバック経由のみ

**実装方法**:

1. **UIパターン（推奨: SlidePreview内にタブ追加）**
   - `SlidePreview.tsx` 内に「プレビュー」「エディタ」サブタブを追加
   - エディタタブ: textarea または CodeMirror 等のエディタコンポーネント
   - プレビュータブ: 現在のスライドグリッド表示

2. **状態管理**
   - `App.tsx` の `markdown` / `setMarkdown` を双方向バインド
   - エディタでの変更 → `setMarkdown` → プレビュー即時反映

3. **修正ファイル**:
   | ファイル | 変更内容 |
   |---------|---------|
   | `src/components/SlidePreview.tsx` | サブタブUI + エディタコンポーネント追加 |
   | `src/App.tsx` | エディタ用の `onMarkdownChange` コールバック追加 |
   | `src/index.css` | エディタ用スタイル追加 |
   | `package.json` | エディタライブラリ追加（CodeMirror等、任意） |
