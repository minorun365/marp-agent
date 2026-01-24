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
| エージェント | ツール | web_search（Tavily）, output_slide |
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
   └─ チャットで修正指示

4. PDFダウンロード
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

| 状態 | テキスト | アイコン |
|------|---------|---------|
| 初期思考中 | 「考え中...」 | なし（テキストエリアに表示） |
| Web検索中 | 「Web検索中...」 | スピナー（回転アニメーション） |
| Web検索完了 | 「Web検索完了」 | チェックマーク（緑色✓） |
| スライド生成中 | 「スライドを生成中...」 | スピナー（回転アニメーション） |
| スライド生成完了 | 「スライドを生成しました」 | チェックマーク（緑色✓） |

**重複防止**: 同じステータスが複数回表示されないよう、追加前に既存チェックを行う

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
| `web_search` | Tavily APIを使用したWeb検索。最新情報の取得に使用 |
| `output_slide` | 生成したMarpマークダウンを出力するツール。テキストで直接出力せずこのツール経由で出力 |

### システムプロンプト

```markdown
あなたは「パワポ作るマン」、プロフェッショナルなスライド作成AIアシスタントです。

## 役割
ユーザーの指示に基づいて、Marp形式のマークダウンでスライドを作成・編集します。
デザインや構成についてのアドバイスも積極的に行います。

## スライド作成ルール
- フロントマターには以下を含める：
  ```yaml
  ---
  marp: true
  theme: border
  size: 16:9
  paginate: true
  ---
  ```
- スライド区切りは `---` を使用
- 1枚目はタイトルスライド（タイトル + サブタイトル）
- 箇条書きは1スライドあたり3〜5項目に抑える
- 絵文字は使用しない（シンプルでビジネスライクに）
- 情報は簡潔に、キーワード中心で

## Web検索
最新の情報が必要な場合や、リクエストに不明点がある場合は、web_searchツールを使って調べてからスライドを作成してください。
ユーザーが「〇〇について調べて」「最新の〇〇」などと言った場合は積極的に検索を活用します。

## 重要：スライドの出力方法
スライドを作成・編集したら、必ず output_slide ツールを使ってマークダウンを出力してください。
テキストでマークダウンを直接書き出さないでください。output_slide ツールに渡すマークダウンには、フロントマターを含む完全なMarp形式のマークダウンを指定してください。

## その他
- 現在は2026年です。
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
| 認証 | Cognito（本番のみ） |

### フロントエンド

| 項目 | 技術 |
|------|------|
| フレームワーク | React + TypeScript (Vite) |
| スタイリング | Tailwind CSS |
| 状態管理 | useState / useReducer |
| API通信 | fetch (SSE) |

### メタ情報（index.html）

| 項目 | 設定値 |
|------|--------|
| ファビコン | `/agentcore.png` |
| Apple Touch Icon | `/agentcore.png` |
| テーマカラー | `#1e1b4b`（深紫色） |
| OGP タイトル | "パワポ作るマン by みのるん" |
| OGP 説明 | "AIがMarp形式でスライドを自動生成。指示を出すだけでプレゼン資料が完成！" |
| OGP 画像 | `/minorun.jpg` |
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
  "markdown": "現在のスライド（編集時）"
}
```

**レスポンス（SSE）**
```
data: {"type": "text", "data": "AWS入門の..."}

data: {"type": "tool_use", "data": "output_slide"}

data: {"type": "markdown", "data": "---\nmarp: true\n..."}

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

---

## 7.7 本番デプロイ手順

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
| `TAVILY_API_KEY` | Web検索API用 |

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
