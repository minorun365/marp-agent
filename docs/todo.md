# パワポ作るマン TODO

> **注意**: TODO管理は **mainブランチのみ** で行います。kagブランチのTODOファイルは参照用のリンクのみです。

## タスク管理

反映先の凡例: ✅ 完了 / 🔧 作業中 / ⬜ 未着手 / ➖ 対象外
ラベル: 🔴 重要
並び順: ①重要度が高い順 → ②実装が簡単な順（工数が小さい順）

| # | タスク | 工数 | 状態 | ラベル | main 実装 | main docs | kag 実装 | kag docs |
|---|--------|------|------|--------|-----------|-----------|----------|----------|
| #39 | 画面のどこかに最後のリリースの情報を表示したい | 3h | ⬜ 未着手 | 🔴 重要 | ⬜ | ⬜ | ➖ | ➖ |
| #22 | 参考資料などをアップロードして使えるようにしたい | 5-7日 | 🔧 作業中 | 🔴 重要 | 🔧 Phase1完了 | ⬜ | ➖ | ➖ |
| #71 | 公開ボタン枠の左側に黒い縦線が表示されるバグ修正 | 30分 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #28 | 表のセル内パディング調整 | 30分 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #19 | ツイートおすすめメッセージのストリーミング対応 | 30分 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #14 | 環境識別子リネーム（dev→sandbox） | 30分 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #68 | スライド作成後の出力メッセージをシンプルにしたい | 30分 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #69 | 検索・フェッチ並走時のステータス表示がおかしい | 1h | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #65 | Tavily APIキーをラベリング・整理したい | 1h | ⬜ 未着手 | | ⬜ | ➖ | ➖ | ➖ |
| #72 | output_slideの再生成コスト削減（fix_slideツール追加） | 1-2h | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #61 | 入力フォームを広げて改行込みで入力できるようにしたい | 1-2h | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #32 | deploy-time-build: Repositoryを自前で渡す方式に修正 | 1.5h | ⬜ 未着手 | | ⬜ | ➖ | ➖ | ➖ |
| #45 | Langfuseでトレースしたい | 2.5h | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #70 | フィードバックボタンをつけたい | 2-3h | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #66 | SlackなどでもOGPを出したい | 3h | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #64 | スライド公開URLを独自ドメインにしたい | 3h | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #63 | テンプレの画像をCSSから分離する | 3h | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #6 | Tavilyレートリミット枯渇通知 | 3-4h | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #7 | エラー監視・通知 | 3-4h | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #48 | GPTを実装してみる | 2日 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #16 | スライド編集（マークダウンエディタ） | 3-5日 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #62 | KDDIテンプレ版を作る | 3-5日 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #60 | リピーター率などを分析したい | 3-5日 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #21 | 企業のカスタムテンプレをアップロードして使えるようにしたい | 5-7日 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |

---

## タスク詳細

> **並び順**: 上記タスク管理表と同じ順番（①重要度が高い順 → ②実装が簡単な順）で記載しています。

### #39 画面のどこかに最後のリリースの情報を表示したい

**概要**: 画面にバージョン情報を表示したい。

#### 実現案の比較

| 案 | 工数 | 常に最新 | クライアント負荷 | 推奨度 |
|----|------|---------|----------------|--------|
| **案A: クライアントサイドAPI** | 3h | ✅ | 1リクエスト | ⭐推奨 |
| 案B: ビルド時package.json埋め込み | 1h | ❌ | 0 | △ 手動同期 |
| 案C: ビルド時API取得 | 2.5h | ✅ | 0 | △ CI依存 |

#### 推奨: 案A（クライアントサイドでGitHub API取得）

```typescript
// hooks/useLatestRelease.ts
export function useLatestRelease(owner: string, repo: string) {
  const [release, setRelease] = useState<Release | null>(null);

  useEffect(() => {
    // キャッシュチェック（1時間有効）
    const cached = localStorage.getItem(`github_release_${owner}_${repo}`);
    if (cached && Date.now() - JSON.parse(cached).timestamp < 3600000) {
      setRelease(JSON.parse(cached).data);
      return;
    }

    fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`)
      .then(res => res.json())
      .then(data => {
        localStorage.setItem(`github_release_${owner}_${repo}`, JSON.stringify({
          data, timestamp: Date.now()
        }));
        setRelease(data);
      });
  }, [owner, repo]);

  return release;
}

// 使用例
function VersionBadge() {
  const release = useLatestRelease('minorun365', 'marp-agent');
  if (!release) return null;
  return <span>Latest: {release.tag_name}</span>;
}
```

**レート制限**: 認証なし60回/時間（キャッシュで対応可能）

**工数**: 3時間

---

### #22 参考資料などをアップロードして使えるようにしたい

**概要**: PDF/Word/テキスト/画像をアップロードし、その内容に基づいてスライドを生成。

**対応ファイル形式**:
| 形式 | 処理方法 | ライブラリ |
|------|---------|---------|
| PDF | テキスト抽出 | `pdfplumber` |
| Word (.docx) | テキスト抽出 | `python-docx` |
| テキスト | そのまま | - |
| 画像 | OCR | Bedrock Multimodal |

**工数**: 5-7日

---

### #71 公開ボタン枠の左側に黒い縦線が表示されるバグ修正

**概要**: URLを公開する際に「公開中」ボタンの枠の左側に黒い縦線が表示される表示バグを修正する。

**修正方法**: ボタンコンポーネントのCSS（border/outline）を調査し、不要な左ボーダーを除去する。

**工数**: 30分

---

### #28 表のセル内パディング調整

**概要**: 表の中の文字と表の枠の間のパディングが少ないため、見た目のバランスが悪い。

**修正ファイル**: `src/themes/*.css` + `amplify/agent/runtime/*.css`

**実装コード（各テーマCSSの末尾に追加）**:
```css
/* || TABLE: セル内パディング調整 */
section table th,
section table td {
  padding: 0.6em 1.2em;
}

section table th {
  background-color: var(--bg-color-alt);
  font-weight: 700;
}

section table tr:nth-child(even) td {
  background-color: rgba(0, 0, 0, 0.03);
}
```

**工数**: 30分

---

### #19 ツイートおすすめメッセージのストリーミング対応

**現状**: シェアボタン押下時、「無言でツール使用開始すること」という指示のため、ツイート推奨メッセージがストリーミング表示されない。

**修正（2箇所）**:

1. **Chat.tsxの「無言」指示を削除**
   ```typescript
   // 変更前
   await invoke('今回の体験をXでシェアするURLを提案してください（無言でツール使用開始すること）', ...)
   // 変更後
   await invoke('今回の体験をXでシェアするURLを提案してください', ...)
   ```

2. **システムプロンプトでシェア時の振る舞いを明記**
   ```markdown
   ## Xでシェア機能
   ユーザーが「シェアしたい」などと言った場合：
   1. まず体験をシェアすることを勧める短いメッセージを出力
   2. その後 generate_tweet_url ツールを使ってURLを生成
   ```

**工数**: 30分

---

### #14 環境識別子リネーム

**変更内容**: dev→sandbox

**変更が必要なファイル**:

| ファイル | 変更内容 |
|---------|---------|
| `amplify/backend.ts:10` | `'dev'` → `'sandbox'` |
| `amplify/agent/resource.ts:58` | コメント更新 |
| `docs/KNOWLEDGE.md` | ランタイム名の例を更新 |

**注意**: AgentCore Runtimeのランタイム名が変わるため再作成が必要

**工数**: 30分

---

### #68 スライド作成後の出力メッセージをシンプルにしたい

**概要**: スライド作成後にエージェントが出力するメッセージが冗長なので、シンプルにしたい。

**修正方法**: システムプロンプトでスライド出力後のメッセージ形式を指定する。

**工数**: 30分

---

### #69 検索・フェッチ並走時のステータス表示がおかしい

**概要**: web_searchとhttp_requestが並走した際にステータスメッセージの表示がおかしくなる。

**修正方法**: ツール並走時のステータス表示ロジックを調査し、複数ツール実行時の表示を正しくハンドリングする。

**工数**: 1時間

---

### #65 Tavily APIキーをラベリング・整理したい

**概要**: 複数のTavily APIキーを管理しやすいようにラベリング・整理する。

**修正方法**: 環境変数やキー管理の仕組みを整理し、どのキーがどの用途かを明確にする。

**工数**: 1時間

---

### #72 output_slideの再生成コスト削減（fix_slideツール追加）

**概要**: スライドの文字あふれ修正時、Markdown全文を再生成するのではなく、違反スライドだけ差分修正する `fix_slide` ツールを追加してコスト削減する。

**現状の問題**:
- overflow検出時、エージェントがMarkdown全文（2,000〜3,000文字）を毎回再生成
- 最大2回リトライ → 1セッションあたり+$0.03〜0.05のコスト

**実装内容**:
1. `output_slide`: 違反があっても一旦Markdownを保存し、違反スライドの現在の内容をエラーに含める
2. `fix_slide`: 新ツール。指定スライドだけ差し替えて再チェック
3. `config.py`: システムプロンプトにfix_slideの使い方を追記

**期待効果**:
- 再生成時のLLM出力: ~1,500トークン → ~150トークン（1/10）
- セッション単価: -$0.03〜0.04

**参考ファイル**: `amplify/agent/runtime/tools/output_slide.py`, `amplify/agent/runtime/config.py`

**工数**: 1-2時間

---

### #61 入力フォームを広げて改行込みで入力できるようにしたい

**概要**: 現在の入力フォームが1行のみで狭いため、改行込みでたくさん入力できるようにしたい。

**修正方法**: `<input>` を `<textarea>` に変更し、自動リサイズ機能を追加する。

**工数**: 1-2時間

---

### #32 deploy-time-build: Repositoryを自前で渡す方式に修正

**概要**: 現在の型アサーション `(containerImageBuild.repository as ecr.Repository)` を排除し、型安全にする。

**現状の問題**:
```typescript
// 型安全性が低い
(containerImageBuild.repository as ecr.Repository).addLifecycleRule(...)
```

#### 実現案の比較

| 案 | 工数 | 効果 | 推奨度 |
|----|------|------|--------|
| **案A: シンプル版** | 30分 | 型安全化 | ⭐推奨 |
| 案B: 分割版（repository.ts新規作成） | 1h | 将来拡張性 | 後で |

#### 推奨: 案A（シンプル版）

```typescript
// amplify/agent/resource.ts
if (!isSandbox) {
  // ECRリポジトリを自前で作成
  const repository = new ecr.Repository(stack, 'MarpAgentRepository', {
    repositoryName: `marp-agent-${nameSuffix}`,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    emptyOnDelete: true,
    imageScanOnPush: true,
  });

  // Lifecycle Policy を設定（型安全）
  repository.addLifecycleRule({
    description: 'Keep last 5 images',
    maxImageCount: 5,
    rulePriority: 1,
  });

  // ContainerImageBuild で repository を指定
  containerImageBuild = new ContainerImageBuild(stack, 'MarpAgentImageBuild', {
    directory: path.join(__dirname, 'runtime'),
    platform: Platform.LINUX_ARM64,
    repository,  // ← 自前のリポジトリを指定
  });
}
```

**工数**: 1.5時間（実装30分 + テスト1時間）

---

### #45 Langfuseでトレースしたい

**概要**: Langfuseを使ってAIエージェントの実行をトレースしたい。

**現状**: Strands AgentsのOTELトレースは有効だが、Langfuseとの連携はない。

**推奨方法**: OpenTelemetry経由（最小限の変更）

**実装手順**:

1. **環境変数を追加**（Amplify）
   ```
   LANGFUSE_PUBLIC_KEY=pk-lf-xxx
   LANGFUSE_SECRET_KEY=sk-lf-xxx
   LANGFUSE_BASE_URL=https://cloud.langfuse.com
   ```

2. **resource.ts修正**（84-89行目）
   ```typescript
   environmentVariables: {
     AGENT_OBSERVABILITY_ENABLED: 'true',
     OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
     OTEL_EXPORTER_OTLP_ENDPOINT: process.env.LANGFUSE_BASE_URL
       ? `${process.env.LANGFUSE_BASE_URL}/api/public/otel`
       : '',
     OTEL_EXPORTER_OTLP_HEADERS: process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY
       ? `Authorization=Basic ${Buffer.from(`${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`).toString('base64')}`
       : '',
   }
   ```

3. **agent.py修正**
   ```python
   from strands.telemetry import StrandsTelemetry

   _telemetry_enabled = os.environ.get('AGENT_OBSERVABILITY_ENABLED', '').lower() == 'true'
   if _telemetry_enabled:
       strands_telemetry = StrandsTelemetry().setup_otlp_exporter()
   ```

**注意**: AWS X-RayとLangfuseは併用不可

**参照リンク**:
- [Langfuse × Strands Agents](https://langfuse.com/integrations/frameworks/strands-agents)
- [Amazon Bedrock AgentCore Observability with Langfuse](https://aws.amazon.com/blogs/machine-learning/amazon-bedrock-agentcore-observability-with-langfuse/)

**工数**: 2.5時間

---

### #70 フィードバックボタンをつけたい

**概要**: ユーザーからのフィードバックを受け付けるボタンをUIに追加したい。

**修正方法**: フィードバックボタンコンポーネントを作成し、チャットUIまたはヘッダーに配置する。フィードバック送信先（GitHub Issues、フォーム等）を決めて実装する。

**工数**: 2-3時間

---

### #66 SlackなどでもOGPを出したい

**概要**: 共有スライドのURLをSlackなどに貼った際にOGPプレビュー（タイトル・サムネイル等）が表示されるようにしたい。

**修正方法**: 共有ページにOGPメタタグ（og:title, og:image, og:description等）を追加する。

**工数**: 3時間

---

### #64 スライド公開URLを独自ドメインにしたい

**概要**: 現在CloudFrontのデフォルトドメインで公開しているスライドURLを、独自ドメインに変更したい。

**修正方法**: Route 53でサブドメインを設定し、CloudFrontディストリビューションに紐付ける。

**工数**: 3時間

---

### #63 テンプレの画像をCSSから分離する

**概要**: 現在Marpテーマ内でbase64エンコードされている画像をCSSから分離し、外部ファイルとして管理する。

**修正方法**: 画像をS3等にホストし、CSSからURLで参照する形に変更する。

**工数**: 3時間

---

### #6 Tavilyレートリミット枯渇通知

**現状**: 全キー枯渇時のユーザー通知あり。管理者への通知がない。

**実装方法（SNS通知方式）**:

1. CDKでSNSトピック作成
2. IAM権限追加（sns:Publish）
3. agent.pyで全キー枯渇時にSNS通知
4. SNSサブスクリプション設定（メールアドレス登録）

**工数**: 3-4時間

---

### #7 エラー監視・通知

**現状**: OTEL Observability有効。CloudWatch Alarm/SNS未設定。

**実装方法**:
1. SNSトピック作成（#6と共用可能）
2. CloudWatch Alarm追加（System Errors / User Errors / Throttling）
3. メール通知設定

**工数**: 3-4時間

---

### #48 GPTを実装してみる

**概要**: OpenAI GPTモデルを選択肢として追加したい。

**Strands AgentsのOpenAIサポート**: ✅ 完全サポート

**インストール**:
```bash
pip install 'strands-agents[openai]'
```

**実装例**:
```python
from strands.models.openai import OpenAIModel

openai_model = OpenAIModel(
    client_args={"api_key": openai_api_key},
    model_id="gpt-4o",
    params={
        "max_tokens": 4000,
        "temperature": 0.7,
    }
)

agent = Agent(model=openai_model, tools=[...])
```

**追加作業**:
- Secrets ManagerにOpenAI APIキー登録
- Lambda実行ロールにSecrets Manager読み取り権限追加
- フロントエンドにモデル選択オプション追加

**参照**: [Strands Agents - OpenAI Provider](https://strandsagents.com/latest/documentation/docs/user-guide/concepts/model-providers/openai/)

**工数**: 2日（最小構成1日 + UI対応1日）

---

### #16 スライド編集（マークダウンエディタ）

**推奨ライブラリ**: @uiw/react-codemirror（YAML frontmatter対応、モバイル優秀）

```bash
npm install @uiw/react-codemirror @codemirror/lang-markdown @codemirror/lang-yaml
```

**工数**: 3-5日

---

### #62 KDDIテンプレ版を作る

**概要**: KDDIブランドのスライドテンプレートを新規作成する。

**修正方法**: 既存テンプレートを参考にKDDI用のMarpテーマCSS・画像を作成し、テンプレート選択UIに追加する。

**工数**: 3-5日

---

### #60 リピーター率などを分析したい

**概要**: ユーザーの利用状況（リピーター率、利用頻度、アクティブユーザー数など）を分析できるようにしたい。

**修正方法**: Cognitoのユーザーデータやアクセスログを活用して分析ダッシュボードを構築する。

**工数**: 3-5日

---

### #21 企業のカスタムテンプレをアップロードして使えるようにしたい

**概要**: 企業独自のMarpテーマ（CSS）をアップロードして使用できるようにする。

**推奨アーキテクチャ**:
```
企業 → アップロードUI → S3バケット保存 → DynamoDBメタデータ登録
                                    ↓
フロントエンド: S3 URLからCSS取得 → Marp Core登録
バックエンド: S3 URLからCSS取得 → Marp CLI --theme指定
```

**必要なインフラ**: S3バケット + DynamoDBテーブル

**工数**: 5-7日
