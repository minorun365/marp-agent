# パワポ作るマン 仕様書

> **注意**: 基本的な仕様は **mainブランチ** の `docs/SPEC.md` を参照してください。このファイルにはkagブランチ固有の差分のみ記載します。

## kagブランチ固有の差分

### 決定事項サマリー（差分のみ）

| カテゴリ | 項目 | main | kag |
|---------|------|------|-----|
| スライド | テーマ | gradient（デフォルト） | **kag**（KAG専用テーマ） |
| 認証 | スコープ | 誰でもサインアップ可能 | **KAGドメイン限定**（`kddi-agdc.com`） |

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
