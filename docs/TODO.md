# パワポ作るマン TODO

> **注意**: TODO管理は **mainブランチのみ** で行います。kagブランチのTODOファイルは参照用のリンクのみです。

## タスク管理

反映先の凡例: ✅ 完了 / 🔧 作業中 / ⬜ 未着手 / ➖ 対象外
ラベル: 🔴 重要
並び順: ①重要度が高い順 → ②実装が簡単な順（工数が小さい順）

| # | タスク | 工数 | 状態 | ラベル | main 実装 | main docs | kag 実装 | kag docs |
|---|--------|------|------|--------|-----------|-----------|----------|----------|
| #35 | 環境構築時に検証用ユーザーを最初から作っておきたい | 1-2h | ⬜ 未着手 | 🔴 重要 | ⬜ | ⬜ | ➖ | ➖ |
| #42 | Kimi K2がWeb検索後に無応答で終了する問題 | 30分 | 🔧 作業中 | 🔴 重要 | ⬜ | ⬜ | ⬜ | ➖ |
| #40 | Kimiがスライド内容をチャットに出力しがち問題 | 10分 | 🔧 作業中 | | ⬜ | ⬜ | ⬜ | ➖ |
| #41 | スライドデザイン選択UIのデザイン改善 | 23分 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #30 | スライドタイトルをAIが再設定するよう改善 | 30分 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #28 | 表のセル内パディング調整 | 30分 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #29 | 絵文字（❌✅）直後の文字が改行される問題 | 30分 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #19 | ツイートおすすめメッセージのストリーミング対応 | 30分 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #14 | 環境識別子リネーム（dev→sandbox） | 30分 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #37 | Sandboxのhotswap問題をまとめる | 1-2h | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #32 | deploy-time-build: Repositoryを自前で渡す方式に修正 | 1.5h | ⬜ 未着手 | | ⬜ | ➖ | ➖ | ➖ |
| #33 | TavilyのExtractに対応 | 2h | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #39 | 画面のどこかに最後のリリースの情報を表示したい | 3h | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #27 | 既存テーマにデザインバリエーション追加（タイトル・仕切りなど） | 1-2日 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #6 | Tavilyレートリミット枯渇通知 | 3-4h | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #7 | エラー監視・通知 | 3-4h | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #21 | 企業のカスタムテンプレをアップロードして使えるようにしたい | 5-7日 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #22 | 参考資料などをアップロードして使えるようにしたい | 5-7日 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #23 | コードベースのリアーキテクチャ | 1週間 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #16 | スライド編集（マークダウンエディタ） | 3-5日 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #9 | スライド共有機能 | 1週間 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |

---

## タスク詳細

> **並び順**: 上記タスク管理表と同じ順番（①重要度が高い順 → ②実装が簡単な順）で記載しています。

### #35 環境構築時に検証用ユーザーを最初から作っておきたい 🔴重要

**概要**: 環境構築時に検証用ユーザーを自動作成しておきたい。

**現状**: 手動でCognitoユーザーを作成する必要がある。

**修正方法**:
- CDKでCognito User Poolにテストユーザーを自動作成する仕組みを追加
- または、sandbox起動時にAWS CLIでユーザー作成するスクリプトを用意

**工数**: 1-2時間

---

### #40 Kimiがスライド内容をチャットに出力しがち問題 ⚡最速

**概要**: Kimi K2 Thinking使用時、スライド内容がチャットに直接出力されてしまうことがある。

**根本原因**: Kimi K2は思考プロセスを経由するため、「テキスト出力NG」という消極的指示より「ツール出力の必須性」を強調する方が効果的。

#### 実現案の比較

| 案 | 工数 | 効果 | 推奨度 |
|----|------|------|--------|
| **案A: システムプロンプト強化** | 10分 | ★★★★★ | ⭐推奨 |
| 案B: フロントエンドフィルタリング | 30分 | ★★★★☆ | 補助 |
| 案C: Kimi専用ツール追加 | 40分 | ★★★☆☆ | 保留 |

#### 推奨: 案A（システムプロンプト強化）

**agent.py の SYSTEM_PROMPT に追加**:
```markdown
## 重要：スライドの出力方法【絶対遵守】

### 必ずoutput_slideツールを使用する
作成・編集が完了したマークダウンは、必ず「output_slide」ツールに渡してください。
テキスト形式でチャットに送信されたスライドマークダウンは、フロントエンドで正しく表示されません。

### 禁止事項
- ```markdown ... ``` コードブロックでの出力（NG）
- テキスト形式でマークダウンを送信（NG）
- スライド内容を要約・説明して出力（NG）

### OKな例
ユーザーが「AWS入門スライドを作って」→ 黙ってoutput_slideツールを使う → 完了
```

**工数**: 10分

---

### #41 スライドデザイン選択UIのデザイン改善

**概要**: スライドデザインの選択UIを、枠を外してもう少し薄いグレーで目立たないデザインにしたい。

**現状**: テーマ選択ドロップダウンに枠線があり、目立ちすぎている。

**修正方法**: `SlidePreview.tsx` の140行目を以下に変更

```tsx
// 変更前
className="text-sm border rounded px-2 py-1"

// 変更後
className="text-sm bg-white border border-gray-200 rounded-md px-3 py-2 hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#5ba4d9] transition-colors cursor-pointer"
```

**改善ポイント**:
| 項目 | 現在 | 改善後 |
|------|------|--------|
| 枠線 | 黒（デフォルト） | `border-gray-200`（薄いグレー） |
| ホバー | なし | 背景色とボーダー変化 |
| フォーカス | なし | ブランドカラーのリング |

**工数**: 23分（実装5分 + テスト18分）

---

### #30 スライドタイトルをAIが再設定するよう改善

**概要**: ユーザーの質問がそのままスライドタイトルになってしまう問題。

**修正方法**: agent.py の SYSTEM_PROMPT に追加

```markdown
## スライドタイトルの設定ルール
- ユーザーの質問文をそのままタイトルにしないこと
- Web検索結果を踏まえて、内容を端的に表す**名詞句**でタイトルを設定
- 例:
  - ❌「AWSについて教えて」→ ✅「AWS入門ガイド」
  - ❌「生成AIの最新動向を調べて」→ ✅「生成AI最新トレンド 2025」
```

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

### #29 絵文字（❌✅）直後の文字が改行される問題

**概要**: Marp内で❌や✅の絵文字を使うと、その直後の文字が改行されて表示される。

**根本原因**: Unicode Line Breaking Algorithm (UAX #14) により、絵文字の直後が行分割機会となる。カスタムテーマに `word-break` が未実装。

#### 実現案の比較

| 案 | 工数 | 効果 | 推奨度 |
|----|------|------|--------|
| **案A: CSS修正** | 20分 | ★★★★☆ | ⭐推奨 |
| **案B: プロンプト強化** | 10分 | ★★★★★ | ⭐推奨 |
| 案C: フォント設定 | 1h | ★★☆☆☆ | 不要 |

#### 推奨: 案A + 案B（両方実施）

**案A: src/index.css に追加**
```css
.marpit section {
  word-break: break-word;
  overflow-wrap: break-word;
}
```

**案B: agent.py の SYSTEM_PROMPT を強化**（既存の「絵文字は使用しない」を具体化）
```markdown
## 禁止される表現の例
❌ 成功です  → ◎ 完了しました
❌ チェック完了  → ◎ 確認完了
✅ 対応済み  → ◎ 対応済み
```

**工数**: 30分（CSS + プロンプト）

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

### #37 Sandboxのhotswap問題をまとめる

**概要**: Sandboxのhotswap問題についてドキュメントをまとめる。

**修正方法**:
- `~/.claude/rules/amplify-cdk.md` にhotswap問題をまとめる
- CDK toolkit-libのバージョン情報やworkaroundを記載

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

### #33 TavilyのExtractに対応

**概要**: Tavily APIのExtract機能（URLからコンテンツ抽出）を使えるようにしたい。

#### 実現案の比較

| 案 | 工数 | 効果 | 推奨度 |
|----|------|------|--------|
| 案A: web_searchに統合 | 1.5h | シンプル | △ 曖昧 |
| **案B: 別ツール追加** | 2h | 明確 | ⭐推奨 |
| 案C: URL自動判定 | 1.5h | - | ❌ 脆弱 |

#### 推奨: 案B（別ツール tavily_extract として追加）

```python
@tool
def tavily_extract(urls: list[str], query: str = "") -> str:
    """指定したURLからコンテンツを抽出します。

    Args:
        urls: 抽出対象のURL（最大20個）
        query: コンテンツの優先度付け用クエリ（オプション）

    Returns:
        抽出されたコンテンツのテキスト
    """
    response = client.extract(
        urls=urls[:20],
        query=query,
        chunks_per_source=3,
        extract_depth="advanced",
        include_images=True,
    )
    # エラーハンドリング + フォーマット
```

**追加作業**:
- `VALID_TOOL_NAMES` に `"tavily_extract"` を追加
- `get_or_create_agent()` の `tools` リストに追加

**工数**: 2時間

---

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

### #27 既存テーマにデザインバリエーション追加（タイトル・仕切りなど）

**概要**: タイトルスライド・セクション区切り・引用など、デザインバリエーションを使えるようにする。

**追加するクラス**:
- `title` - タイトルスライド（グラデーション背景 + 中央配置）
- `crosshead` - セクション区切り（グレー背景 + 左ボーダー）
- `quote` - 引用（左ボーダー + イタリック）
- `image` - 画像中心
- `invert` - ダークモード
- `highlight` - ハイライト背景

**修正ファイル**:
| ファイル | 変更内容 |
|---------|---------|
| `src/themes/*.css` | クラス定義を追加 |
| `amplify/agent/runtime/*.css` | 同じ内容を追加 |
| `amplify/agent/runtime/agent.py` | SYSTEM_PROMPT にクラス使用ガイド追加 |

**工数**: 1-2日

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

### #23 コードベースのリアーキテクチャ

**概要**: 肥大化したファイルの分割・重複解消・テスト追加。

---

#### 現状分析

##### Chat.tsx（615行）

| 項目 | 内容 |
|------|------|
| **主な責務** | メッセージ管理、フォーム入力、AIエージェント呼び出し、ストリーミングイベントハンドリング、UI状態管理、豆知識ローテーション |
| **問題点** | ①責務の過多 ②複雑な条件分岐（onText内のメッセージインデックス検索） ③タイマー管理の複雑さ（tipTimeout/tipIntervalの二重管理） ④ステータス表示ロジックの分散 ⑤テスト困難性 |

##### useAgentCore.ts（411行）

| 項目 | 内容 |
|------|------|
| **主な責務** | AgentCore REST API呼び出し、SSEストリーミング処理、イベントタイプ振り分け、PDF/PPTX生成、モック実装 |
| **問題点** | ①**PDF/PPTX生成が90%同じコード**（約80行×2のコピペ） ②SSEストリーミング処理の重複 ③関心の分離がない（認証、ストリーミング、イベント振り分けが混在） |

##### agent.py（553行）

| 項目 | 内容 |
|------|------|
| **主な責務** | エントリーポイント（invoke 190行）、ツール定義（3つ計125行）、セッション管理、Kimi K2対応（リトライ・フォールバック計60行）、PDF/PPTX生成 |
| **問題点** | ①**巨大なinvoke関数（190行）** ②PDF/PPTX生成の重複（90%同じ） ③グローバル変数の悪用（`_generated_markdown`等） ④Kimi K2専用ロジックが散乱 |

##### CSS重複

| ディレクトリ | ファイル数 | 行数 |
|-------------|-----------|------|
| `src/themes/` | 3テーマ | 298行 |
| `amplify/agent/runtime/` | 3テーマ | 298行 |

**問題**: 完全に同じ内容が2箇所に存在。メンテナンス時に両方を修正する必要がある。

---

#### リアーキテクチャ案

##### 案A: 段階的分割（⭐推奨）

###### 1. useAgentCore.ts の分割（工数: 3-4時間）

```
src/hooks/
├── useAgentCoreAPI.ts       # API呼び出し関数群
│   ├── invokeAgent()        # チャット実行
│   ├── exportSlide()        # PDF/PPTX統合生成（新規）
│   └── invokeAgentMock()    # モック
├── useEventHandling.ts      # イベント処理
│   └── handleSSEEvent()
└── useStreamingSSE.ts       # SSEストリーミング共通処理
    └── streamSSE()
```

**メリット**: PDF/PPTX実装の重複解消、テスト可能性向上

###### 2. Chat.tsx の分割（工数: 4-6時間）

```
src/components/
├── ChatView.tsx             # UIのみ（200行程度）
├── hooks/
│   ├── useMessages.ts       # メッセージ状態管理
│   ├── useAgentStatus.ts    # ステータス管理
│   ├── useTipRotation.ts    # 豆知識ローテーション
│   └── useChatHandlers.ts   # イベントハンドラ群
└── constants.ts             # MESSAGES, TIPS定数
```

**メリット**: 各フック50-100行に縮小、テスト可能、再利用可能

###### 3. agent.py の分割（工数: 6-8時間）

```
amplify/agent/runtime/
├── agent.py                 # メイン（100行、invokeのみ）
├── models.py                # モデル設定（~40行）
├── tools/                   # ツールモジュール
│   ├── web_search.py
│   ├── output_slide.py
│   └── generate_tweet_url.py
├── streaming.py             # ストリーミング処理（リトライ含む）
├── exports.py               # PDF/PPTX統合生成（~80行）
├── kimi_handlers.py         # Kimi K2専用処理
└── session_manager.py       # セッション管理クラス
```

**メリット**: invoke関数が190行→50行に縮小、テスト容易化、Kimi対応の封じ込め

###### 4. CSS重複排除（工数: 1-2時間）

**推奨案**: 共有ディレクトリ化
```
shared/themes/
├── gradient.css
├── border.css
└── beam.css
```
- フロントエンド: `import theme from '@/themes/xxx.css?raw'`
- バックエンド: `shared/themes/`を参照

---

#### 推奨実施フェーズ

| フェーズ | タスク | 工数 | 優先度 |
|---------|--------|------|--------|
| **1** | useAgentCore.ts分割 | 3-4h | ⭐⭐⭐ |
| **1** | CSS重複排除 | 1-2h | ⭐⭐⭐ |
| **2** | agent.py分割 | 6-8h | ⭐⭐⭐ |
| **3** | Chat.tsx分割 | 4-6h | ⭐⭐ |
| **3** | テスト追加 | 5-7h | ⭐⭐ |

---

#### テスト追加の優先順位

| 対象 | テスト内容 | 工数 |
|------|-----------|------|
| useAgentCore | SSEストリーミング、エラーハンドリング | 2-3h |
| useMessages | メッセージ追加・更新 | 1-2h |
| agent.py | ツール単体、ストリーミング処理、Kimi対応 | 3-4h |

---

#### 工数合計

| 範囲 | 最小 | 最大 |
|------|------|------|
| フェーズ1-2（高ROI） | 10.5h | 14h |
| すべて（テスト含む） | 18.5h | 27h |

**工数**: 1週間（フェーズ1-2）〜 2週間（全体）

---

### #16 スライド編集（マークダウンエディタ）

**推奨ライブラリ**: @uiw/react-codemirror（YAML frontmatter対応、モバイル優秀）

```bash
npm install @uiw/react-codemirror @codemirror/lang-markdown @codemirror/lang-yaml
```

**工数**: 3-5日

---

### #9 スライド共有機能

**概要**: スライドを他の人と共有できるようにする。

**必要なインフラ**:
- DynamoDB: スライドメタデータ
- S3: マークダウン本体
- Lambda or AgentCore: 保存・取得API

**工数**: 1週間
