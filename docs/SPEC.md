# パワポ作るマン 仕様書

## 決定事項サマリー

| カテゴリ | 項目 | 決定 |
|---------|------|------|
| UI | レイアウト | タブ切り替え（チャット / プレビュー） |
| UI | ライブラリ | Tailwind CSS |
| UI | プレビュー | 全スライド一覧（サムネイル） |
| UI | 編集機能 | なし（MVP。チャットで修正指示のみ） |
| スライド | テーマ | border（コミュニティテーマ） |
| スライド | アスペクト比 | 16:9（ワイド） |
| スライド | 出力形式 | PDFのみ（MVP） |
| エージェント | 性格 | プロフェッショナル |
| エージェント | ツール | web_search, output_slide, generate_tweet_url |
| インフラ | リージョン | us-east-1（バージニア） |
| インフラ | モデル | Claude Sonnet 4.5 |
| 認証 | スコープ | 誰でもサインアップ可能（本番時） |

---

## 1. ユーザー体験（UX）

### 基本フロー

```
1. チャットで指示入力
   └─ 例：「AWS入門の5枚スライドを作って」

2. エージェントがスライド生成
   ├─ 思考過程をストリーミング表示
   └─ 生成中はステータス表示

3. プレビュー確認
   ├─ 全スライドをサムネイル一覧で確認
   └─ 「修正を依頼」ボタンでチャットに戻る

4. 修正フロー（必要に応じて）
   ├─ 「修正を依頼」ボタンクリック → チャットタブに自動切り替え
   ├─ 修正用プロンプトが自動送信される
   └─ 2〜3を繰り返し

5. PDFダウンロード
   └─ 新しいタブでPDFが開く

6. Xでシェア（自動）
   ├─ チャット画面に自動遷移
   ├─ エージェントがツイートURLを生成
   └─ シェアリンクをクリックでX投稿画面へ
```

### 画面レイアウト（タブ切り替え）

```
┌─────────────────────────────────────────┐
│  パワポ作るマン                    [PDF] │
├─────────────────────────────────────────┤
│  [💬 チャット]  [📊 プレビュー]           │
├─────────────────────────────────────────┤
│                                         │
│         選択中のタブのコンテンツ          │
│                                         │
└─────────────────────────────────────────┘
```

### ストリーミング仕様

| フェーズ | 表示方法 |
|---------|---------|
| 思考過程（テキスト生成） | チャット欄にリアルタイムストリーミング描画 |
| Web検索中 | ステータスメッセージ + スピナー |
| Web検索完了 | ステータスメッセージ + チェックマーク |
| スライド生成中 | ステータスメッセージ + スピナー |
| スライド生成完了 | ステータスメッセージ + チェックマーク |
| 完了 | プレビュータブに自動切り替え |

### ステータス表示仕様

| 状態 | テキスト | アイコン/エフェクト |
|------|---------|---------|
| 初期思考中 | 「考え中...」 | シマーエフェクト（光が左→右に流れる） |
| Web検索中 | 「Web検索中...」 | スピナー（回転アニメーション） |
| Web検索完了 | 「Web検索完了」 | チェックマーク（緑色✓） |
| スライド生成中 | 「スライドを作成中...（20秒ほどかかります）」 | スピナー（回転アニメーション） |
| スライド生成完了 | 「スライドを作成しました」 | チェックマーク（緑色✓） |
| ツイート作成中 | 「ツイート案を作成中...」 | スピナー（回転アニメーション） |
| ツイート作成完了 | 「ツイート案を作成しました」 | チェックマーク（緑色✓） |

**重複防止**: 同じ「Web検索中...」ステータスが複数回表示されないよう、進行中のステータスがある場合はスキップする

**複数回検索時の挙動**: 2回目のweb_search開始時、テキスト受信により1回目の「Web検索中...」が自動的に「Web検索完了」に更新され、新しい「Web検索中...」ステータスが追加される

**カーソル制御**: ツール使用開始時にストリーミングカーソル（▌）を非表示にする

### 初期メッセージアニメーション

チャット画面を開いた時、エージェントの初期メッセージ（「何でも指示してね！」等）が1文字ずつ表示されるアニメーション効果を適用。ユーザーにAIとの対話感を演出する。

### セッション管理

フロントエンドで `crypto.randomUUID()` によりセッションIDを生成し、APIリクエストに含める。バックエンドはセッションIDごとにAgentインスタンスを保持し、会話履歴を維持する。

```typescript
// フロントエンド（App.tsx）
const [sessionId] = useState(() => crypto.randomUUID());

// リクエストボディ
{ prompt, markdown, session_id: sessionId }
```

**設計意図**: MVP段階ではシンプルさを優先し、メモリ内セッション管理を採用。コンテナ再起動で履歴が消えるが、短期的なスライド作成ユースケースでは許容可能。永続化が必要になった場合は Strands Agents の `FileSessionManager` や `S3SessionManager` に移行できる。

```
チャット欄の例:
┌─────────────────────────────────────────┐
│ 👤 AWS入門の5枚スライドを作って          │
├─────────────────────────────────────────┤
│ 🤖 AWS入門のスライドですね。            │
│    以下の構成で作成します：              │
│    1. タイトル                          │
│    2. AWSとは                           │  ← リアルタイム描画
│    3. 主要サービス...                   │
├─────────────────────────────────────────┤
│ ⏳ スライドを生成しています...           │  ← ステータス
└─────────────────────────────────────────┘
```

---

## 2. スライド仕様

### Marp設定

```yaml
---
marp: true
theme: border
size: 16:9
paginate: true
---
```

**borderテーマの特徴**:
- グレーのグラデーション背景（`#f7f7f7` → `#d3d3d3`）
- 濃いグレーの太枠線（`#303030`）
- 白いアウトライン
- Interフォント
- `<!-- _class: tinytext -->` で参考文献用の小さいテキスト対応

### スライド構成ガイドライン

- 1枚目：タイトル + サブタイトル
- 箇条書きは1スライドあたり3〜5項目
- 絵文字は使用しない（ビジネスライク）
- スライド区切りは `---`

---

## 3. エージェント仕様

### ツール

| ツール名 | 説明 |
|---------|------|
| `web_search` | Tavily APIを使用したWeb検索。複数APIキーのフォールバック対応（レートリミット時に自動で次のキーに切替） |
| `output_slide` | 生成したMarpマークダウンを出力するツール。テキストで直接出力せずこのツール経由で出力 |
| `generate_tweet_url` | ツイート投稿用のURLを生成。ハッシュタグ `#パワポ作るマン` を含む100文字以内のツイート |

### ツール駆動型UIパターン（設計意図）

マークダウンをテキストストリームで直接出力せず、`output_slide` ツール経由で出力する設計を採用。

**理由**:
- LLMの出力テキストにマークダウンが混入すると、フロントエンドでのパース・除去処理が複雑になる
- ツール経由にすることで、テキストストリーム（思考過程）とコンテンツ（スライド）を完全に分離
- `tool_use` イベントを検知してステータス表示（「スライドを作成中...」）を出せる
- UIの実装がシンプルになり、バグも減る

### システムプロンプト

```markdown
あなたは「パワポ作るマン」、プロフェッショナルなスライド作成AIアシスタントです。

## 役割
ユーザーの指示に基づいて、Marp形式のマークダウンでスライドを作成・編集します。
デザインや構成についてのアドバイスも積極的に行います。

## アプリ使用の流れ
ユーザーはフロントエンドから、作ってほしいスライドのテーマや、題材のURLなどをリクエストします。
あなたの追加質問や、一度あなたが生成したスライドに対して、内容調整や軌道修正などの追加指示をリクエストして、壁打ちしながらスライドの完成度を高めていきます。

## スライド作成ルール
- フロントマターには以下を含める：
  ---
  marp: true
  theme: border
  size: 16:9
  paginate: true
  ---
- スライド区切りは `---` を使用
- 1枚目はタイトルスライド（タイトル + サブタイトル）
- 箇条書きは1スライドあたり3〜5項目に抑える
- 絵文字は使用しない（シンプルでビジネスライクに）

## スライド構成テクニック（必ず従うこと！）
単調な箇条書きの連続を避け、以下のテクニックを織り交ぜてプロフェッショナルなスライドを作成してください。

### セクション区切りスライド【必須】
3〜4枚ごとに、背景色を変えた中タイトルスライドを挟んでセクションを区切る：
<!-- _backgroundColor: #303030 -->
<!-- _color: white -->
## セクション名

### 多様なコンテンツ形式
箇条書きだけでなく、以下を積極的に使い分ける：
- **表（テーブル）**: 比較・一覧に最適
- **引用ブロック**: 重要なポイントや定義の強調に `> テキスト`
- **==ハイライト==**: キーワードの強調に
- **太字・斜体**: `**重要**` や `*補足*`

### 参考文献・出典スライド
Web検索した場合は最後に出典スライドを追加し、文字を小さくする（`<!-- _class: tinytext -->`）

### タイトルスライドの例
<!-- _paginate: skip -->
# プレゼンタイトル
### サブタイトル — 発表者名

## Web検索
最新の情報が必要な場合や、リクエストに不明点がある場合は、web_searchツールを使って調べてからスライドを作成してください。
ユーザーが「〇〇について調べて」「最新の〇〇」などと言った場合は積極的に検索を活用します。
一度の検索で十分な情報が得られなければ、必要に応じて試行錯誤してください。

## 検索エラー時の対応
web_searchツールがエラーを返した場合（「検索エラー」「APIキー未設定」「rate limit」「quota」などのメッセージを含む場合）：
1. エラー原因をユーザーに伝える
2. 一般的な知識や推測でスライド作成せず、修正をお待ちくださいと案内
3. スライド作成は行わず、エラー報告のみで終了

## 重要：スライドの出力方法
スライドを作成・編集したら、必ず output_slide ツールを使ってマークダウンを出力してください。
テキストでマークダウンを直接書き出さないでください。output_slide ツールに渡すマークダウンには、フロントマターを含む完全なMarp形式のマークダウンを指定してください。

## Xでシェア機能
ユーザーが「シェアしたい」「ツイートしたい」「Xで共有」などと言った場合は、generate_tweet_url ツールを使ってツイートURLを生成してください。
ツイート本文は以下のフォーマットで100文字以内で作成：
- #パワポ作るマン で○○のスライドを作ってみました。これは便利！ pawapo.minoruonda.com
- ○○の部分は作成したスライドの内容を簡潔に表現

## その他
- 現在は2026年です。
- ユーザーから「PDFをダウンロードできない」旨の質問があったら、ブラウザでポップアップがブロックされていないか確認してください。
```

### レスポンス例

```
AWS入門のスライドですね。以下の構成で5枚作成します：

1. タイトル
2. AWSとは？
3. 主要サービス（コンピューティング）
4. 主要サービス（ストレージ・DB）
5. まとめ・次のステップ

```markdown
---
marp: true
theme: border
...
```

---

## 4. 技術仕様

### アーキテクチャ

```
[ブラウザ] ←→ [React + Tailwind] ←SSE→ [AgentCore Runtime]
                                              │
                                              ├── Strands Agent (Python)
                                              ├── Claude Sonnet 4.5
                                              └── Marp CLI (PDF変換)
```

### インフラ構成

| リソース | 設定 |
|---------|------|
| リージョン | us-east-1 |
| AgentCore Runtime | ARM64コンテナ |
| Bedrockモデル | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` |
| プロンプトキャッシュ | `cache_prompt="default"`, `cache_tools="default"` |
| 認証 | Cognito（本番のみ） |

### フロントエンド

| 項目 | 技術 |
|------|------|
| フレームワーク | React + TypeScript (Vite) |
| スタイリング | Tailwind CSS |
| 状態管理 | useState / useReducer |
| API通信 | fetch (SSE) |
| レスポンシブ | スマホ対応（スライドプレビューの自動縮小、タイトルバナー文字サイズ調整） |

### メタ情報（index.html）

| 項目 | 設定値 |
|------|--------|
| ファビコン | `/agentcore.png` |
| Apple Touch Icon | `/agentcore.png` |
| テーマカラー | `#1e1b4b`（深紫色） |
| OGP タイトル | "パワポ作るマン by みのるん" |
| OGP 説明 | "AIがMarp形式でスライドを自動生成。指示を出すだけでプレゼン資料が完成！" |
| OGP 画像 | `/ogp.jpg`（キャッシュ対策で `?v=2` 付与） |
| Twitter Card | summary（@minorun365）|

### PDF変換

AgentCoreコンテナ内でMarp CLIを実行：

```dockerfile
# Node.js + Marp CLI + 日本語フォント
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs \
    npm \
    chromium \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -fv

RUN npm install -g @marp-team/marp-cli

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
```

**注意**: `fonts-noto-cjk` がないとPDFで日本語が文字化け（豆腐文字）になる

---

## 5. 認証仕様

### 実装方針（更新）

```typescript
// モック使用フラグ（VITE_USE_MOCK=true で強制的にモック使用）
const useMock = import.meta.env.VITE_USE_MOCK === 'true';

// デフォルトは本番API、VITE_USE_MOCK=trueでモック使用
const invoke = useMock ? invokeAgentMock : invokeAgent;
```

### 認証フロー

1. Amplify Authenticatorコンポーネントでログイン画面を表示
2. Cognitoでユーザー認証
3. アクセストークンを取得してAgentCore APIにBearer認証で送信

### Cognito設定

- Cognito User Pool で認証
- 誰でもサインアップ可能
- メール確認必須
- AgentCore RuntimeのauthorizerConfigurationでCognito統合

### 認証画面のカスタマイズ

| 項目 | 内容 |
|------|------|
| ヘッダー | アプリ名「パワポ作るマン by みのるん」+ 利用ガイド |
| フッター | メールアドレスの利用目的（認証目的のみ） |

**実装**: Amplify UI ReactのAuthenticatorコンポーネントの`components`プロパティでカスタマイズ

### 認証画面の配色

| 要素 | 配色 |
|------|------|
| ボタン | グラデーション（`#1a3a6e` → `#5ba4d9`） |
| リンク | `#1a3a6e`、hover時 `#5ba4d9` |
| タブ（アクティブ） | 文字 `#1a3a6e`、ボーダー `#5ba4d9` |
| 入力フォーカス | ボーダー `#5ba4d9` |

**方針**: `createTheme`ではグラデーション非対応のため、CSS直接指定（`src/index.css`）

---

## 6. API仕様

### AgentCore Runtime呼び出し

**エンドポイント形式**
```
POST https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{URLエンコードARN}/invocations?qualifier={endpointName}
```

**URL構築例**
```typescript
const runtimeArn = outputs.custom?.agentRuntimeArn;
const encodedArn = encodeURIComponent(runtimeArn);
const url = `https://bedrock-agentcore.${region}.amazonaws.com/runtimes/${encodedArn}/invocations?qualifier=${endpointName}`;
```

**リクエストヘッダー**
```
Authorization: Bearer {cognitoAccessToken}
Content-Type: application/json
Accept: text/event-stream
```

**リクエストボディ**
```json
{
  "prompt": "AWS入門の5枚スライドを作って",
  "markdown": "現在のスライド（編集時）",
  "action": "chat",
  "session_id": "uuid-v4形式のセッションID"
}
```
- `action`: `"chat"`（通常チャット）または `"export_pdf"`（PDF生成）
- `session_id`: 画面更新まで同一のUUIDを使用し、会話履歴を保持

**レスポンス（SSE）**
```
data: {"type": "text", "data": "AWS入門の..."}

data: {"type": "tool_use", "data": "output_slide"}

data: {"type": "markdown", "data": "---\nmarp: true\n..."}

data: {"type": "tool_use", "data": "generate_tweet_url"}

data: {"type": "tweet_url", "data": "https://twitter.com/intent/tweet?text=..."}

data: {"type": "done"}
```

---

## 7. 技術的懸念点・考慮事項

### 7.1 コンテナサイズ（重要度: 高）

| 項目 | 内容 |
|------|------|
| 問題 | Marp CLI + Chromium でイメージが巨大化（1GB超の可能性） |
| 影響 | AgentCoreのコールドスタートが遅くなる |
| 対策案 | 軽量ベースイメージ、Chromium最小構成、PDF変換を別サービスに切り出し |
| MVP方針 | まずは動くものを作り、問題が出たら最適化 |

### 7.2 PDF生成のタイムアウト（重要度: 中）

| 項目 | 内容 |
|------|------|
| 問題 | スライド枚数が多いとPDF変換に時間がかかる |
| 影響 | AgentCoreのタイムアウトに引っかかる可能性 |
| 対策案 | タイムアウト設定の調整、非同期変換 |
| MVP方針 | 10枚程度なら問題ないはず。様子見 |

### 7.3 マークダウン抽出ロジック（重要度: 中）

| 項目 | 内容 |
|------|------|
| 問題 | エージェント出力からMarpマークダウンを抽出する必要 |
| 影響 | 正規表現マッチングのエッジケース |
| 対策案 | プロンプトで ` ```markdown ` 出力を徹底、パースロジックの堅牢化 |

### 7.4 セッション管理（重要度: 中）

| 項目 | 内容 |
|------|------|
| 問題 | 会話履歴と現在のスライド状態の保持場所 |
| 選択肢 | フロントエンドのみ / バックエンドでセッション管理 |
| 実装方針 | バックエンド（agent.py）でセッションID別にメモリ管理（コンテナ再起動で消える） |

### 7.5 本番デプロイ（解決済み）

| 項目 | 内容 |
|------|------|
| 問題 | Amplify Console のデフォルトビルドイメージに Docker がない |
| 解決策 | カスタムビルドイメージを設定 |
| ビルドイメージ | `public.ecr.aws/codebuild/amazonlinux-x86_64-standard:5.0` |
| 方式 | `fromAsset()` をそのまま使用可能 |

### 7.6 Docker Hubレート制限（解決済み）

| 項目 | 内容 |
|------|------|
| 問題 | Amplify ConsoleのCodeBuildで `429 Too Many Requests` が発生 |
| 原因 | Docker Hubの未認証pullにレート制限あり。共有IP環境で制限に引っかかりやすい |
| 解決策 | Amazon ECR Public Galleryのイメージを使用 |

```dockerfile
# NG: Docker Hub（レート制限あり）
FROM python:3.13-slim-bookworm

# OK: ECR Public Gallery（AWS環境からは制限なし）
FROM public.ecr.aws/docker/library/python:3.13-slim-bookworm
```

### 7.7 sandbox環境でPDFテーマが適用されない（解決済み）

| 項目 | 内容 |
|------|------|
| 問題 | ローカルsandbox環境でダウンロードしたPDFにカスタムテーマ（border）が適用されない |
| 原因 | Dockerイメージがキャッシュされており、`border.css`追加前の古いイメージが使われている |
| 解決策 | sandboxを削除して再起動（Dockerイメージを再ビルド） |

```bash
# sandbox削除
npx ampx sandbox delete --yes

# 再起動（Dockerイメージが再ビルドされる）
npx ampx sandbox
```

### 7.8 ストリーミングカーソルが折り返される（解決済み）

| 項目 | 内容 |
|------|------|
| 問題 | テキスト入力中のカーソル（▌）がツール使用前に次の行に折り返される |
| 原因 | ReactMarkdownが`<p>`タグを生成し、カーソルの`<span>`が外側に配置される |
| 解決策 | カーソルをReactMarkdownに渡す文字列の末尾に含める |

```tsx
// NG: カーソルがReactMarkdownの外側
<ReactMarkdown>{message.content}</ReactMarkdown>
{message.isStreaming && <span>▌</span>}

// OK: カーソルをマークダウン文字列に含める
<ReactMarkdown>
  {message.content + (message.isStreaming ? ' ▌' : '')}
</ReactMarkdown>
```

---

## 7.9 本番デプロイ手順

### 1. package.json overrides追加

```json
{
  "overrides": {
    "@aws-cdk/toolkit-lib": "1.14.0",
    "@smithy/core": "^3.21.0"
  }
}
```

### 2. Amplify Console設定

1. Amplify Console → 対象アプリを作成
2. **Hosting** → **Build settings** → **Build image settings** → **Edit**
3. **Build image** → **Custom Build Image** を選択
4. イメージ名: `public.ecr.aws/codebuild/amazonlinux-x86_64-standard:5.0`
5. **Save**

### 3. 環境変数設定

Amplify Console → **Environment variables** で設定:

| 変数名 | 説明 |
|--------|------|
| `TAVILY_API_KEY` | Web検索API用（1つ目） |
| `TAVILY_API_KEY2` | Web検索API用（2つ目、フォールバック） |
| `TAVILY_API_KEY3` | Web検索API用（3つ目、フォールバック） |

**Amplify環境変数の更新時の注意事項**:
- CLIで更新する場合、`aws amplify update-app --environment-variables` は**全変数を指定する必要がある**（指定しなかった変数は削除される）
- 環境変数の更新は**コードプッシュ（デプロイ）より先に実行**すること（デプロイ時にCDKが環境変数を参照するため）

### 4. ブランチ連携

- GitHubリポジトリを連携
- `main` ブランチをデプロイ対象に設定
- 自動ビルド有効化

---

## 8. 今後の拡張（Phase 2）

- [x] チャット応答のマークダウンレンダリング（react-markdown）
- [ ] マークダウン編集機能（シンタックスハイライト付き）
- [ ] テーマ選択（default / gaia / uncover）
- [ ] 画像アップロード・挿入
- [ ] スライド履歴管理
- [ ] HTML / PPTX 出力対応

---

## 9. テスト仕様

### E2Eテスト

テストチェックリスト: `tests/e2e-test.md`

| TC | テスト名 | 確認内容 |
|:---|:--------|:---------|
| TC1 | 認証画面表示 | タイトル、日本語UI、コンソールエラーなし |
| TC2 | ログイン後のメイン画面 | チャットUI、ログアウトボタン |
| TC3 | スライド生成（基本） | ステータス遷移、プレビュー表示 |
| TC4 | Web検索付きスライド生成 | Web検索→スライド生成のステータス遷移 |
| TC5 | PDFダウンロード | PDF生成、日本語表示 |

### テスト実行方法

```bash
# Playwright MCPを使用した自動テスト
# Claude Codeのapp-test-debug-agentで実行

# スクリーンショット保存先
tests/screenshots/  # .gitignoreで除外
```
