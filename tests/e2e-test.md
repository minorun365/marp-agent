# E2Eテストチェックリスト

## テスト環境

| 環境 | URL |
|------|-----|
| sandbox | http://localhost:5173 |
| 本番 | https://main.d3i0gx3tizcqc1.amplifyapp.com/ |

## テストケース

### TC1: 認証
- [ ] サインイン画面が日本語で表示される
- [ ] ログイン/新規登録ができる

### TC2: スライド生成
- [ ] メッセージを入力して送信できる
- [ ] ステータス表示が正しく遷移する
- [ ] プレビュータブでスライドが表示される
- [ ] borderテーマが適用されている

### TC3: PDFダウンロード（必須）
- [ ] 「PDFダウンロード」ボタンをクリック
- [ ] PDFがダウンロードされる
- [ ] 日本語が正しく表示される
- [ ] borderテーマが適用されている

**注意**: PDFダウンロードは毎回のテストで必ず実行すること

## 実行コマンド

```bash
# sandbox起動
TAVILY_API_KEY=$(grep TAVILY_API_KEY .env | cut -d= -f2) npx ampx sandbox

# devサーバー起動（別ターミナル）
npm run dev
```
