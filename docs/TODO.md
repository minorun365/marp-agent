# パワポ作るマン TODO

> **注意**: TODO管理は **mainブランチのみ** で行います。kagブランチのTODOファイルは参照用のリンクのみです。

## タスク管理

反映先の凡例: ✅ 完了 / 🔧 作業中 / ⬜ 未着手 / ➖ 対象外
ラベル: 🔴 重要
並び順: ①重要度が高い順 → ②実装が簡単な順（工数が小さい順）

| # | タスク | 工数 | 状態 | ラベル | main 実装 | main docs | kag 実装 | kag docs |
|---|--------|------|------|--------|-----------|-----------|----------|----------|
| #35 | 環境構築時に検証用ユーザーを最初から作っておきたい | 1-2h | ✅ 完了 | 🔴 重要 | ✅ | ✅ | ➖ | ➖ |
| #43 | Tavily APIキーをさらに追加する必要がある | 10分 | ✅ 完了 | | ✅ | ✅ | ➖ | ➖ |
| #50 | Sonnet 5モードを足しておきたい | 20分 | ✅ 完了 | | ✅ | ✅ | ➖ | ➖ |
| #46 | Haikuモードも足したい | 20分 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #41 | スライドデザイン選択UIのデザイン改善 | 30分 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #53 | モデル選択プルダウンの文字パディング改善 | 30分 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #30 | スライドタイトルをAIが再設定するよう改善 | 30分 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #28 | 表のセル内パディング調整 | 30分 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #19 | ツイートおすすめメッセージのストリーミング対応 | 30分 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #14 | 環境識別子リネーム（dev→sandbox） | 30分 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #32 | deploy-time-build: Repositoryを自前で渡す方式に修正 | 1.5h | ⬜ 未着手 | | ⬜ | ➖ | ➖ | ➖ |
| #37 | Sandboxのhotswap問題をまとめる | 1-2h | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #44 | output_slideツール未使用時のUI対応 | 1-2h | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #54 | 公開スライドのURLをXでツイートする機能 | 1.5h | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #49 | KimiがWeb検索結果をチャットメッセージで返さないようにしたい | 2h | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #33 | TavilyのExtractに対応 | 2h | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #45 | Langfuseでトレースしたい | 2.5h | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #39 | 画面のどこかに最後のリリースの情報を表示したい | 3h | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #6 | Tavilyレートリミット枯渇通知 | 3-4h | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #7 | エラー監視・通知 | 3-4h | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #27 | 既存テーマにデザインバリエーション追加（タイトル・仕切りなど） | 1-2日 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #48 | GPTを実装してみる | 2日 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #52 | Nova PremierとWeb Groundingを実装する | 2-3日 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #16 | スライド編集（マークダウンエディタ） | 3-5日 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |
| #51 | 編集可能PPTXでダウンロードさせたい | 3-4日 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #21 | 企業のカスタムテンプレをアップロードして使えるようにしたい | 5-7日 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #22 | 参考資料などをアップロードして使えるようにしたい | 5-7日 | ⬜ 未着手 | | ⬜ | ⬜ | ➖ | ➖ |
| #23 | コードベースのリアーキテクチャ | 1-2週間 | ⬜ 未着手 | | ⬜ | ⬜ | ⬜ | ➖ |

---

## タスク詳細

> **並び順**: 上記タスク管理表と同じ順番（①重要度が高い順 → ②実装が簡単な順）で記載しています。

### #35 環境構築時に検証用ユーザーを最初から作っておきたい 🔴重要 ✅完了

**概要**: 環境構築時に検証用ユーザーを自動作成しておきたい。

**実装済み**: `amplify/backend.ts:65-110` でCDKによるテストユーザー自動作成機能を実装。

**実装内容**:
- `.env` の `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` でテストユーザーを自動作成
- `CfnUserPoolUser` でユーザー作成
- `AwsCustomResource` + `adminSetUserPassword` APIで恒久パスワード設定
- 初回ログイン時のパスワード変更が不要（PERMANENT状態）

---

### #43 Tavily APIキーをさらに追加する必要がある ✅完了

**概要**: Tavily APIキーの追加が必要。

**実装済み**: `amplify/agent/runtime/agent.py:47-51` で複数キーのフォールバック対応を実装。

**実装内容**:
- 環境変数 `TAVILY_API_KEY`, `TAVILY_API_KEY2`, `TAVILY_API_KEY3` で最大3キー対応
- agent.py:69-94 でレートリミット時に次のキーで自動リトライ
- 全キー枯渇時はユーザーへのエラーメッセージを表示

---

### #50 Sonnet 5モードを足しておきたい ✅完了

**概要**: Claude Sonnet 5（最新モデル）を選択できるようにしたい。

**実装済み**: フロントエンド・バックエンド両方で`claude5`として実装完了。

**実装内容**:
- ✅ フロントエンド: `ModelType`に`claude5`定義済み（Chat.tsx:5行目）
- ✅ バックエンド: `_get_model_config()`に`claude5`設定済み（agent.py:29-36行目）
- ✅ UI: プルダウンに「宇宙最速（Claude Sonnet 5）」として表示
- ✅ エラーハンドリング: 未リリース時のメッセージ実装済み（Chat.tsx:50行目）

**残作業**: Bedrockでのモデルリリース待ち（コード変更不要）

---

### #46 Haikuモードも足したい

**概要**: Claude Haiku（軽量・高速モデル）を選択できるようにしたい。

**修正箇所**:

1. **フロントエンド（Chat.tsx）**:
   - Line 5: `type ModelType = 'claude' | 'kimi' | 'claude5' | 'haiku';`
   - Line 636: 表示名に`'haiku' ? 'Haiku'`を追加
   - Line 640-650: `<option value="haiku">高速軽量（Claude Haiku）</option>`を追加

2. **バックエンド（agent.py）**:
   - Line 29-36の後に追加:
   ```python
   elif model_type == "haiku":
       return {
           "model_id": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
           "cache_prompt": "default",
           "cache_tools": "default",
       }
   ```

**工数**: 20分（実装8分 + テスト12分）

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

**工数**: 30分（実装5分 + テスト25分）

---

### #53 モデル選択プルダウンの文字パディング改善

**概要**: モデル選択のプルダウン内の選択肢の文字の両端のパディングが少なくて見た目がしょぼい問題を改善。

**修正箇所**: `src/components/Chat.tsx` 632-651行目

**変更内容**:
| Tailwindクラス | 変更前 | 変更後 | 効果 |
|---|---|---|---|
| 左右パディング | `pl-3 sm:pl-4` | `px-3 sm:px-4` | 右パディングを追加 |
| 上下パディング | なし | `py-2` | 垂直方向の余白を確保 |
| テキスト→矢印の左マージン | `sm:ml-1` | `sm:ml-2` | 間隔を広げて可読性向上 |
| 矢印→次要素の右マージン | `mr-2` | `mr-3` | 区切り線との間隔を広げる |

**工数**: 30分（実装5分 + テスト25分）

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

### #37 Sandboxのhotswap問題をまとめる

**概要**: Sandboxのhotswap問題についてドキュメントをまとめる。

**修正方法**:
- `~/.claude/rules/amplify-cdk.md` にhotswap問題をまとめる
- CDK toolkit-libのバージョン情報やworkaroundを記載

**工数**: 1-2時間

---

### #44 output_slideツール未使用時のUI対応

**概要**: Kimi K2 Thinkingがoutput_slideツールを呼ばずにマークダウンを直接テキスト出力した場合、「スライドを作成中...」ステータスが表示されない問題。

**発生日時**: 2026-02-02 JST 10:30頃（sandbox環境）

**ログ調査結果**:
- セッションID: `f98f0662-f01d-4041-96a4-bde4c2648906`
- web_searchツール: 4回呼び出し ✅
- output_slideツール: **0回**（呼ばれなかった）❌
- finish_reason: `end_turn`
- バックエンドのフォールバック機構によりスライド自体は表示された

**根本原因**:
システムプロンプトで「output_slideツールを使用すること」と指示しているが、複数回のweb_search後にKimiが指示に従わず直接マークダウンを出力した。

**フロントエンドへの影響**:
- `onToolUse('output_slide')` イベントが発火しない
- 「スライドを作成中...」ステータスが表示されない
- 豆知識ローテーションが開始されない

**対処案**:

| 案 | 内容 | 難易度 | 効果 |
|----|------|--------|------|
| **A** | システムプロンプト強化（より強い指示） | 低 | △ 確実ではない |
| **B** | フロントエンドでマークダウン検出時もステータス表示 | 中 | ◎ 確実 |
| **C** | バックエンドでマークダウンテキスト検出→output_slide相当の処理追加 | 中 | ◎ 確実 |

**推奨**: 案A + 案B の組み合わせ

**案Bの実装方針**:
`useAgentCore.ts` の `onText` ハンドラ内で `---\nmarp: true` を検出した場合、`onToolUse('output_slide')` 相当のコールバックを発火させる。

**関連ファイル**:
- フロントエンド: `src/components/Chat.tsx:321` (onToolUse処理)
- フロントエンド: `src/hooks/useAgentCore.ts:138` (イベント振り分け)
- バックエンド: `amplify/agent/runtime/agent.py:208-210` (プロンプト指示)
- バックエンド: `amplify/agent/runtime/agent.py:580-585` (フォールバック処理)

**工数**: 1-2時間

---

### #54 公開スライドのURLをXでツイートする機能

**概要**: 公開したスライドのURLをXでツイートできる機能を追加したい。

**現状**: スライドを公開後、共有URLは表示されるがワンクリックでツイートはできない。

**修正箇所**:

1. **ShareResultModal.tsx** - Xシェアボタン追加
   ```typescript
   // Props追加
   interface ShareResultModalProps {
     isOpen: boolean;
     url: string;
     expiresAt: number;
     onClose: () => void;
     onShare?: () => void;  // 追加
   }

   // ボタン追加
   const handleShareToX = () => {
     const tweetText = `#パワポ作るマン でスライドを公開しました！\n${url}`;
     const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
     window.open(twitterUrl, '_blank', 'width=600,height=400');
   };
   ```

2. **App.tsx** - コールバック追加
   ```typescript
   <ShareResultModal
     onShare={() => {
       const tweetText = `#パワポ作るマン でスライドを公開しました！\n${shareResult?.url}`;
       const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
       window.open(twitterUrl, '_blank', 'width=600,height=400');
     }}
     ...
   />
   ```

**工数**: 1.5時間（実装30分 + テスト1時間）

---

### #49 KimiがWeb検索結果をチャットメッセージで返さないようにしたい

**概要**: Kimi K2がWeb検索後にその結果をチャットメッセージとしてそのまま出力してしまう問題。

**修正方法**: システムプロンプトに以下を追加（`amplify/agent/runtime/agent.py`）

```markdown
## Web検索結果の取り扱い
web_searchツールで取得した検索結果は、あなたがスライド生成の参考情報として使用するためです。以下のルールを厳密に守ってください：

1. **検索結果をチャットメッセージとして出力しない**
   - 検索結果の要約や引用をユーザーのメッセージに含めてはいけません
   - 例：「Web検索の結果、〇〇という情報が得られました」という返答は禁止

2. **検索結果は内部処理のみ**
   - 検索結果を使用してスライドを生成する際の参考資料として使う
   - スライド作成に直接役立つ情報のみをマークダウンに反映させる

3. **検索完了後の動作**
   - web_searchツール実行直後は、ユーザーへのテキスト返答をせず、すぐにスライド生成を開始する
   - output_slideツール実行までの間にテキストを出力しない

4. **参考文献の表記**
   - スライド内に情報源を含める必要がある場合は、参考文献スライドにURL形式で記載
   - 検索結果そのものをテキストとして表示しない
```

**工数**: 2時間（実装15分 + テスト1.5時間 + ドキュメント15分）

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

### #52 Nova PremierとWeb Groundingを実装する

**概要**: Amazon Nova Premier（Bedrockの最新モデル）とWeb Grounding（組み込みWeb検索機能）を選択肢として追加したい。

**モデルID**: `us.amazon.nova-premier-v1:0`

**利用可能リージョン**: us-east-1, us-east-2, us-west-2

**Nova Premierの特徴**:
| 項目 | 詳細 |
|------|------|
| コンテキスト長 | 100万トークン |
| 入力タイプ | テキスト、画像、動画 |
| 得意分野 | 複雑なタスク、超長文処理 |

**Web Grounding機能**:
- APIリクエスト時に `nova_grounding` システムツールを有効化
- モデルが検索の必要性を自動判断
- 引用付きで応答を生成（引用元URLの表示が必須）

**実装方法（Bedrock Converse API直接呼び出し）**:
```python
response = bedrock.converse(
    modelId="us.amazon.nova-premier-v1:0",
    messages=[{"role": "user", "content": [{"text": prompt}]}],
    toolConfig={
        "tools": [{"systemTool": {"name": "nova_grounding"}}]
    }
)
```

**IAM権限追加が必要**:
```json
{
  "Effect": "Allow",
  "Action": ["bedrock:InvokeTool"],
  "Resource": ["arn:aws:bedrock::{ACCOUNT_ID}:system-tool/amazon.nova_grounding"]
}
```

**現実的な判断**:
- 現在のTavily検索（`web_search`ツール）で十分な検索機能を提供済み
- Nova Premierの超長文処理は、スライド生成アプリでは不要（通常数百〜数千トークン）
- Claudeの対話品質・コード生成能力の方が現在のユースケースに適合
- **結論**: 現時点では移行メリットが少ない。検証目的での導入を検討

**参照リンク**:
- [Amazon Nova Premier](https://aws.amazon.com/blogs/aws/amazon-nova-premier-our-most-capable-model-for-complex-tasks-and-teacher-for-model-distillation/)
- [Web Grounding](https://docs.aws.amazon.com/nova/latest/nova2-userguide/web-grounding.html)

**工数**: 2-3日（Strands依存を削除し、Boto3直接呼び出しに変更する場合）

---

### #16 スライド編集（マークダウンエディタ）

**推奨ライブラリ**: @uiw/react-codemirror（YAML frontmatter対応、モバイル優秀）

```bash
npm install @uiw/react-codemirror @codemirror/lang-markdown @codemirror/lang-yaml
```

**工数**: 3-5日

---

### #51 編集可能PPTXでダウンロードさせたい

**概要**: 現在のPPTXは画像ベースだが、編集可能なPPTXとして出力したい。

**現状の問題**: Marp CLIが生成するPPTXは「レンダリングされた画像」であり、テキスト編集は不可。

**推奨アプローチ**: python-pptx + マークダウンパーサー（Marko）で新規実装

**アーキテクチャ**:
```
マークダウン入力
  ↓
[Markoパーサー] → AST（抽象構文木）
  ↓
[Marpディレクティブ抽出] → スライド設定
  ↓
[スライド構造化] → スライド配列
  ↓
[python-pptxレンダラー] → PPTX出力
```

**段階的実装計画**:

| フェーズ | 内容 | 工数 |
|---------|------|------|
| **フェーズ1（MVP）** | スライド分割、見出し、箇条書き、テキスト書式 | 2-3日 |
| フェーズ2（コア機能） | Marpディレクティブ、画像、表、コードブロック | 3-4日 |
| フェーズ3（高度機能） | スピーカーノート、背景、クラス適用、カスタムテーマ | 2-3日 |

**参照リンク**:
- [python-pptx Documentation](https://python-pptx.readthedocs.io/)
- [md2pptx GitHub](https://github.com/MartinPacker/md2pptx)（参考ライブラリ）
- [Marko PyPI](https://pypi.org/project/marko/)

**工数**: 3-4日（MVP）〜 10-13日（完全版）

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

##### Chat.tsx（674行）

| 項目 | 内容 |
|------|------|
| **主な責務** | メッセージ管理、フォーム入力、AIエージェント呼び出し、ストリーミングイベントハンドリング、UI状態管理、豆知識ローテーション |
| **問題点** | ①責務の過多 ②複雑な条件分岐（onText内のメッセージインデックス検索） ③タイマー管理の複雑さ（tipTimeout/tipIntervalの二重管理） ④ステータス表示ロジックの分散 ⑤テスト困難性 |

##### useAgentCore.ts（508行）

| 項目 | 内容 |
|------|------|
| **主な責務** | AgentCore REST API呼び出し、SSEストリーミング処理、イベントタイプ振り分け、PDF/PPTX生成、モック実装 |
| **問題点** | ①**PDF/PPTX生成が90%同じコード**（約80行×2のコピペ） ②SSEストリーミング処理の重複 ③関心の分離がない（認証、ストリーミング、イベント振り分けが混在） |

##### agent.py（878行）

| 項目 | 内容 |
|------|------|
| **主な責務** | エントリーポイント（invoke 250行）、ツール定義（3つ計125行）、セッション管理、Kimi K2対応（リトライ・フォールバック・thinkタグフィルタリング計100行）、PDF/PPTX生成、スライド共有 |
| **問題点** | ①**巨大なinvoke関数（250行）** ②PDF/PPTX生成の重複（90%同じ） ③グローバル変数の悪用（`_generated_markdown`等） ④Kimi K2専用ロジックが散乱 |

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

**工数**: 1-2週間
