# デプロイの詳細

## スタック構成

CDK は次の6スタックに分かれています。差分を確認するときは、触ったつもりのないスタックが `No changes` のままかを見てください。

| スタック | 役割 |
|---|---|
| `PawapoFoundation` | ドメイン、証明書、シークレット、予算アラート |
| `PawapoAuthAccess` | 認証まわりのLambda実行ロールとログ |
| `PawapoAuth` | Cognitoユーザープールとクライアント |
| `PawapoWorkloadAccess` | AgentCore・Webの実行ロールとログ |
| `PawapoAgent` | AgentCore Runtime（エージェント本体） |
| `PawapoWeb` | CloudFront配信と共有スライド配信 |

## CDK context の全項目

`cdk.json` の `context` を書き換えます。指定しなかった任意の項目は、その機能ごと作られません。

| context | 要否 | 内容 |
|---|---|---|
| `appDomain` | 必須 | アプリを公開するドメイン |
| `previewDomain` | 任意 | 本番切替前に確認する用のドメイン |
| `domainReady` | 任意 | `true` にすると `appDomain` を配信に割り当てます。証明書のDNS検証を通してから有効にしてください |
| `budgetEmail` | 任意 | 予算アラートの通知先メールアドレス |
| `monthlyBudgetUsd` | 任意 | 月額予算（既定は100ドル） |
| `googleClientId` | 任意 | Googleログインを使う場合のクライアントID |
| `cognitoDomainPrefix` | 任意 | Googleログインを使う場合は必須。Cognitoのホストドメイン接頭辞 |
| `oldUserPoolId` / `oldUserPoolClientId` / `oldMigrationRoleArn` | 任意 | 既存のCognitoからユーザーを引き継ぐ場合に3つセットで指定 |
| `oldGoogleCheckRoleArn` | 任意 | 引き継ぎ元でGoogleアカウントを照合する場合のロールARN |
| `cutoverWildcardDomain` | 任意 | 別環境から無停止で切り替える場合のワイルドカードドメイン |

新規に構築する場合、必要なのは `appDomain` だけです。移行用の context は、旧環境を持っている場合のみ指定してください。

## ドメインと証明書

ドメインは `PawapoFoundation` が専用のホストゾーンを作るので、レジストラ側のネームサーバーをそこへ向けてください。ACM証明書はDNS検証なので、検証用のCNAMEを登録すると発行されます。

⚠️ **`cdk.json` の context を落としたまま実行すると、その機能のリソースが削除差分として出ます。** 必ず `infra:diff` で、変更したはずのないスタックが `No changes` になっていることを確認してからデプロイしてください。

## 本番デプロイの運用（AGENTS.md から移設）

### Git push と AWS デプロイは分ける

`main` への push は公開リポジトリの正本を更新するだけで、本番 AWS は自動では変わらない。本番反映は CDKD を明示実行する。

旧 Amplify Gen2 の自己ホスト手順と `amplify.yml` は `legacy/amplify` ブランチに残してある。旧 Amplify アプリは切り戻し用に残し、`main` の自動ビルドは止めてある。

**「直したはずの修正が消えている」と言われたら、`main` の履歴だけで否定しない。**
新基盤への移行期は `codex/pawapo-rearchitecture` のような作業ブランチから本番へ直接デプロイしていた時期があり、
**そこで入れた修正が `main` へマージされないまま残る**。その後 `main` を正としてデプロイした瞬間に、
本番だけ静かに巻き戻る。テストもビルドも通り、当時の対応レポートは「デプロイ完了」と書いてあるので気づけない。

```bash
git log <ブランチ> --not main --oneline     # main に入っていないコミットを洗う
git merge-base --is-ancestor <sha> HEAD     # 特定コミットが main にあるか
```

リポジトリの履歴より先に、共有くんの過去レポートを読むほうが速い場面がある。

テーマCSS（`agent/*.css` は `.gitignore` 対象のコピー）は
`npm run infra:synth` / `infra:diff` / `infra:dry-run` / `infra:deploy` が `copy-themes` を実行して配る。
手で `cdkd` を直接叩くときは、先に `npm run copy-themes` を実行する（忘れるとプレビューだけ直って書き出しが古いままになる）。

**本番へは `npm run infra:deploy` や素の `cdkd` を直接使わない。** このCDKアプリは
context の有無でリソースを作るかどうかが決まるため、1つでも落とすと既存リソースが
**削除差分**として出る（Googleログイン一式、予算アラートなど）。本番デプロイは
`deploy-prod` スキル（ローカル専用）のラッパー経由で行い、`diff` で「変更したはずのない
スタックが No changes detected か」を先に確認する。

### デプロイの完了条件は「検査2本が通ること」

**`Deployment completed successfully` は動作確認ではない。** 2026年8月に3件続けて、
デプロイが成功したのに利用者の経路が壊れている事故が起きた（コンテナへのファイル同梱漏れで
生成が約28時間全滅、移行元の世代漏れで423人がログイン不可、リクエストヘッダーの許可漏れで
利用統計が空）。3件とも**設定が落ちてもエラーも警告も出ない**性質で、状態表示・HTTP 200・
テストの成功では捕まらなかった。

```bash
npm run prod:verify   # 構成：本番の実リソースを読み、期待値と突き合わせる
npm run prod:smoke    # 経路：ログイン→生成→識別記録→PDF書き出しを実際に通す
```

どちらかが落ちたらデプロイは完了していない。直すか切り戻すまで完了報告しない。

**「落ちても無症状な設定」を新しく足したときは、`infra/scripts/verify-production.mjs` へ
検査を1項目足すところまでを1セットにする。** その設定が外れたときエラーになるなら不要、
何も起きないまま機能が静かに欠けるなら必須、と判断する。

**`Deployment completed successfully` の下に、Dockerのpush失敗が隠れることがある。**
ECRの認証トークンは12時間で切れる。切れた状態でデプロイすると、
**スタックのデプロイ自体は「成功」と表示されたまま、コンテナイメージだけが上がらない**。
しかも `prod:verify` は13項目すべて合格する（構成は正しく、古いイメージでRuntimeはREADYのまま）。

```
✓ Deployment completed successfully
Error: 1 node(s) failed, 1 skipped:
  - asset-publish:PawapoAgent:docker:...: Docker push failed:
    error from registry: Your authorization token has expired.
```

**成功表示ではなく終了コードで判定する。** バックグラウンド実行なら通知の status を見る。
踏んだら、ECRへ入り直してデプロイし直す。

```bash
aws ecr get-login-password --profile <本番profile> --region us-east-1 | docker login --username AWS --password-stdin <アカウントID>.dkr.ecr.us-east-1.amazonaws.com
```

検査2本（`prod:verify`）だけでは捕まらない。コード変更を伴うデプロイは `prod:smoke` まで通して初めて完了。

### 「生成が遅い」の原因は、ほぼ応答開始までの待ち（TTFT）

**プロンプトの長さやスライドの分量を疑う前に、TTFT を測る。** 2026-08-22 に本番ログ24時間ぶん・
モデル呼び出し62回を集計したところ、**総所要1,304秒のうち1,088秒（83%）が「最初の1トークンが
返るまでの待ち」**だった。出力が10トークンしかない回で46.7秒、117トークンで93.1秒待っており、
**待ちは生成量とまったく相関しない**。最長は101.5秒。

```bash
# aws/spans ロググループの chat スパンに gen_ai.server.time_to_first_token（ミリ秒）がある
aws logs start-query --log-group-name 'aws/spans' \
  --query-string 'fields @timestamp, @message | filter @message like /time_to_first_token/'
```

したがって**プロンプトを削る・出力を短くする対策は効かない。効くのはモデルを呼ぶ回数を
減らすことだけ**（1回減らせば期待値17.5秒、悪ければ100秒）。とくに `output_slide` の検証で
差し戻すと**スライド全文をもう一度書かせる**ので、1往復まるごと待ちが乗る。

- 体裁だけの違反（`COSMETIC_VIOLATION_TYPES`＝太字の使いすぎ・同じ型の連続・中タイトルの枚数）は
  差し戻さず `_repair_slides_mechanically` へ回す。はみ出し・総枚数・英語のまま出た場合・
  根拠の不足は従来どおり差し戻す
- 差し戻した理由は `[INFO] Slide retry n/m (model=grok): <違反タイプ>` に出る。
  **遅さを調べるときは真っ先にこれを見る**
- **遅さを直前のコード変更のせいだと断定しない。** 同日に入れた薄いページ検知を犯人だと考えたが、
  その前の時間帯のログでも同じだけ遅く、実際はモデル側のばらつきだった

利用状況の確認は `npm run prod:usage`（旧 `check-app-stats/run.sh` は移行前専用なので使わない）。

