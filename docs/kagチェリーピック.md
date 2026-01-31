# kagブランチへのチェリーピック作業

## 概要

mainブランチからkagブランチへ、テーマ選択機能を除いた変更をチェリーピックした。

## チェリーピック済みコミット

| コミット | 内容 |
|---------|------|
| 5093e4b | Kimiモデル切り替え機能を追加 |
| 5c08017 | 会話中はモデル切り替えを無効化 |
| bc6d4b8 | モデル切り替え無効化の判定を修正（ユーザー発言があるかで判定） |
| 8863279 | スマホ表示でモデルセレクターを矢印のみに簡略化 |
| 66ab91d | スマホでモデルセレクターのタップ領域を修正 |
| 235a529 | モデル名ラベルの表示を調整 |
| 8c6fb23 | モデルセレクターのUIを改善 |
| 4358fdc | プロジェクトルールにGitコミットルールとリリース管理を追加 |
| 3fbd88f | ブランチ別バージョニングルールを追加 |

## 除外した変更（テーマ選択機能）

kagはkag専用テーマを固定で使用するため、以下のテーマ選択関連は除外：

- d6bcd9a Merge branch 'feature/theme-selector'
- fb3dcaa テーマをデザインに
- 4b66e6d #10 テーマ選択機能を実装
- 19c66e1 テーマ選択にラベル追加
- daf63a4 スライドUI改善（テーマラベル上配置、スライド番号を下に移動）

## 残りの作業

### 1. sandbox動作確認

```bash
cd /Users/minorun365/git/minorun365/marp-agent-kag
npm install
export TAVILY_API_KEY=$(grep TAVILY_API_KEY .env | cut -d= -f2)
npx ampx sandbox --identifier kag
```

別ターミナルで：
```bash
npm run dev
```

### 2. 確認ポイント

- [ ] モデルセレクター（Claude/Kimi切り替え）が表示される
- [ ] 会話開始後はモデル切り替えが無効化される
- [ ] スマホ表示で矢印のみ表示される
- [ ] スライド生成が正常に動作する

### 3. プッシュとリリース

動作確認OKなら：

```bash
git push origin kag
```

リリース作成（mainのv1.1.0ベース）：

```bash
gh release create v1.1.0-kag.1 --generate-notes --target kag --title "v1.1.0-kag.1 Kimiモデル切り替え機能追加"
```

## ブランチ別バージョニングルール

| ブランチ | 形式 | 例 |
|---------|------|-----|
| main | `vX.Y.Z` | `v1.2.0` |
| kag | `vX.Y.Z-kag.N` | `v1.2.0-kag.1` |

- kagはmainのバージョンをベースに `-kag.N` サフィックスを付与
- kag固有の変更があるたびにNをインクリメント
