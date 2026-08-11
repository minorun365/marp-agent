# 認証方式と Cognito 移行の検討メモ

最終確認日: 2026年8月11日

パワポ作るマンの認証を見直す際に、パスキー、ソーシャルログイン、既存ユーザー移行をまとめて判断できるように記録する。このメモでは、Amplify Gen 2 と Amazon Cognito User Pools を継続利用する前提で整理する。

## 現在の構成

- 新規登録とログインはメールアドレスとパスワードを使用している。
- 新しい Cognito User Pool に存在しない既存ユーザーは、初回のパスワードログイン時に User Migration Trigger で旧 User Pool から移す。
- 移行中のログインでは、旧パスワードを検証できる `USER_PASSWORD_AUTH` を使用する。
- 2026年8月11日時点の導入版は `@aws-amplify/backend 1.20.0`、`aws-amplify 6.16.0`、`@aws-amplify/ui-react 6.13.2`。

## 認証方式の比較

| 方式 | 新規登録 | 2回目以降 | 新しい User Pool への移行 |
|---|---|---|---|
| メールとパスワード | 登録時から使用可能 | メールとパスワードでログイン | User Migration Trigger で旧パスワードを引き継げる |
| メール OTP | 登録時から使用可能 | メールで受け取ったコードを入力 | メール属性を移せば、移行先で本人確認に使用可能 |
| パスキー | 単独では登録不可 | Face ID、指紋、端末の認証などでログイン | 登録情報を移せないため、利用者が再登録する |
| Google | 初回の Google ログインで Cognito プロフィールを作成 | Google 経由でログイン | 新環境で Google に再ログインすればプロフィールを再作成できる |

パスキーはアカウント作成後に登録する認証情報であり、最初の本人確認には使えない。新規ユーザーへパスキーを提供する場合は、メール OTP などで最初の登録を完了させ、その直後にパスキー登録を案内する。

Google ログインでは登録とログインが同じ操作になる。初回は Google が返した情報から Cognito がプロフィールを作り、次回から同じ Google アカウントでログインする。

## Amplify が標準対応する外部認証

Amplify と Cognito が専用の設定項目を提供しているソーシャルログインは、次の4種類がある。

- Google
- Facebook
- Login with Amazon
- Sign in with Apple

このほか、OpenID Connect または SAML に対応した Microsoft Entra ID や Okta なども接続できる。GitHub の一般ユーザー向け OAuth は OpenID Connect の ID トークンを発行しないため、Cognito の標準機能では直接接続できない。GitHub ログインを追加するには、外部の認証仲介サービスか独自の OAuth 連携が必要になる。

## 既存ユーザーと Google の統合

Cognito は、メールアドレスが同じでも、ローカルユーザーと Google ユーザーを自動的には統合しない。何も対策せずに既存ユーザーが Google で初回ログインすると、別の Cognito プロフィールが作られる可能性がある。

既存プロフィールへ Google を追加する場合は、`AdminLinkProviderForUser` を使用する。初回の Google ログイン前または Pre Sign-up Trigger の処理中に、Google の確認済みメールアドレスと既存ユーザーを照合してリンクする。

現在の段階移行と併用する場合、旧 User Pool にしか存在しないユーザーは先にパスワードで新 User Pool へ移す必要がある。パスワードレス認証とソーシャルログインでは User Migration Trigger が起動しないため、移行期間中は既存ユーザー向けのパスワードログインを残す。

## Google ユーザーとパスキーの関係

Google だけで作られたフェデレーションユーザーへ、Cognito のパスキーをそのまま追加する構成は採らない。パスキーなどの Cognito 側の認証方式を併用するには、Google ユーザーをローカルプロフィールへリンクする必要がある。

Google ログインを継続して使う利用者に、パワポ作るマン専用のパスキーまで登録してもらう利点は小さい。Google 側ですでにパスキーや多要素認証を使用している場合は、Google が安全な本人確認を担当している。

パスキーは、Google を使わない利用者がメール OTP のコード入力を毎回行わずに済む選択肢として提供する。想定する利用経路は次のとおり。

| 利用者 | 初回 | 2回目以降 |
|---|---|---|
| Google を使う新規ユーザー | Google で登録とログイン | Google でログイン |
| Google を使わない新規ユーザー | メール OTP で登録後、パスキーを登録 | パスキーでログイン |
| 既存ユーザー | 旧パスワードで移行後、パスキーを登録 | パスキーまたは従来のパスワードでログイン |

## AWS アカウントを再移行する場合

Amplify の配置先だけを変更し、同じ Cognito User Pool を参照し続ける場合は、パスキーも Google のリンクも維持される。新しい AWS アカウントに新しい User Pool を作る場合は、認証方式ごとに扱いが変わる。

### パスキー

Cognito にはパスキー認証情報のエクスポートとインポートの機能がない。新しい User Pool では、同じ独自ドメインを使っても旧パスキーを検証できない。利用者はメール OTP などで新環境へログインし、新しい User Pool にパスキーを登録し直す。

将来の移行とアカウント復旧に備えて、パスキーを導入した後もメール OTP を残す。ユーザー情報を CSV で移す場合、メール OTP を有効にした User Pool では、メール属性を持つインポート済みユーザーがパスワードを再設定せずログインできる。

### Google

Google の認証情報は Google 側にある。新しい User Pool に Google プロバイダーを設定し、Google 側に新しい Cognito のリダイレクト URL を追加すれば、利用者は Google に再ログインできる。

ただし、新しい User Pool では Cognito の `sub` が新しく発行される。Google ユーザーのカスタム属性やグループも自動では移らない。スライド履歴、利用権限、契約状態などを将来ユーザーに結び付ける場合は、Cognito の `sub` を永続的な利用者 ID として使わず、アプリ側で固定の利用者 ID を発行して対応関係を管理する。

## 現時点の推奨構成

認証画面には、Google とメールの2経路を置く。

- Google を使う利用者は、初回から Google で登録して以後も Google でログインする。
- メールを選ぶ新規ユーザーは、メール OTP で登録した後にパスキーを登録する。
- 既存ユーザーは、移行期間中だけ旧パスワードで初回ログインし、その後はパスキーを登録できる。
- GitHub ログインは実装と運用が増えるため、現段階では追加しない。

パスキーを導入する前に、Relying Party ID を本番の独自ドメイン `pawapo.minoruonda.com` に固定する。Relying Party ID を後から変更すると、利用者はパスキーを再登録する必要がある。

Cognito User Pool は Essentials プラン以上にする。パスキー対応の認証画面を使用するため、`@aws-amplify/ui-react` は 6.14.0 以上へ更新する。メール OTP を本番で使う場合は、Amazon SES の送信設定も用意する。

## 実装前に決めること

1. Google を全利用者向けの主な選択肢にするか。
2. メール OTP とパスキーを同時に提供するか。
3. 既存ユーザーと Google を自動リンクするか、それとも既存ユーザーには先にパスワード移行を求めるか。
4. 将来のユーザーデータに備えて、Cognito の `sub` と別の固定利用者 ID を導入するか。

## 公式資料

- [Amplify のパスワードレス認証](https://docs.amplify.aws/react/build-a-backend/auth/concepts/passwordless/)
- [Amplify のパスキー管理](https://docs.amplify.aws/react/build-a-backend/auth/manage-users/manage-webauthn-credentials/)
- [Amplify の外部認証プロバイダー](https://docs.amplify.aws/react/build-a-backend/auth/concepts/external-identity-providers/)
- [Cognito の外部プロバイダー連携](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-identity-provider.html)
- [Cognito のフェデレーションユーザー統合](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-identity-federation-consolidate-users.html)
- [Cognito の User Migration Trigger](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-migrate-user.html)
- [Cognito のユーザーインポート](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-using-import-tool.html)
- [Cognito User Pool のエクスポートと復旧に関する制約](https://docs.aws.amazon.com/solutions/latest/cognito-user-profiles-export-reference-architecture/overview.html)
- [GitHub の認証ディスカバリー仕様](https://docs.github.com/en/apps/github-authentication-discovery-endpoints)
