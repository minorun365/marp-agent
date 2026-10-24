# 認証方式の設計

最終確認日: 2026年10月24日

パワポ作るマンのログインは **Google・パスキー・メールのワンタイムコード** の3つで、パスワードは使わない。Amazon Cognito User Pools を CDK で構築し、フロントエンドは `aws-amplify` の Auth クライアントでアプリ専用の画面を実装する。

## 結論

- パスワードは使わない。画面にパスワードの入力欄は無く、利用者向けの App Client にもパスワードの経路（`USER_PASSWORD_AUTH`・`USER_SRP_AUTH`）を開けない。ただし App Client の設定だけでは塞がらない（下の「パスワードの経路の塞ぎ方」）。
- メールで使う人は、ログインのたびにメールで届くコードで入る。新規登録もメールアドレスだけで、確認コードの入力がそのまま初回ログインになる。
- パスキーは、メールのコードでログインした人へ一度だけ案内する任意の手段。
- Google ログインを併用する。Google 利用者へパスキー登録は勧めない。
- 過去の User Pool からの段階移行の仕組みは持たない（2026-10-23 に撤去）。2026-08-14 より前に登録し、それ以降ログインしていない人は登録し直しになる。

## 利用者ごとの動線

| 利用者 | 最初の操作 | 次回以降 |
|---|---|---|
| メールを使う人 | メールアドレスだけで登録し、確認コードを入れるとそのままログイン | メールのコード。パスキーを登録すれば顔認証・指紋認証 |
| Google を使う人 | Google で登録とログインを同時に完了 | Google |

## ログイン画面

1画面目は「Googleで続ける」と、メールアドレス入力＋「メールで続ける」の2択。メールの次の画面で「パスキーでログイン」と「メールにコードを送る」を常に並べる。パスキーの登録の有無で画面を出し分けない（第三者へアカウントの状態を知らせないため）。存在しないアドレスでも Cognito は同じ応答を返す（`preventUserExistenceErrors`）ので、コードが来ない人への案内はコード入力の画面に置く。

## メール送信

Cognito の標準メール送信（`EmailSendingAccount: COGNITO_DEFAULT`）を使う。AWS アカウントあたり1日50通が上限で、ログインのたびにメールが1通届く。

公式ドキュメント（[メール設定](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html)の表の注記）は、メールのワンタイムコードに「Essentials プラン以上と Amazon SES のメール設定」が必要だと書いている。本番はこの要件を満たしていないが、2026年10月24日に次の2点を確かめ、標準送信のままでも動いている。

- 本番の User Pool は `COGNITO_DEFAULT` のまま、`AllowedFirstAuthFactors` に `EMAIL_OTP` が入っている。Cognito はこの組み合わせを拒否しない
- CloudTrail に、2026年10月23日のメールのコードでのログイン（`RespondToAuthChallenge` の `EMAIL_OTP`）が3件あり、いずれもエラーなく完了している

ドキュメントと実際の挙動が食い違っているので、AWS が要件どおりに締めればメールのコードだけが止まる。メールでログインできないという報告が来たら、まずここを疑う。そのときと、ログイン回数が1日50通に近づいたときは、SES の本番利用申請をして `DEVELOPER` の送信へ切り替える。

文面はカスタムメッセージの Lambda トリガー（`infra/lambda/auth/custom-message`）で日本語にしている。新規登録の確認コード（`CustomMessage_SignUp`）とログインのコード（`CustomMessage_Authentication`）の両方がこのトリガーを通る。

## パスワードの経路の塞ぎ方

選択型の `USER_AUTH` では、App Client の `ExplicitAuthFlows` に関係なく、User Pool の `AllowedFirstAuthFactors` にある方式を選べる。`PASSWORD` は外せないので、パスワードを持つ利用者は API を直接呼べばパスワードだけでログインできる（2026年10月24日、テスト用ユーザーで再現）。次の2つで塞いでいる。

- アカウント回復を管理者のみ（`admin_only`）にして、利用者がパスワードを作り直す `ForgotPassword` を閉じる。構成の検査（`prod:verify`）がこの設定を見ている
- 2026年10月24日、それまでにメールで登録した利用者110人のパスワードを、誰も知らないランダムな値へ置き換えた。以降の新規登録はパスワードを作らない

本番の検査用ユーザーだけは、`ADMIN_USER_PASSWORD_AUTH` で使うためにパスワードを持っている。未確認（`UNCONFIRMED`）のまま残っている利用者は置き換えていない。

## Google ユーザーとの統合

Cognito は、メールアドレスが同じでもメールの利用者と Google の利用者を自動で統合しない。preSignUp トリガー（`infra/lambda/auth/google-link`）で、確認済みメールアドレスが一致する既存のプロフィールへ `AdminLinkProviderForUser` でリンクする。

## 実装条件

- Cognito User Pool は Essentials プラン以上にする（パスキーとメールのコードに必要）。
- `AllowedFirstAuthFactors` は `PASSWORD`・`EMAIL_OTP`・`WEB_AUTHN`。`PASSWORD` は Cognito の仕様で外せない（CDK も `PasswordAuthenticationCannotDisabled` で止める）。
- アカウント回復は `admin_only`（CDK の `AccountRecovery.NONE`）。
- App Client の認証フローは、利用者向けの選択型 `USER_AUTH` と、本番の検査用の `ADMIN_USER_PASSWORD_AUTH`（AWS の認証情報が要る）だけ。
- パスキーの Relying Party ID は本番ドメイン `pawapo.minoruonda.com` に固定する。
- AgentCore Runtime へ渡すのは Cognito のアクセストークンとする。

## 将来もう一度 User Pool を移す場合

- パスキー認証情報はエクスポートできないため、新しい User Pool で再登録が必要になる。
- メールの利用者は、メールアドレスだけを新しい User Pool へ取り込めば、そのままメールのコードで入れる（取り込んだ利用者はパスワードを作らずにコードでログインできる）。
- Google の認証情報は Google 側にあるため、新しいリダイレクト URL を設定すれば再ログインできる。
- Cognito の `sub` は変わる。スライド履歴、契約、利用枠など永続データを持つ時点で、Cognito と別の固定利用者 ID を導入する。

## 公式資料

- [Cognito の認証フロー（パスワードなしのサインイン・パスキー）](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow-methods.html)
- [サインアップ時のパスワードの省略](https://docs.aws.amazon.com/cognito/latest/developerguide/signing-up-users-in-your-app.html)
- [Cognito のメール設定と標準送信上限](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html)
- [カスタムメッセージの Lambda トリガー](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-custom-message.html)
- [Amplify のパスキー管理](https://docs.amplify.aws/react/build-a-backend/auth/manage-users/manage-webauthn-credentials/)
- [Cognito のフェデレーションユーザー統合](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-identity-federation-consolidate-users.html)
