# パワポ作るマン 仕様書（kagブランチ）

> **注意**: 基本的な仕様は **mainブランチ** の `docs/SPEC.md` を参照してください。このファイルにはkagブランチ固有の差分のみ記載します。

## ディレクトリ構造

2026-02-06時点で、mainとkagはリファクタリング後の同じ構造を共有しています。

```
src/
├── hooks/
│   ├── useAgentCore.ts       (re-exportのみ)
│   ├── api/
│   │   ├── agentCoreClient.ts
│   │   └── exportClient.ts   ★ デフォルトテーマが'kag'
│   ├── streaming/
│   │   └── sseParser.ts
│   └── mock/
│       └── mockClient.ts
└── components/
    └── Chat/
        ├── index.tsx
        ├── constants.ts
        ├── types.ts
        └── ...

amplify/agent/runtime/
├── agent.py                  ★ DEFAULT_THEMEをインポート
├── config.py                 ★ DEFAULT_THEME='kag'、システムプロンプトに_class説明
├── tools/
├── handlers/
├── exports/
├── sharing/
└── session/
```

## kagブランチ固有の差分

### 決定事項サマリー（差分のみ）

| カテゴリ | 項目 | main | kag |
|---------|------|------|-----|
| スライド | テーマ | gradient（デフォルト） | **kag**（KAG専用テーマ） |
| 認証 | スコープ | 誰でもサインアップ可能 | **KAGドメイン限定**（`kddi-agdc.com`） |
| モデル | Claude 5 | 準備中 | **対応済み**（フロントエンド） |

### kag固有のファイル（mainにマージしない）

| ファイル | 差分内容 |
|----------|----------|
| `amplify/agent/runtime/config.py` | `DEFAULT_THEME='kag'`、`_class`ディレクティブ説明 |
| `src/hooks/api/exportClient.ts` | デフォルトテーマが`'kag'` |
| `src/themes/kag.css` | KAG専用テーマ |
| `amplify/auth/resource.ts` | ドメイン制限（`kddi-agdc.com`） |
| `index.html` | OGPタイトル「パワポ作るマン for KAG」 |
| `src/App.tsx` | kag固有のUI調整 |

### mainから変更を取り込む際の注意

mainブランチで機能追加やバグ修正があった場合、以下の点に注意：

1. **構造的な変更**: ファイル追加・削除はそのままcherry-pick可能
2. **config.py**: kag固有の`SYSTEM_PROMPT`と`DEFAULT_THEME`を保持
3. **exportClient.ts**: デフォルトテーマを`'kag'`に維持
4. **index.html**: OGP情報を維持

### Marp設定

```yaml
---
marp: true
theme: kag
size: 16:9
paginate: true
---
```

### KAGテーマの特徴

- KAG専用のカスタムデザイン
- `amplify/agent/runtime/kag.css`（PDF用）
- `src/themes/kag.css`（プレビュー用）

### 認証設定

Cognito User Poolの設定で、サインアップ可能なメールドメインを制限：

```typescript
// amplify/auth/resource.ts
email: true,
allowedDomains: ['kddi-agdc.com'],
```

### メタ情報（index.html）

| 項目 | main | kag |
|------|------|-----|
| タイトル | パワポ作るマン | パワポ作るマン for KAG |
| OGP説明 | AIがMarp形式でスライドを自動生成... | AIエージェントがいい感じのスライドを自動生成！... |

### システムプロンプト

mainと同様ですが、フロントマターのテーマ指定が異なります：

```markdown
## スライド作成ルール
- フロントマターには以下を含める：
  ---
  marp: true
  theme: kag
  size: 16:9
  paginate: true
  ---
```
