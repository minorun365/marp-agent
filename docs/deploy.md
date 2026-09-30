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
