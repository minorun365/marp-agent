# パワポ作るマン TODO

> **注意**: TODO管理は **mainブランチのみ** で行います。kagブランチのTODOファイルは参照用のリンクのみです。

## タスク管理

反映先の凡例: ✅ 完了 / 🔧 作業中 / ⬜ 未着手 / ➖ 対象外
ラベル: 🔴 重要

| # | タスク | 工数 | 状態 | ラベル | main 実装 | main docs | kag 実装 | kag docs |
|---|--------|------|------|--------|-----------|-----------|----------|----------|
| #17 | スライド生成直後の返答メッセージを簡素にしたい | 小 | ✅ 完了 | 🔴 重要 | ✅ | ✅ | ✅ | ✅ |
| #20 | PowerPoint生成中の待ちストレス軽減 | 小〜中 | ⬜ 未着手 | 🔴 重要 | ⬜ | ⬜ | ⬜ | ⬜ |
| #10 | テーマ選択 | 中 | ⬜ 未着手 | 🔴 重要 | ⬜ | ⬜ | ➖ | ➖ |
| #24 | editable-pptx形式でダウンロードできるようにしたい | 中 | ⬜ 未着手 | 🔴 重要 | ⬜ | ⬜ | ⬜ | ⬜ |
| #19 | ツイートおすすめメッセージのストリーミング対応 | 小 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #14 | 環境識別子リネーム（main→prod, dev→sandbox） | 小 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #18 | 検索クエリのリアルタイム表示 | 小〜中 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #2 | 追加指示の文脈理解改善 | 中 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #6 | Tavilyレートリミット枯渇通知 | 中 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #7 | エラー監視・通知 | 中 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #12 | PowerPoint形式出力 | 中 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
| #21 | 企業のカスタムテンプレをアップロードして使えるようにしたい | 中〜大 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #22 | 参考資料などをアップロードして使えるようにしたい | 中〜大 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #23 | コードベースのリアーキテクチャ | 中〜大 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ⬜ |
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

**現状**: 生成中は「スライドを作成中...（20秒ほどかかります）」のスピナーのみ（`Chat.tsx:262-280`）。

**関連コード箇所**:
| ファイル | 処理内容 | 行番号 |
|---------|---------|--------|
| `Chat.tsx` | onToolUse イベントハンドラ | 253-296 |
| `Chat.tsx` | ステータスメッセージ表示 | 379-394 |
| `useAgentCore.ts` | tool_use イベント処理 | 134-138 |

**推奨修正（段階的に実施）**:

#### Phase 1: 豆知識ローテーション（フロントエンドのみ、工数：小）⭐推奨

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

### #12 PowerPoint形式出力

**Marp CLIはPPTX出力に対応済み**（`--pptx` フラグ）。#24と統合して実装推奨。

→ **#24と統合実装** を参照

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
