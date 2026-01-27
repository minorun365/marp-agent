# パワポ作るマン TODO

> **注意**: TODO管理は **mainブランチのみ** で行います。kagブランチのTODOファイルは参照用のリンクのみです。

## タスク管理

反映先の凡例: ✅ 完了 / 🔧 作業中 / ⬜ 未着手 / ➖ 対象外
ラベル: 🔴 重要

| # | タスク | 工数 | 状態 | ラベル | main 実装 | main docs | kag 実装 | kag docs |
|---|--------|------|------|--------|-----------|-----------|----------|----------|
| #17 | スライド生成直後の返答メッセージを簡素にしたい | 小 | ⬜ 未着手 | 🔴 重要 | ⬜ | ⬜ | ⬜ | ⬜ |
| #20 | PowerPoint生成中の待ちストレス軽減 | 小〜中 | ⬜ 未着手 | 🔴 重要 | ⬜ | ⬜ | ⬜ | ⬜ |
| #19 | ツイートおすすめメッセージのストリーミング対応 | 小 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #18 | 検索クエリのリアルタイム表示 | 小〜中 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #14 | 環境識別子リネーム（main→prod, dev→sandbox） | 小 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #2 | 追加指示の文脈理解改善 | 中 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #6 | Tavilyレートリミット枯渇通知 | 中 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #7 | エラー監視・通知 | 中 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #10 | テーマ選択 | 中 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #12 | PowerPoint形式出力 | 中 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #16 | スライド編集（マークダウンエディタ） | 大 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #9 | スライド共有機能 | 大 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |

---

## タスク詳細

### #17 スライド生成直後の返答メッセージを簡素にしたい 🔴重要

**現状**: `output_slide`ツール実行後、LLMが「スライドが完成しました！以下の構成で〜」のような長い説明テキストを自動生成してしまう。ステータス表示+プレビューで完了は十分伝わるため不要。

**推奨修正（2箇所、工数：小）**:

1. **システムプロンプトに抑制指示を追加**（`agent.py` SYSTEM_PROMPT内）
   ```markdown
   ## スライド出力後の返答について
   output_slide ツールでスライドを出力した直後は、以下の場合を除きテキストメッセージを生成しないでください：
   - Web検索などのツール実行がエラーで失敗した
   - ユーザーが追加で質問や修正指示をしている
   「スライドが完成しました」「以下の構成で～」などのサマリーメッセージは不要です。
   ```

2. **output_slideの戻り値を簡素化**（`agent.py:97`）
   ```python
   # 変更前
   return "スライドを出力しました。"
   # 変更後
   return "OK"
   ```

---

### #20 PowerPoint生成中の待ちストレス軽減 🔴重要

**現状**: 生成中は「スライドを作成中...（20秒ほどかかります）」のスピナーのみ。

**推奨修正（段階的に実施）**:

#### Phase 1: 豆知識ローテーション（フロントエンドのみ、工数：小）
- ステータスメッセージ下に3〜5秒ごとにTips表示をローテーション
- `Chat.tsx`の`onToolUse`イベント内で`setInterval`で実装
- 例:「💡 Marpは Markdown + CSS でスライドを作成するツールです」

#### Phase 2: スケルトン画面（フロントエンドのみ、工数：小）
- マークダウン受信直後、レンダリング完了前にグレースケールのプレースホルダーを表示
- `SlidePreview.tsx`でスケルトンローダー表示 → 実スライドにフェードイン

#### Phase 3: 段階的プログレスステータス（バックエンド+フロント、工数：中）
- `agent.py`で処理段階ごとにstatusイベントを送信
- 「構文チェック中...」→「Marpでレンダリング中...」→「最終調整中...」

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

### #18 検索クエリのリアルタイム表示

**現状**: `tool_use`イベントでツール名（`web_search`）のみ送信。検索クエリ内容が不明。

**推奨修正（3ファイル、工数：小〜中）**:

1. **バックエンド**（`agent.py` invokeのtool_useイベント処理）
   - `current_tool_use`イベントの`args`からクエリを抽出し、`query`フィールドを付加して送信
   ```python
   if tool_name == "web_search" and "query" in tool_args:
       yield {"type": "tool_use", "data": tool_name, "query": tool_args["query"]}
   ```

2. **フロントエンド**（`useAgentCore.ts`）
   - `AgentCoreCallbacks`に`onSearchStart?: (query: string) => void`を追加
   - `handleEvent`でqueryフィールドを検出して呼び出し

3. **フロントエンド**（`Chat.tsx`）
   - ステータス表示を `Web検索中: "AWS Lambda 最新機能"` のようにクエリ付きに更新

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

### #2 追加指示の文脈理解改善

**現状の仕組み**:
- `agent.py:186-211`: セッションIDごとにAgentインスタンスをメモリ管理 → Strands Agentsの会話履歴を自動保持
- `agent.py:281-282`: 追加指示時に現在のマークダウン全文をプロンプトに埋め込み

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
