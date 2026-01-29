# パワポ作るマン TODO

> **注意**: TODO管理は **mainブランチのみ** で行います。kagブランチのTODOファイルは参照用のリンクのみです。

## タスク管理

反映先の凡例: ✅ 完了 / 🔧 作業中 / ⬜ 未着手 / ➖ 対象外
ラベル: 🔴 重要
並び順: ①重要度が高い順 → ②実装が簡単な順（工数が小さい順）

| # | タスク | 工数 | 状態 | ラベル | main 実装 | main docs | kag 実装 | kag docs |
|---|--------|------|------|--------|-----------|-----------|----------|----------|
| #20 | PowerPoint生成中の待ちストレス軽減 | 小〜中 | 🔧 作業中 | 🔴 重要 | 🔧 | ✅ | ⬜ | ⬜ |
| #18 | 検索クエリのリアルタイム表示 | 小〜中 | ✅ 完了 | 🔴 重要 | ✅ | ✅ | ⬜ | ⬜ |
| #10 | テーマ選択 | 中 | ⬜ 未着手 | 🔴 重要 | ⬜ | ⬜ | ➖ | ➖ |
| #24 | editable-pptx形式でダウンロードできるようにしたい | 中 | ⬜ 未着手 | 🔴 重要 | ⬜ | ⬜ | ⬜ | ⬜ |
| #25 | == は使わないようにする（=== に統一） | 小 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #27 | 既存テーマにデザインバリエーション追加（タイトル・仕切りなど） | 小〜中 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #19 | ツイートおすすめメッセージのストリーミング対応 | 小 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #14 | 環境識別子リネーム（main→prod, dev→sandbox） | 小 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #26 | Kimiに変えてみる | 小〜中 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #2 | 追加指示の文脈理解改善 | 中 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #6 | Tavilyレートリミット枯渇通知 | 中 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #7 | エラー監視・通知 | 中 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #21 | 企業のカスタムテンプレをアップロードして使えるようにしたい | 中〜大 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #22 | 参考資料などをアップロードして使えるようにしたい | 中〜大 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #23 | コードベースのリアーキテクチャ | 中〜大 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #16 | スライド編集（マークダウンエディタ） | 大 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #9 | スライド共有機能 | 大 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |

---

## タスク詳細

### #20 PowerPoint生成中の待ちストレス軽減 🔴重要

**ステータス**: 🔧 Phase 1 完了、Phase 2以降は未着手

**現状**: ~~生成中は「スライドを作成中...」のスピナーのみ~~ → Phase 1実装済み！

**関連コード箇所**:
| ファイル | 処理内容 | 行番号 |
|---------|---------|--------|
| `Chat.tsx` | TIPS配列定義 | 15-25 |
| `Chat.tsx` | onToolUse イベントハンドラ | 317-377 |
| `Chat.tsx` | ステータスメッセージ表示（Tips含む） | 497-524 |

**推奨修正（段階的に実施）**:

#### Phase 1: 豆知識ローテーション（フロントエンドのみ、工数：小）✅ 完了

**実装場所**: `Chat.tsx:262-280` の `onToolUse('output_slide')` 内

1. **豆知識配列を定義**
   ```typescript
   const TIPS = [
     '💡 Marpは Markdown + CSS でスライドを作成するツールです',
     '💡 #パワポ作るマン は AWS Amplifyでフルサーバーレス構築されています',
     '💡 スライドはAIアシスタントで自由に修正・編集できます',
     '💡 PDFだけでなく、PowerPoint形式でのダウンロードも検討中です',
     '💡 このアプリはXでシェアすることができます'
   ];
   ```

2. **Message インターフェース拡張**（`Chat.tsx:5-11`）
   ```typescript
   interface Message {
     // ... 既存
     tipIndex?: number;  // 豆知識ローテーション用
   }
   ```

3. **`onToolUse` 内で `setInterval` でローテーション**
   - 3秒ごとに `tipIndex` をインクリメント
   - `useEffect` でクリーンアップ必須（メモリリーク防止）

**注意点**:
- React StrictMode で2重実行されるため、既存タイマーのクリアが必要
- `setMessages` はイミュータブルに更新すること

#### Phase 2: スケルトン画面（フロントエンドのみ、工数：小）

**実装場所**: `SlidePreview.tsx:24-55` の useMemo 内

```tsx
function SkeletonSlide() {
  return (
    <div className="border rounded-lg overflow-hidden shadow-sm bg-white">
      <div className="bg-gray-100 px-3 py-1 text-xs text-gray-600 border-b">
        スライド 1
      </div>
      <div className="bg-gray-50 p-1 overflow-hidden">
        <div className="w-full h-48 bg-gradient-to-r from-gray-200 to-gray-100 animate-pulse rounded" />
      </div>
    </div>
  );
}
```

- `onMarkdown` 受信時に一時的にスケルトン表示
- Tailwind `transition` でフェードインアニメーション

#### Phase 3: 段階的プログレスステータス（バックエンド+フロント、工数：中）

**バックエンド** (`agent.py:318-326`):
```python
elif "current_tool_use" in event:
    tool_info = event["current_tool_use"]
    tool_name = tool_info.get("name", "unknown")
    if tool_name == "output_slide":
        yield {"type": "status", "data": "Marpでレンダリング中..."}
    yield {"type": "tool_use", "data": tool_name}
```

**フロントエンド** (`useAgentCore.ts:119` に追加):
```typescript
case 'status':
  if (textValue) callbacks.onStatus?.(textValue);
  break;
```

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

### #18 検索クエリのリアルタイム表示 ✅ 完了

**ステータス**: ✅ main環境で実装完了

**実装内容**:

1. **バックエンド**（`agent.py:336-342`）
   - `current_tool_use`イベントの`input`からクエリを抽出
   - 文字列の場合はJSONパースを試みる（ストリーミング中は不完全なJSONが来るため）
   - **重要**: `web_search`の場合はクエリが取得できた時のみイベントを送信
   ```python
   if isinstance(tool_input, str):
       try:
           tool_input = json.loads(tool_input)
       except json.JSONDecodeError:
           pass
   # web_searchはクエリ取得時のみ送信（ストリーミング中は複数回イベントが来るため）
   if tool_name == "web_search":
       if isinstance(tool_input, dict) and "query" in tool_input:
           yield {"type": "tool_use", "data": tool_name, "query": tool_input["query"]}
       # クエリがない場合はイベントを送信しない（完全なJSONを待つ）
   else:
       yield {"type": "tool_use", "data": tool_name}
   ```

2. **フロントエンド**（`useAgentCore.ts:134-137`）
   - `onToolUse`コールバックに`query`パラメータを追加
   - `handleEvent`でqueryフィールドを検出して渡す

3. **フロントエンド**（`Chat.tsx:63-64, 377-395`）
   - ステータス表示を `Web検索中... "クエリ"` 形式で表示
   - クエリが変わると古いステータスを削除して新しいものをフェードイン表示

**⚠️ ハマりポイント**: `current_tool_use`イベントはストリーミング中に`input`が蓄積されながら複数回発火する。最初は空文字列→不完全なJSON→完全なJSONと徐々に構築される。クエリなしで即座にイベント送信すると、フロントエンドで「クエリなし」のステータスが先に表示され、後から来る「クエリあり」がスキップされてしまう。

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

### #10 テーマ選択 🔴重要

**現状**:
- テーマは `border` 固定（フロント: `src/themes/border.css`、バックエンド: `amplify/agent/runtime/border.css`）
- `SlidePreview.tsx:4,28-30` で `borderTheme` をインポート＆ `marp.themeSet.add()`
- `agent.py:124-130` のシステムプロンプトで `theme: border` を固定指示
- PDF生成時も `border.css` を固定指定（`agent.py:256`）

**利用可能なMarpビルトインテーマ**:
| テーマ | 特徴 |
|--------|------|
| **default** | Marpの標準テーマ、シンプル |
| **gaia** | モダンでカラフル |
| **uncover** | ミニマリスト＆エレガント |
| **border** | カスタム（グラデーション + 太い枠線） |

**実装方法**:

#### 1. フロントエンド

**App.tsx** に state追加:
```typescript
const [selectedTheme, setSelectedTheme] = useState<'default' | 'gaia' | 'uncover' | 'border'>('border');

// マークダウン生成時にテーマを反映
const handleMarkdownGenerated = (newMarkdown: string) => {
  const updatedMarkdown = newMarkdown.replace(
    /^(---[\s\S]*?theme:\s*)\w+/m,
    `$1${selectedTheme}`
  );
  setMarkdown(updatedMarkdown);
};
```

**ヘッダーにセレクタ追加**:
```tsx
<select
  value={selectedTheme}
  onChange={(e) => setSelectedTheme(e.target.value as any)}
  className="bg-white/20 text-white px-3 py-1 rounded text-sm border border-white/30"
>
  <option value="border" className="text-gray-900">Border（推奨）</option>
  <option value="default" className="text-gray-900">Default</option>
  <option value="gaia" className="text-gray-900">Gaia</option>
  <option value="uncover" className="text-gray-900">Uncover</option>
</select>
```

**SlidePreview.tsx** で全テーマ登録:
```typescript
import borderTheme from '../themes/border.css?raw';
import defaultTheme from '../themes/default.css?raw';
import gaiaTheme from '../themes/gaia.css?raw';
import uncoverTheme from '../themes/uncover.css?raw';

const marp = new Marp();
marp.themeSet.add(borderTheme);
marp.themeSet.add(defaultTheme);
marp.themeSet.add(gaiaTheme);
marp.themeSet.add(uncoverTheme);
```

#### 2. バックエンド

**agent.py の `generate_pdf()` を動的選択に修正**:
```python
def generate_pdf(markdown: str) -> bytes:
    import re
    theme_match = re.search(r'theme:\s*(\w+)', markdown)
    selected_theme = theme_match.group(1) if theme_match else 'border'

    theme_files = {
        'border': Path(__file__).parent / 'border.css',
        'default': Path(__file__).parent / 'default.css',
        'gaia': Path(__file__).parent / 'gaia.css',
        'uncover': Path(__file__).parent / 'uncover.css',
    }
    theme_path = theme_files.get(selected_theme, theme_files['border'])
    # ... 以下既存処理
```

#### 3. テーマCSSファイル配置

| 配置場所 | 用途 |
|---------|------|
| `src/themes/` | フロントエンド（Marp Core） |
| `amplify/agent/runtime/` | バックエンド（Marp CLI PDF生成） |

**テーマCSS入手方法**: `@marp-team/marp-core` の node_modules から抽出、または [marp-community-themes](https://github.com/rnd195/marp-community-themes) を参照

#### 4. データフロー図

```
[ヘッダー: テーマセレクタ▼] → selectedTheme state
         ↓ onChange
[マークダウンのフロントマター theme: を書き換え]
         ↓
[SlidePreview] → marp.themeSet に全テーマ登録済み → プレビュー反映
         ↓
[PDFダウンロード] → generate_pdf() がmarkdownからtheme:抽出 → Marp CLIに --theme 指定
```

---

### #24 editable-pptx形式でダウンロードできるようにしたい 🔴重要

**現状**:
- PDF生成: `agent.py:253-284` の `generate_pdf()` 関数
- フロントエンド: `useAgentCore.ts:157-243` の `exportPdf()` 関数
- UIボタン: `SlidePreview.tsx:84-90`

**Marp CLI の PPTX オプション比較**:

| オプション | 編集可能 | デザイン精度 | 発表者ノート | 推奨用途 |
|-----------|---------|-------------|-------------|---------|
| `--pptx` | ❌ | 🟢 高 | ✅ | デザイン重視 |
| `--pptx-editable` | ✅ | 🔴 低 | ❌ | テキスト修正が必要な場合 |

**⚠️ Marp公式の警告**:
> We do not recommend to export the editable PPTX if maintaining the slide's appearance is important.

**実装方法（#12と統合）**:

#### 1. バックエンド（agent.py）

```python
def generate_pptx(markdown: str, editable: bool = False) -> bytes:
    """Marp CLIでPPTXを生成

    Args:
        markdown: Marp形式のマークダウン
        editable: True の場合は --pptx-editable を使用（実験的）
    """
    theme_path = Path(__file__).parent / "border.css"

    with tempfile.TemporaryDirectory() as tmpdir:
        md_path = Path(tmpdir) / "slide.md"
        pptx_path = Path(tmpdir) / "slide.pptx"
        md_path.write_text(markdown, encoding="utf-8")

        cmd = [
            "marp",
            str(md_path),
            "--pptx-editable" if editable else "--pptx",
            "--allow-local-files",
            "-o", str(pptx_path),
        ]
        if theme_path.exists():
            cmd.extend(["--theme", str(theme_path)])

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"Marp CLI error: {result.stderr}")

        return pptx_path.read_bytes()
```

**invoke エンドポイント追加**（`agent.py:300` 付近）:
```python
if action == "export_pptx" and current_markdown:
    pptx_bytes = generate_pptx(current_markdown, editable=False)
    yield {"type": "pptx", "data": base64.b64encode(pptx_bytes).decode("utf-8")}
    return

if action == "export_pptx_editable" and current_markdown:
    pptx_bytes = generate_pptx(current_markdown, editable=True)
    yield {"type": "pptx_editable", "data": base64.b64encode(pptx_bytes).decode("utf-8")}
    return
```

#### 2. フロントエンド（useAgentCore.ts）

```typescript
export async function exportPptx(markdown: string): Promise<Blob> {
  return exportDocument(markdown, 'export_pptx', 'pptx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation');
}

export async function exportPptxEditable(markdown: string): Promise<Blob> {
  return exportDocument(markdown, 'export_pptx_editable', 'pptx_editable',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation');
}

// exportPdf と共通化した汎用関数
async function exportDocument(
  markdown: string,
  action: string,
  eventType: string,
  mimeType: string
): Promise<Blob> {
  // ... exportPdf と同様の実装
}
```

#### 3. UI（SlidePreview.tsx）

```tsx
{/* ダウンロードボタングループ */}
<div className="flex gap-1">
  <button onClick={onDownloadPdf} className="btn-kag ...">PDF</button>

  {/* PPTXドロップダウン */}
  <div className="relative group">
    <button className="btn-kag ...">PPTX ▼</button>
    <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg
                    opacity-0 invisible group-hover:opacity-100 group-hover:visible z-10">
      <button onClick={onDownloadPptx} className="block w-full px-4 py-2 text-sm ...">
        標準PPTX
      </button>
      <button onClick={onDownloadPptxEditable} className="block w-full px-4 py-2 text-sm border-t ...">
        編集可能PPTX ⚠️
      </button>
    </div>
  </div>
</div>
```

#### 4. 注意事項・制限

| 制限事項 | 影響度 | 対策 |
|--------|------|------|
| レンダリング精度低下 | 🔴 高 | UI上で「実験的」警告を表示 |
| 複雑CSSでエラー | 🔴 高 | border テーマで失敗の可能性あり |
| 発表者ノート非対応 | 🟡 中 | 標準PPTX推奨の表示 |

**推奨実装戦略**:
1. **PDF**: デフォルト（プリント最適化）
2. **標準PPTX**: デザイン重視（編集不可）
3. **編集可能PPTX**: オプション（⚠️マーク付き、警告表示）

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

### #25 == は使わないようにする（=== に統一）

**概要**: JavaScript/TypeScript で `==` を使っている箇所を `===` に統一する。厳密等価演算子を使用することで型強制による予期しない動作を防ぐ。

**対象ファイル**: フロントエンド全体（`src/` 配下の `.ts`, `.tsx` ファイル）

**修正方法**:
```bash
# 対象箇所の検出
grep -rn "==" --include="*.ts" --include="*.tsx" src/ | grep -v "===" | grep -v "!=="
```

**ESLint設定追加**（推奨）:
```json
{
  "rules": {
    "eqeqeq": ["error", "always"]
  }
}
```

---

### #21 企業のカスタムテンプレをアップロードして使えるようにしたい

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

### #26 Kimiに変えてみる

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
