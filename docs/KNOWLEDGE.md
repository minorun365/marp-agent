# ナレッジベース

開発中に得られた知見・調査結果をここに蓄積していく。

---

## 使用ライブラリ・SDK

**方針**: すべて最新版を使用する

### フロントエンド
- React
- TypeScript
- Vite
- Tailwind CSS v4（ゼロコンフィグ、@theme でカスタムカラー定義）

### AWS Amplify
- @aws-amplify/backend
- @aws-amplify/ui-react

### エージェント・インフラ
- strands-agents（Python >=3.10）
- bedrock-agentcore（AgentCore SDK）
- @marp-team/marp-cli
- @aws-cdk/aws-bedrock-agentcore-alpha

---

## Python環境管理（uv）

### 概要
- Rustで書かれた高速なPythonパッケージマネージャー
- pip/venv/pyenvの代替

### 基本コマンド
```bash
# プロジェクト初期化
uv init --no-workspace

# 依存追加
uv add strands-agents bedrock-agentcore

# スクリプト実行
uv run python script.py
```

### AWS CLI login 認証を使う場合
```bash
uv add 'botocore[crt]'
```
※ `aws login` で認証した場合、botocore[crt] が必要

---

## Bedrock AgentCore SDK（Python）

### 基本構造
```python
from bedrock_agentcore import BedrockAgentCoreApp
from strands import Agent

app = BedrockAgentCoreApp()
agent = Agent(model=_get_model_id())

@app.entrypoint
async def invoke(payload):
    prompt = payload.get("prompt", "")
    stream = agent.stream_async(prompt)
    async for event in stream:
        yield event

if __name__ == "__main__":
    app.run()  # ポート8080でリッスン
```

### 必要な依存関係（requirements.txt）
```
bedrock-agentcore
strands-agents
tavily-python
```
※ fastapi/uvicorn は不要（SDKに内包）
※ `aws login` 認証を使う場合は `botocore[crt]` も必要（pyproject.tomlに追加済み）

### エンドポイント
- `POST /invocations` - エージェント実行
- `GET /ping` - ヘルスチェック

---

## Strands Agents

### 基本情報
- AWS が提供する AI エージェントフレームワーク
- Python で実装
- Bedrock モデルと統合

### Agent作成
```python
from strands import Agent

agent = Agent(
    model=_get_model_id(),
    system_prompt="あなたはアシスタントです",
)
```

### ストリーミング
```python
async for event in agent.stream_async(prompt):
    if "data" in event:
        print(event["data"], end="", flush=True)
```

### イベントタイプ
- `data`: テキストチャンク
- `current_tool_use`: ツール使用情報
- `result`: 最終結果

### 会話履歴の保持（セッション管理）

Strands Agentは同じインスタンスを使い続けると会話履歴を自動的に保持する。複数ユーザー/セッション対応のため、セッションIDごとにAgentインスタンスを管理する方式が有効。

#### AgentCore Runtimeのスティッキーセッション機能（重要）

AgentCore Runtimeは**HTTPヘッダーでセッションIDを渡す**ことで、同じセッションIDのリクエストを**同じコンテナにルーティング**する（スティッキーセッション）。これにより、メモリ内のAgentインスタンスが保持され、会話履歴が維持される。

**⚠️ 注意**: リクエストボディに`session_id`を入れても**スティッキーセッションは機能しない**。必ずHTTPヘッダーで渡すこと。

#### フロントエンド実装

```typescript
// App.tsx - 画面読み込み時にセッションIDを生成
const [sessionId] = useState(() => crypto.randomUUID());

// HTTPヘッダーでセッションIDを渡す（スティッキーセッション用）
const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    // ★ このヘッダーが重要！ボディに入れてもスティッキーセッションは効かない
    'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': sessionId,
  },
  body: JSON.stringify({ prompt, markdown }),
});
```

#### バックエンド実装

```python
# セッションごとのAgentインスタンスを管理
_agent_sessions: dict[str, Agent] = {}

def get_or_create_agent(session_id: str | None) -> Agent:
    """セッションIDに対応するAgentを取得または作成"""
    if not session_id:
        return Agent(model=MODEL_ID, system_prompt=PROMPT, tools=TOOLS)

    if session_id in _agent_sessions:
        return _agent_sessions[session_id]

    agent = Agent(model=MODEL_ID, system_prompt=PROMPT, tools=TOOLS)
    _agent_sessions[session_id] = agent
    return agent

@app.entrypoint
async def invoke(payload, context=None):
    # セッションIDはHTTPヘッダー経由でcontextから取得
    session_id = getattr(context, 'session_id', None) if context else None
    agent = get_or_create_agent(session_id)
    # ...
```

#### セッションの有効期限

- **非アクティブタイムアウト**: 15分（15分間リクエストがないとコンテナ終了）
- **最大継続時間**: 8時間（どれだけアクティブでも8時間でコンテナ終了）

**注意**: コンテナ再起動でセッション（メモリ内のAgent）は消える。永続化が必要な場合はDynamoDB等を検討。

### SSEレスポンス形式（AgentCore経由）

AgentCore Runtime経由でストリーミングする場合、以下の形式でイベントが返される：

```
data: {"type": "text", "data": "テキストチャンク"}
data: {"type": "tool_use", "data": "ツール名"}
data: {"type": "markdown", "data": "生成されたマークダウン"}
data: {"type": "tweet_url", "data": "https://twitter.com/intent/tweet?text=..."}
data: {"type": "error", "error": "エラーメッセージ"}
data: {"type": "done"}
```

### resultイベントからのテキスト抽出

ツール使用後にLLMが追加のテキストを返す場合、`data` イベントではなく `result` イベントに含まれることがある。
`result.message.content` からテキストを抽出する処理が必要：

```python
elif "result" in event:
    result = event["result"]
    if hasattr(result, 'message') and result.message:
        for content in getattr(result.message, 'content', []):
            if hasattr(content, 'text') and content.text:
                yield {"type": "text", "data": content.text}
```

### web_searchのエラーハンドリング（レートリミット対応）

Tavily APIのレートリミット（無料枠超過）を検出してユーザーフレンドリーなメッセージを返す：

```python
@tool
def web_search(query: str) -> str:
    try:
        # 検索処理...
    except Exception as e:
        error_str = str(e).lower()
        # レートリミット（無料枠超過）を検出
        if "rate limit" in error_str or "429" in error_str or "quota" in error_str:
            return "現在、利用殺到でみのるんの検索API無料枠が枯渇したようです。修正をお待ちください"
        return f"検索エラー: {str(e)}"
```

システムプロンプトにもエラー時の対応ルールを追加：

```
## 検索エラー時の対応
web_searchツールがエラーを返した場合：
1. エラー原因をユーザーに伝える
2. 一般的な知識や推測でスライド作成せず、修正待ちを案内
3. スライド作成は行わず、エラー報告のみで終了
```

### ツール駆動型のマークダウン出力

マークダウンをテキストでストリーミング出力すると、フロントエンドで除去処理が複雑になる。
代わりに `output_slide` ツールを使ってマークダウンを出力し、フロントエンドでは `tool_use` イベントを検知してステータス表示する方式が有効。

```python
@tool
def output_slide(markdown: str) -> str:
    """生成したスライドのマークダウンを出力します。"""
    global _generated_markdown
    _generated_markdown = markdown
    return "スライドを出力しました。"
```

**注意**: イベントのペイロードは `content` または `data` フィールドに格納される。両方に対応するコードが必要：

```typescript
const textValue = event.content || event.data;
```

---

## AgentCore Runtime CDK（TypeScript）

### パッケージ
```bash
npm install @aws-cdk/aws-bedrock-agentcore-alpha
```

### Runtime定義
```typescript
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import * as path from 'path';

// ローカルDockerイメージからビルド（ARM64必須）
const artifact = agentcore.AgentRuntimeArtifact.fromAsset(
  path.join(__dirname, 'agent/runtime')
);

const runtime = new agentcore.Runtime(stack, 'MarpAgent', {
  runtimeName: 'marp-agent',
  agentRuntimeArtifact: artifact,
});

// エンドポイントはDEFAULTを使用（addEndpoint不要）
// runtime.addEndpoint() を呼ぶと不要なエンドポイントが増えるため注意
```

### Runtimeクラスのプロパティ
| プロパティ | 説明 |
|-----------|------|
| `agentRuntimeArn` | Runtime ARN |
| `agentRuntimeId` | Runtime ID |
| `agentRuntimeName` | Runtime名 |
| `role` | IAMロール |

※ `runtimeArn` や `invokeUrl` は存在しない（alpha版の注意点）

### RuntimeEndpointクラスのプロパティ
| プロパティ | 説明 |
|-----------|------|
| `agentRuntimeEndpointArn` | Endpoint ARN |
| `endpointName` | Endpoint名 |
| `agentRuntimeArn` | 親RuntimeのARN |

### Cognito認証統合
```typescript
authorizerConfiguration: agentcore.RuntimeAuthorizerConfiguration.usingCognito(
  userPool,
  [userPoolClient]
)
```

### Bedrockモデル権限付与
```typescript
runtime.addToRolePolicy(new iam.PolicyStatement({
  actions: [
    'bedrock:InvokeModel',
    'bedrock:InvokeModelWithResponseStream',
  ],
  resources: [
    'arn:aws:bedrock:*::foundation-model/*',      // 基盤モデル
    'arn:aws:bedrock:*:*:inference-profile/*',    // 推論プロファイル（クロスリージョン推論）
  ],
}));
```

**重要**: クロスリージョン推論（`us.`/`jp.`等のプレフィックス付きモデルID）を使用する場合、`inference-profile/*` リソースへの権限も必要。`foundation-model/*` だけでは `AccessDeniedException` が発生する。

### Amplify Gen2との統合
```typescript
// amplify/backend.ts
const backend = defineBackend({ auth });
const stack = backend.createStack('AgentCoreStack');

// Amplifyの認証リソースを参照
const userPool = backend.auth.resources.userPool;
const userPoolClient = backend.auth.resources.userPoolClient;
```

---

## CDK Hotswap × AgentCore Runtime

### 概要
- 2025/1/24、CDK hotswap が Bedrock AgentCore Runtime に対応
- k.goto さん（@365_step_tech）による実装・調査

### 参考リンク
- [CDK Hotswap × AgentCore Runtime](https://go-to-k.hatenablog.com/entry/cdk-hotswap-bedrock-agentcore-runtime)

### 対応状況（2026/1時点）

| 項目 | 状況 |
|------|------|
| CDK hotswap | AgentCore Runtime 対応済み（v1.14.0〜） |
| Amplify toolkit-lib | まだ対応バージョン（1.14.0）に未更新 |
| ECRソースのバグ | AWS SDK（smithy/core）のリグレッション。近々自動修正見込み |
| Amplify Console | Docker build 未サポート |

### Amplify との組み合わせ

#### sandbox 環境
- `AgentRuntimeArtifact.fromAsset` でローカルビルド可能
- Mac ARM64 でビルドできるなら `deploy-time-build` は不要
- Amplify の toolkit-lib 更新後は hotswap も使える

#### sandbox環境でDockerイメージがキャッシュされる問題

**症状**: Dockerfileに新しいファイル（例: `border.css`）を追加しても、sandbox環境で反映されない

**原因**: HotswapはPythonコードの変更は検知するが、Dockerイメージの再ビルドは自動では行わない

**解決策**: sandboxを完全に削除して再起動

```bash
# sandbox削除（Dockerイメージも削除される）
npx ampx sandbox delete --yes

# 再起動（Dockerイメージが再ビルドされる）
npx ampx sandbox
```

#### Amplify で Hotswap を先行利用する方法（Workaround）

Amplify の公式アップデートを待たずに試す場合、`package.json` の `overrides` を使用：

```json
{
  "overrides": {
    "@aws-cdk/toolkit-lib": "1.14.0",
    "@smithy/core": "^3.21.0"
  }
}
```

| パッケージ | バージョン | 理由 |
|-----------|-----------|------|
| `@aws-cdk/toolkit-lib` | `1.14.0` | AgentCore Hotswap 対応版 |
| `@smithy/core` | `^3.21.0` | AWS SDK のリグレッションバグ対応 |

**注意**: 正攻法ではないのでお試し用途。Amplify の公式アップデートが来たら overrides を削除する。

参考: [go-to-k/amplify-agentcore-cdk](https://github.com/go-to-k/amplify-agentcore-cdk)

#### 本番環境（Amplify Console）
- Docker build 未サポートのため工夫が必要
- 選択肢：
  1. GitHub Actions で ECR プッシュ → CDK で ECR 参照
  2. sandbox と main でビルド方法を分岐
  3. Amplify Console の Docker 対応を待つ

---

## Marp CLI

### 基本情報
- Markdown からスライドを生成するツール
- PDF / HTML / PPTX 出力対応
- 公式: https://marp.app/

### Docker内での設定
```dockerfile
RUN apt-get update && apt-get install -y chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
```

### Marp フロントマター
```yaml
---
marp: true
theme: border
size: 16:9
paginate: true
---
```

### 組み込みテーマ
| テーマ | 特徴 |
|--------|------|
| default | シンプルな白背景 |
| gaia | クラシックなデザイン |
| uncover | ミニマル・モダン |

### borderテーマ（コミュニティテーマ）

本プロジェクトで採用しているカスタムテーマ。

**特徴**:
- グレーのグラデーション背景（`#f7f7f7` → `#d3d3d3`）
- 濃いグレーの太枠線（`#303030`）
- 白いアウトライン
- Interフォント（Google Fonts）
- `<!-- _class: tinytext -->` で参考文献用の小さいテキスト対応

**ファイル配置**:
- `src/themes/border.css` - フロントエンド（Marp Core）用
- `amplify/agent/runtime/border.css` - PDF/PPTX生成（Marp CLI）用

**参考**: https://rnd195.github.io/marp-community-themes/theme/border.html

### カスタムテーマのBase64埋め込み

背景画像を含むテーマをポータブルにするには、Base64データURIに変換して埋め込む：

```bash
# 画像をBase64変換
base64 -i background.png | tr -d '\n' > bg_b64.txt

# CSSのURL置換
url('../img/background.png')
↓
url('data:image/png;base64,{Base64データ}')
```

**注意**: 画像が複数あるとCSSファイルが数MB級になる。Git管理には注意。

### ブランチ別テーマ切り替え

環境変数でテーマを切り替える実装パターン：

```typescript
// amplify/backend.ts
const themeName = process.env.MARP_THEME || (branchName === 'kag' ? 'kag' : 'border');
```

| 環境 | コマンド | テーマ |
|------|---------|--------|
| sandbox | `npx ampx sandbox` | border |
| sandbox | `MARP_THEME=kag npx ampx sandbox` | kag |
| 本番 | Amplify Console | ブランチ名で自動判定 |

**フロントエンド側**:
```typescript
// SlidePreview.tsx
import borderTheme from '../themes/border.css?raw';
import kagTheme from '../themes/kag.css?raw';
import outputs from '../../amplify_outputs.json';

const themeName = outputs.custom?.themeName || 'border';
const themeMap = { border: borderTheme, kag: kagTheme };
const currentTheme = themeMap[themeName] || borderTheme;

marp.themeSet.add(currentTheme);
```

---

## Cognito Pre Sign-up Trigger

### メールドメイン制限

特定のメールドメインのみアカウント登録を許可する：

```typescript
// amplify/auth/pre-sign-up/handler.ts
import type { PreSignUpTriggerHandler } from 'aws-lambda';

const ALLOWED_DOMAIN = 'example.com';

export const handler: PreSignUpTriggerHandler = async (event) => {
  const email = event.request.userAttributes.email;
  const domain = email?.split('@')[1]?.toLowerCase();

  if (domain !== ALLOWED_DOMAIN) {
    throw new Error(`このサービスは @${ALLOWED_DOMAIN} のメールアドレスでのみ登録できます`);
  }

  return event;
};
```

```typescript
// amplify/auth/pre-sign-up/resource.ts
import { defineFunction } from '@aws-amplify/backend';

export const preSignUp = defineFunction({
  name: 'pre-sign-up',
  entry: './handler.ts',
});
```

```typescript
// amplify/auth/resource.ts
import { defineAuth } from '@aws-amplify/backend';
import { preSignUp } from './pre-sign-up/resource';

export const auth = defineAuth({
  loginWith: { email: true },
  triggers: { preSignUp },
});
```

**必要な依存**:
```bash
npm install --save-dev @types/aws-lambda
```

---

## Tailwind CSS v4

### Vite統合
```typescript
// vite.config.ts
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

### カスタムカラー定義
```css
/* src/index.css */
@import "tailwindcss";

@theme {
  --color-kag-blue: #0e0d6a;
}
```

### グラデーション定義
```css
/* カスタムクラスとして定義 */
.bg-kag-gradient {
  background: linear-gradient(to right, #1a3a6e, #5ba4d9);
}

.btn-kag {
  background: linear-gradient(to right, #1a3a6e, #5ba4d9);
  transition: all 0.2s;
}

.btn-kag:hover {
  background: linear-gradient(to right, #142d54, #4a93c8);
}
```

### 使用方法
```jsx
<header className="bg-kag-gradient">ヘッダー</header>
<button className="btn-kag text-white">送信</button>
```

---

## Marp Core（フロントエンド用）

### インストール
```bash
npm install @marp-team/marp-core
```

### ブラウザでのレンダリング
```typescript
import Marp from '@marp-team/marp-core';

const marp = new Marp();
const { html, css } = marp.render(markdown);

// SVG要素をそのまま抽出（DOM構造を維持）
const parser = new DOMParser();
const doc = parser.parseFromString(html, 'text/html');
const svgs = doc.querySelectorAll('svg[data-marpit-svg]');
```

### スライドプレビュー表示
```tsx
<style>{css}</style>
<div className="marpit w-full h-full [&>svg]:w-full [&>svg]:h-full">
  <div dangerouslySetInnerHTML={{ __html: svg.outerHTML }} />
</div>
```

**注意点**:
- `section`だけ抽出するとCSSセレクタがマッチしない（`div.marpit > svg > foreignObject > section`構造が必要）
- SVG要素をそのまま使い、`div.marpit`でラップする
- SVGにはwidth/height属性がないため、CSSで`w-full h-full`を指定

### スマホ対応（レスポンシブ）

MarpのSVGは固定サイズ（1280x720px）の`width`/`height`属性を持っているため、スマホの狭い画面では見切れてしまう。

**解決策**: SVGの属性を動的に変更してレスポンシブ対応

```typescript
// SlidePreview.tsx
const svgs = doc.querySelectorAll('svg[data-marpit-svg]');

return {
  slides: Array.from(svgs).map((svg, index) => {
    // SVGのwidth/height属性を100%に変更してレスポンシブ対応
    svg.setAttribute('width', '100%');
    svg.removeAttribute('height');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    return {
      index,
      html: svg.outerHTML,
    };
  }),
  css,
};
```

**ポイント**:
- `width`と`height`を`100%`に設定 → 親要素にフィット
- `preserveAspectRatio="xMidYMid meet"` → アスペクト比を維持しつつ収まるように
- CSSの`!important`よりもSVG属性の直接変更が確実

### Tailwind CSS との競合

#### invertクラスの競合
Marpの`class: invert`とTailwindの`.invert`ユーティリティが競合する。

```css
/* src/index.css に追加 */
.marpit section.invert {
  filter: none !important;
}
```

これでTailwindの`filter: invert(100%)`を無効化し、Marpのダークテーマが正しく表示される。

#### 箇条書き（リストスタイル）の競合
Tailwind CSS v4のPreflight（CSSリセット）が`list-style: none`を適用するため、Marpスライド内の箇条書きビュレット（●○■）が消える。

```css
/* src/index.css に追加 */
.marpit ul {
  list-style: disc !important;
}

.marpit ol {
  list-style: decimal !important;
}

/* ネストされたリストのスタイル */
.marpit ul ul,
.marpit ol ul {
  list-style: circle !important;
}

.marpit ul ul ul,
.marpit ol ul ul {
  list-style: square !important;
}
```

### Marp記法の注意点

#### `==ハイライト==` 記法は使用禁止
Marpの `==テキスト==` ハイライト記法は、日本語のカギカッコと組み合わせるとレンダリングが壊れる。

```markdown
<!-- NG: 正しく表示されない -->
==「重要」==

<!-- OK: 太字を使う -->
**「重要」**
```

システムプロンプトで禁止指示済み。

---

## フロントエンド構成

### コンポーネント構成
```
src/
├── App.tsx              # メイン（タブ切り替え、状態管理）
├── components/
│   ├── Chat.tsx         # チャットUI（ストリーミング対応）
│   └── SlidePreview.tsx # スライドプレビュー
└── hooks/               # カスタムフック（今後追加）
```

### 状態管理
- `markdown`: 生成されたMarpマークダウン
- `activeTab`: 現在のタブ（chat / preview）
- `isDownloading`: PDF/PPTX生成中フラグ

### ダウンロード機能
プレビュー画面のヘッダーにドロップダウンメニューでダウンロード形式を選択：
- **PDF形式**: `exportPdf()` → バックエンド `action: 'export_pdf'` → Marp CLI `--pdf`
- **PPTX形式**: `exportPptx()` → バックエンド `action: 'export_pptx'` → Marp CLI `--pptx`

※ `--pptx-editable`（編集可能PPTX）はLibreOffice依存のため未対応

**iOS Safari対応**: ドロップダウンメニューはCSS `:hover` ではなく `useState` によるクリック/タップベースで実装。iOS Safariでは `:hover` がタップで正しく動作しないため、`onClick` でメニューを開閉し、`touchstart` イベントで外側タップ時に閉じる処理を実装。

### ストリーミングUI実装パターン
```typescript
// メッセージを逐次更新（イミュータブル更新が必須）
setMessages(prev =>
  prev.map((msg, idx) =>
    idx === prev.length - 1 && msg.role === 'assistant'
      ? { ...msg, content: msg.content + chunk }
      : msg
  )
);
```

**注意**: シャローコピー（`[...prev]`）してオブジェクトを直接変更すると、React StrictModeで2回実行され文字がダブる。必ず `map` + スプレッド構文でイミュータブルに更新する。

### ステータスメッセージ後のテキスト表示

ツール使用後にLLMが追加のテキスト（エラー報告など）を返す場合、ステータスメッセージの後に新しいメッセージとして追加する処理が必要：

```typescript
onText: (text) => {
  setMessages(prev => {
    // ステータスメッセージと非ステータスメッセージの位置を探す
    let lastStatusIdx = -1;
    let lastTextAssistantIdx = -1;
    for (let i = prev.length - 1; i >= 0; i--) {
      if (prev[i].isStatus && lastStatusIdx === -1) lastStatusIdx = i;
      if (prev[i].role === 'assistant' && !prev[i].isStatus && lastTextAssistantIdx === -1) {
        lastTextAssistantIdx = i;
      }
    }
    // ステータスの後にテキストがなければ新規メッセージを追加
    if (lastStatusIdx !== -1 && lastTextAssistantIdx < lastStatusIdx) {
      return [...prev, { role: 'assistant', content: text, isStreaming: true }];
    }
    // それ以外は既存メッセージに追加
    // ...
  });
};
```

### シマーエフェクト（ローディングアニメーション）

「考え中...」などのステータステキストに光が左から右に流れるエフェクトを適用：

```css
/* src/index.css */
.shimmer-text {
  background: linear-gradient(
    90deg,
    #6b7280 0%,
    #6b7280 40%,
    #9ca3af 50%,
    #6b7280 60%,
    #6b7280 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shimmer 1.5s ease-in-out infinite;
}

@keyframes shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
```

使用例：
```tsx
<span className="shimmer-text font-medium">{status}</span>
```

### ReactMarkdownでのカーソル表示

ストリーミング中のカーソル（▌）をReactMarkdownの外側に配置すると、`<p>`タグの後に配置されて改行されてしまう。

```tsx
// NG: カーソルが次の行に折り返される
<ReactMarkdown>{message.content}</ReactMarkdown>
{message.isStreaming && <span>▌</span>}

// OK: カーソルをマークダウン文字列に含める
<ReactMarkdown>
  {message.content + (message.isStreaming ? ' ▌' : '')}
</ReactMarkdown>
```

### ReactMarkdownでリンクを新しいタブで開く

マークダウン内のリンクをクリックした時に新しいタブで開くには、`components`プロパティでカスタムリンクレンダラーを設定する。

```tsx
<ReactMarkdown
  components={{
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
  }}
>
  {message.content}
</ReactMarkdown>
```

**用途**: Xシェア機能のツイートリンクなど、外部サイトへのリンクを新しいタブで開く場合に使用。

### タブ切り替え時の状態保持
```tsx
// NG: 条件レンダリングだとアンマウント時に状態が消える
{activeTab === 'chat' ? <Chat /> : <Preview />}

// OK: hiddenクラスで非表示にすれば状態が保持される
<div className={activeTab === 'chat' ? '' : 'hidden'}>
  <Chat />
</div>
<div className={activeTab === 'preview' ? '' : 'hidden'}>
  <Preview />
</div>
```

### Amplify UI Authenticatorのカスタマイズ

Cognito認証画面のヘッダー/フッターをカスタマイズして、アプリ名やメールアドレスの利用目的を表示できる。

```tsx
const authComponents = {
  Header() {
    return (
      <div className="text-center py-4">
        <h1 className="text-2xl font-bold text-gray-800">アプリ名</h1>
        <p className="text-sm text-gray-500 mt-1">
          誰でもアカウントを作って利用できます！（1日50人まで）
        </p>
      </div>
    );
  },
  Footer() {
    return (
      <div className="text-center py-3 px-4">
        <p className="text-xs text-gray-400 leading-relaxed">
          登録されたメールアドレスは認証目的でのみ使用します。
        </p>
      </div>
    );
  },
};

<Authenticator components={authComponents}>
  {({ signOut }) => <MainApp signOut={signOut} />}
</Authenticator>
```

**用途**:
- ヘッダー: アプリ名、利用ガイド
- フッター: プライバシーポリシー、免責事項

### Amplify UI 配色のカスタマイズ（CSS方式）

`createTheme`/`ThemeProvider`ではグラデーションが使えないため、CSSで直接スタイリングするのが確実。

```css
/* src/index.css */

/* プライマリボタン（グラデーション対応） */
[data-amplify-authenticator] .amplify-button--primary {
  background: linear-gradient(to right, #1a3a6e, #5ba4d9);
  border: none;
}

[data-amplify-authenticator] .amplify-button--primary:hover {
  background: linear-gradient(to right, #142d54, #4a93c8);
}

/* リンク（パスワードを忘れた等） */
[data-amplify-authenticator] .amplify-button--link {
  color: #1a3a6e;
}

[data-amplify-authenticator] .amplify-button--link:hover {
  color: #5ba4d9;
  background: transparent;
}

/* タブ（サインイン/サインアップ切り替え） */
[data-amplify-authenticator] .amplify-tabs__item--active {
  color: #1a3a6e;
  border-color: #5ba4d9;
}

/* 入力フォーカス */
[data-amplify-authenticator] input:focus {
  border-color: #5ba4d9;
  box-shadow: 0 0 0 2px rgba(91, 164, 217, 0.2);
}
```

**方針**:
- `createTheme`ではなくCSS直接指定（グラデーション対応のため）
- `[data-amplify-authenticator]`セレクタで認証画面のみに適用
- アプリ本体と同じ配色（`#1a3a6e` → `#5ba4d9`）を使用

---

## API接続実装 ✅ 完了

### 概要
フロントエンド（React）からAgentCoreエンドポイントを呼び出す。

### 実装状況（2026/1/24）

#### Phase 1: sandbox起動 ✅ 完了
- `amplify/backend.ts` に `addOutput()` を追加済み
- `npx ampx sandbox` 実行済み
- CloudFormationスタック: `UPDATE_COMPLETE`

#### Phase 2: API接続実装 ✅ 完了
- `src/main.tsx` にAmplify初期化を追加
- `src/hooks/useAgentCore.ts` を新規作成
- `src/components/Chat.tsx` を修正

#### Phase 3: 環境分岐 ✅ 完了
- `AWS_BRANCH` 環境変数で sandbox/本番を判定
- リソース名にサフィックス追加（例: `marp_agent_dev`）
- `amplify_outputs.json` に `environment` フィールド追加

#### デプロイ済みリソース（sandbox環境）
- **Runtime名**: `marp_agent_dev`（sandbox）/ `marp_agent_main`（本番予定）
- **Cognito User Pool**: `amplify_outputs.json` を参照
- **Cognito Client**: `amplify_outputs.json` を参照
- **Identity Pool**: `amplify_outputs.json` を参照

### 対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `amplify/backend.ts` | 環境判定 + `addOutput()` でエンドポイント情報追加 |
| `amplify/agent/resource.ts` | `nameSuffix` パラメータ追加 |
| `src/main.tsx` | Amplify初期化 |
| `src/hooks/useAgentCore.ts` | 新規作成（API呼び出しフック） |
| `src/components/Chat.tsx` | 実際のAPI呼び出しに置き換え |

#### Phase 4: 認証UI ✅ 完了
- `@aws-amplify/ui-react` をインストール
- `App.tsx` に `Authenticator` コンポーネントを追加
- ログアウトボタンを機能させる

### AgentCore呼び出しAPI仕様

#### エンドポイントURL形式（重要）

```
POST https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{URLエンコードされたARN}/invocations?qualifier={endpointName}
```

**注意**: ARNは `encodeURIComponent()` で完全にURLエンコードする必要がある。

```typescript
// 正しい例
const runtimeArn = "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/my_agent";
const encodedArn = encodeURIComponent(runtimeArn);
const url = `https://bedrock-agentcore.${region}.amazonaws.com/runtimes/${encodedArn}/invocations?qualifier=${endpointName}`;

// 結果: /runtimes/arn%3Aaws%3Abedrock-agentcore%3Aus-east-1%3A123456789012%3Aruntime%2Fmy_agent/invocations?qualifier=my_endpoint
```

#### 過去に試したNG例
| URL形式 | エラー |
|---------|--------|
| `/runtimes/{runtimeId}/invoke` | 404 |
| `/runtimes/{runtimeId}/invocations` | 400 (accountID required) |
| `/accounts/{accountId}/runtimes/{runtimeId}/invocations` | 404 (UnknownOperation) |
| `/runtimes/{encodedArn}/invocations` （ARNエンコードなし） | 404 |

#### ヘッダー
```
Authorization: Bearer {cognitoIdToken}
Content-Type: application/json
Accept: text/event-stream
```

#### リクエストボディ
```json
{
  "prompt": "ユーザーの入力",
  "markdown": "現在のスライド（編集時）"
}
```

#### 認証問題の解決 ✅

**現象**: Cognito認証で `Claim 'client_id' value mismatch with configuration.` エラーが発生

**根本原因**: IDトークンとアクセストークンのクレーム構造の違い

| トークン種別 | クライアントIDの格納先 |
|-------------|---------------------|
| IDトークン | `aud` クレーム |
| アクセストークン | `client_id` クレーム |

AgentCore RuntimeのJWT認証（`usingJWT`の`allowedClients`）は **`client_id`クレーム** を検証するため、**アクセストークン** を使用する必要がある。

**解決策**:
```typescript
// useAgentCore.ts
// NG: IDトークン
const idToken = session.tokens?.idToken?.toString();

// OK: アクセストークン
const accessToken = session.tokens?.accessToken?.toString();
```

**参考**: AWS公式ドキュメント
> Amazon Cognito renders the same value in the access token `client_id` claim as the ID token `aud` claim.

### Amplify Gen2 でカスタム出力を追加

```typescript
// amplify/backend.ts
const { endpoint } = createMarpAgent({ ... });

backend.addOutput({
  custom: {
    agentEndpointArn: endpoint.agentRuntimeEndpointArn,
  },
});
```

フロントエンドでアクセス:
```typescript
import outputs from '../amplify_outputs.json';
const endpointArn = outputs.custom?.agentEndpointArn;
```

---

---

## Observability（OTELトレース）

AgentCore Observability でトレースを出力するには、以下の3つすべてが必要。

### 1. requirements.txt

```
strands-agents[otel]          # otel extra が必要（strands-agents だけではNG）
aws-opentelemetry-distro      # ADOT
```

### 2. Dockerfile

```dockerfile
# OTELの自動計装を有効にして起動
CMD ["opentelemetry-instrument", "python", "agent.py"]
```

**注意**: `python agent.py` だけではOTELトレースが出力されない。

### 3. CDK環境変数

```typescript
environmentVariables: {
  AGENT_OBSERVABILITY_ENABLED: 'true',
  OTEL_PYTHON_DISTRO: 'aws_distro',
  OTEL_PYTHON_CONFIGURATOR: 'aws_configurator',
  OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
}
```

### 確認方法

CloudWatch Console → **Bedrock AgentCore GenAI Observability** → Agents View / Sessions View / Traces View

---

## Amplify ビルドスキップ（Diff-based Deploy）

### 概要

ドキュメントのみの変更でフロントエンドのビルド・デプロイを避けるための設定。

### 設定済み環境変数

| ブランチ | 環境変数 |
|----------|----------|
| main | `AMPLIFY_DIFF_DEPLOY=true` |
| kag | `AMPLIFY_DIFF_DEPLOY=true` |

### 動作

- `src/` や `amplify/` に変更がない場合、フロントエンドビルドがスキップされる
- `docs/` のみの変更はスキップ対象

### 手動スキップ

コミットメッセージに `[skip-cd]` を追加することでも可能：

```bash
git commit -m "ドキュメント更新 [skip-cd]"
```

**注意**: `[skip ci]` や `[ci skip]` は Amplify では無効。`[skip-cd]` のみ。

### 設定コマンド（参考）

```bash
# 既存の環境変数を確認してからマージして更新すること
aws amplify update-branch --app-id d3i0gx3tizcqc1 --branch-name main \
  --environment-variables AMPLIFY_DIFF_DEPLOY=true --region us-east-1
```

---

## deploy-time-build（本番環境ビルド）

### 概要

sandbox環境ではローカルでDockerビルドできるが、本番環境（Amplify Console）ではCodeBuildでビルドする必要がある。`deploy-time-build` パッケージを使用してビルドをCDK deploy時に実行する。

### 環境分岐

```typescript
// amplify/agent/resource.ts
const isSandbox = !branch || branch === 'sandbox';

const artifact = isSandbox
  ? agentcore.AgentRuntimeArtifact.fromAsset(runtimePath)  // ローカルビルド
  : agentcore.AgentRuntimeArtifact.fromAsset(runtimePath, {
      platform: ecr_assets.Platform.LINUX_ARM64,
      bundling: {
        // deploy-time-build でCodeBuildビルド
      },
    });
```

### ⚠️ コンテナイメージのタグ指定に関する重要な注意

**`tag: 'latest'` を指定すると、コード変更時にAgentCoreランタイムが更新されない問題が発生する。**

#### 問題の仕組み

1. コードをプッシュ → ECRに新イメージがプッシュ（タグ: `latest`）
2. CDKがCloudFormationテンプレートを生成
3. CloudFormation: 「タグは同じ `latest` だから変更なし」と判断
4. **AgentCoreランタイムが更新されない**

#### NG: 固定タグを使用

```typescript
containerImageBuild = new ContainerImageBuild(stack, 'ImageBuild', {
  directory: path.join(__dirname, 'runtime'),
  platform: Platform.LINUX_ARM64,
  tag: 'latest',  // ❌ CloudFormationが変更を検知できない
});
agentRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromEcrRepository(
  containerImageBuild.repository,
  'latest'  // ❌ ハードコード
);
```

#### OK: タグを省略してassetHashを使用

```typescript
containerImageBuild = new ContainerImageBuild(stack, 'ImageBuild', {
  directory: path.join(__dirname, 'runtime'),
  platform: Platform.LINUX_ARM64,
  // tag を省略 → assetHashベースのタグが自動生成される
});
// 古いイメージを自動削除（直近5件を保持）
containerImageBuild.repository.addLifecycleRule({
  description: 'Keep last 5 images',
  maxImageCount: 5,
  rulePriority: 1,
});
agentRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromEcrRepository(
  containerImageBuild.repository,
  containerImageBuild.imageTag,  // ✅ 動的なタグ
);
```

#### 比較表

| 項目 | `tag: 'latest'` | タグ省略（推奨） |
|------|-----------------|-----------------|
| デプロイ時の更新 | ❌ 反映されないことがある | ✅ 常に反映される |
| ECRイメージ数 | 1つのみ | 蓄積（要Lifecycle Policy） |
| ロールバック | ❌ 不可 | ✅ 可能 |

### 参考

- [deploy-time-build](https://github.com/tmokmss/deploy-time-build)

---

## Twitter/X シェア機能

### Web Intent URL形式（重要）

ツイートURLを生成する際は、Twitter Web Intent形式を使用する。

```python
# OK: Web Intent形式（textパラメータが確実に反映される）
url = f"https://twitter.com/intent/tweet?text={encoded_text}"

# NG: compose/post形式（textパラメータが無視されることがある）
url = f"https://x.com/compose/post?text={encoded_text}"
```

**原因**: `compose/post` はXのWeb UI直接アクセス用URLで、`text`パラメータが無視されることがある。`intent/tweet` はシェアボタン用に設計された公式の方法で、パラメータが確実に処理される。

### URLエンコード

日本語やハッシュタグを含むツイート本文は `urllib.parse.quote()` でエンコード：

```python
import urllib.parse
encoded_text = urllib.parse.quote(tweet_text, safe='')
```

**ポイント**: `safe=''` で `#` もエンコードする（URLパラメータ内では必要）

---

## お知らせバナーの追加

チャット画面にシステムからのお知らせを表示する方法。

### 実装場所

`src/components/Chat.tsx` のメッセージ一覧の先頭に追加。

```tsx
{/* メッセージ一覧 */}
<div className="flex-1 overflow-y-auto px-6 py-4">
  <div className="max-w-3xl mx-auto space-y-4">
  {/* 一時的なお知らせバナー（不要になったら削除） */}
  <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-blue-700 text-sm">
    お知らせ内容をここに記載
  </div>
  {/* 以下、既存のメッセージ表示 */}
```

### バナーの種類

| 種類 | 背景色 | ボーダー | テキスト | アイコン | 用途 |
|------|--------|---------|----------|---------|------|
| 情報（青） | `bg-blue-50` | `border-blue-200` | `text-blue-700` | - | 復旧報告、お知らせ |
| 警告（黄） | `bg-yellow-50` | `border-yellow-200` | `text-yellow-800` | ⚠️ | 障害発生中、メンテナンス予告 |
| エラー（赤） | `bg-red-50` | `border-red-200` | `text-red-700` | ❌ | 重大な障害 |
| 成功（緑） | `bg-green-50` | `border-green-200` | `text-green-700` | ✅ | 新機能リリース |

### 運用手順

1. `src/components/Chat.tsx` にバナーを追加
2. コミット & 両ブランチにpush（mainとkag）
3. 不要になったらバナーを削除してpush

---

## ローカル開発（認証スキップ）

フロントエンドのデザイン確認時に認証をスキップしてモックモードで起動できる。

### 起動方法

```bash
VITE_USE_MOCK=true npm run dev
```

### 実装

```typescript
// src/main.tsx
const useMock = import.meta.env.VITE_USE_MOCK === 'true';

if (useMock) {
  // Amplify設定をスキップしてモックアプリを表示
  root.render(<MockApp />);
} else {
  // 通常の認証付きアプリを起動
  Amplify.configure(outputs);
  root.render(<AuthenticatedApp />);
}
```

```typescript
// src/App.tsx
// モックモードの場合はAuthenticatorをスキップ
if (useMock) {
  return <MainApp signOut={() => {}} />;
}
```

---

## 参考リンク

- [Marp公式](https://marp.app/)
- [Marp Core](https://github.com/marp-team/marp-core)
- [Strands Agents](https://strandsagents.com/)
- [Amplify Gen2](https://docs.amplify.aws/gen2/)
- [AgentCore CDK](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-bedrock-agentcore-alpha-readme.html)
- [uv](https://docs.astral.sh/uv/)
