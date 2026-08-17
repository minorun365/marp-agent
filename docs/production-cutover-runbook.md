# 本番切替runbook

## 現在の状態

- 2026年8月14日、本番ドメインを新CloudFrontへ切り替え済み
- Route 53の変更は `INSYNC`、新CloudFrontは `Deployed`
- AgentCore Runtimeは `READY`
- 本番URLで新ログイン画面とGoogle認証経路を確認済み
- 旧Amplifyの独自ドメイン関連付けは解除済み
- 旧Amplifyアプリ、旧Cognito、旧共有サブドメインは切り戻し用に保持
- 2026年8月14日、認証済みブラウザでスライド生成、プレビュー、PDF出力、共有URL発行・表示まで本番E2Eを完了
- AgentCoreが期限切れなどのJWTを拒否した場合は、Cognitoトークンを強制更新して同じリクエストを1回だけ再送する

## 完了済みの準備

- 新AWS環境は `us-east-1` へCDKDで配備済み
- `preview.pawapo.minoruonda.com` で新Web配信を確認済み
- 新CloudFrontは本番ドメインを覆う `*.minoruonda.com` を待機させる
- Cognitoは本番・プレビューのCallback URL、Google、パスワード、パスキーを設定済み
- AgentCore Runtimeは新CognitoのJWTだけを許可する
- 共有URLは本番と同じ `https://pawapo.minoruonda.com/slides/{id}/` を返す
- 旧Amplifyと旧共有サブドメインは撤去せず残す

## 切替前チェック（実施済み）

実値とAWS profileはGit追跡外の `.env.production.local` に置く。

このチェックは旧Amplifyの独自ドメインが残っている切替前専用であり、切替後の現在は再実行しない。

```bash
npm run prod:cutover:check
```

このコマンドは読み取り専用で、次をすべて確認できない限り終了コード1で停止する。

- 新CloudFrontが `Deployed` かつ有効
- 新CloudFrontに本番ドメインまたは `*.minoruonda.com` が登録済み
- ACM証明書が `ISSUED` で、本番ドメインと待機用ワイルドカードを含む
- AgentCore Runtimeが `READY`
- Cognitoに本番Callback URLとGoogleが登録済み
- 旧Amplifyの独自ドメインが `AVAILABLE`
- 本番DNSがTTL 60秒の単一CNAMEで、旧Amplifyを向いている
- プレビューDNSが新CloudFrontを向いている

## 本番切替（2026年8月14日実施済み）

みのるんの明示了承後にだけ実行する。

CloudFrontは、旧配信の完全一致 `pawapo.minoruonda.com` と新配信のワイルドカード `*.minoruonda.com` を共存できる。AWS公式のワイルドカード移行方式に従い、次のコマンドが一連の切替を行う。

```bash
npm run prod:cutover
```

このコマンドは、まず `pawapo.minoruonda.com` のCNAMEを新CloudFrontへ変更する。この時点では旧Amplifyの完全一致が優先されるため、利用者はまだ旧環境へ到達する。その後、旧Amplifyの `pawapo` サブドメイン関連付けを外すと、新CloudFrontのワイルドカードが有効になり、利用者の向き先が新環境へ切り替わる。各AWS操作の完了を待ってから終了する。

切替後は、次の順に実URLを確認する。

1. ログイン画面
2. 既存ユーザーのメール＋従来パスワード
3. Googleログイン
4. パスキー登録と再ログイン
5. スライド生成
6. PDF / PowerPoint出力
7. `/slides/{id}/` の共有URL
8. PCとiPhoneの表示

上記はリリース後の任意確認ではなく、**本番切替を完了と判定するための必須条件**とする。ログイン画面の表示、HTTP 200、CloudFrontの `Deployed`、AgentCore Runtimeの `READY` だけではリリース完了と報告しない。最低でも認証済みユーザーによるスライド生成がプレビューへ切り替わるまで確認し、PDFまたはPowerPoint出力と共有URL表示も実操作で通す。1項目でも失敗した場合は切り替えを完了扱いにせず、その場で修正するか旧環境へ切り戻す。

## 2026年8月14日の認証エラーと再発防止

本番切替時にログイン画面と認証経路だけを確認し、認証後のスライド生成を実行しないまま切替完了とした。そのため、ブラウザ上はログイン済みでもAgentCoreがJWTを拒否した場合、利用者には汎用エラーだけが表示される不具合をリリース前に検出できなかった。

対策は次の2点。

- AgentCoreから401または403が返った場合、Cognitoセッションを強制更新して同じ生成リクエストを1回だけ再送する
- 本番切替の完了条件を、認証済みの生成・プレビュー・出力・共有URL表示までの実操作に固定する

## 残っている後片付け（期限つき）

切替そのものは完了しているが、期限や条件が来てから片付けるものが2件ある。
放置すると、撤去したい旧環境がいつまでも残り続けるので、`npm run prod:verify` が期限を過ぎたら知らせる。

### 1. 旧共有サブドメインの停止（2026年8月22日以降）

移行前に発行された共有スライドは、いまも旧環境（会社サンドボックス）のCloudFrontから
`slides.pawapo.minoruonda.com` で配信されている。共有URLの有効期限は発行から7日なので、
**切替日（8月14日）から7日が過ぎる8月21日で、過去に発行したURLはすべて期限切れになる**。

片付ける手順:

1. 旧配信のアクセスログ、または対象バケットの最終更新日を見て、参照が止まっていることを確かめる
2. 旧環境のCloudFrontからエイリアスを外して無効化し、削除する
3. 親ドメインのDNSから `slides.pawapo.minoruonda.com` のA/AAAAと証明書検証用レコードを削除する

現行の共有URLは `https://pawapo.minoruonda.com/slides/{id}/` で、専用アカウントのS3から配信している。
このサブドメインを消しても、いま発行される共有URLには影響しない。

### 2. 2代目の移行元の撤去（移行が一巡してから）

会社サンドボックスのUser Poolを移行元に加えている（`.env.production.local` の `PAWAPO_OLD2_*`）。
2代目の期間に登録した423人がログインするまで必要なので、日付ではなく**実績**で判断する。

`npm run prod:usage` の利用者数と、移行ログの「2代目から移行」の件数を見て、
**2代目からの移行が数週間ゼロになったら**撤去してよい。手順は次のとおり。

1. `.env.production.local` から `PAWAPO_OLD2_*` の3行を消す
2. `cdkd-prod.sh diff PawapoAuthAccess PawapoAuth` で、環境変数と引き受け先だけが減ることを確認する
3. デプロイし、`npm run prod:verify` と `npm run prod:smoke` を通す
4. 会社サンドボックス側の役割（`pawapo-legacy-user-migration` / `pawapo-legacy-google-check`）を
   `infra/bin/legacy-migration-access.ts` のスタックごと削除する

初代の移行元（個人検証アカウントのUser Pool）は、まだ移行していない利用者が多いので当面残す。

## 切り戻し

新環境で利用継続が難しい不具合が見つかった場合は、次のコマンドが旧Amplifyへ `pawapo` サブドメインを再関連付けし、利用可能になるまで待ってからDNSを戻す。

```bash
npm run prod:rollback:check
npm run prod:rollback
```

旧Amplify、旧Cognito、旧共有サブドメインは、安定稼働を確認するまで削除しない。旧Amplifyアプリ自体を残すため、ドメインを再関連付けすれば切り戻せる。

## 切替後に実施するIaCの確定

DNS切替とE2Eが成功した後、`domainReady=true` で `PawapoWeb` を差分確認・dry-run・完全待機デプロイする。これにより待機用ワイルドカードを本番ドメインの明示登録へ置き換える。切替当日の通信経路には影響させず、成功確認後の後処理として行う。
