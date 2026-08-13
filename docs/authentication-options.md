# 認証方式と Cognito 移行の設計

最終確認日: 2026年8月13日

パワポ作るマンの認証と Cognito 移行の確定方針を記録する。移行後は Amplify Hosting と Amplify Gen 2 を使わず、Amazon Cognito User Pools を CDK で構築する。フロントエンドでは `aws-amplify` の Auth クライアントを使用し、認証画面はアプリ専用 UI として実装する。

## 結論

- 既存のメールアドレスとパスワードは、移行後もそのまま使える。
- パスワードを廃止せず、パスキーは希望者だけが追加する。
- Google ログインを追加する。Google 利用者へ Cognito のパスキー登録は勧めない。
- メールによるワンタイムコードログインは採用しない。SES の本番利用申請を認証の前提にしない。
- Cognito の標準メールは、新規登録時のメール確認とパスワード再設定だけに使う。
- 新旧の Cognito User Pool は、既存ユーザーが初めてパスワードでログインした時点で段階移行する。

## 利用者ごとの動線

| 利用者 | 最初の操作 | 次回以降 |
|---|---|---|
| 既存ユーザー | 従来と同じメールアドレスとパスワードでログイン。裏側で新 User Pool へ移行する | パスワードを継続。希望すればパスキーも使える |
| メールを使う新規ユーザー | メールアドレスとパスワードで登録し、Cognito の確認コードでメールを確認する | パスワード。希望すればパスキーも使える |
| Google を使う新規ユーザー | Google で登録とログインを同時に完了する | Google |

メール確認コードは新規登録時のメールアドレス確認であり、毎回のログインには使わない。既存ユーザーの操作は移行前と変わらず、プラットフォーム移行の都合で追加操作を強制しない。

## パスキーの位置づけ

パスキーはパスワードの強制的な置き換えではなく、端末の Face ID、Touch ID、Windows Hello などで素早くログインしたい利用者向けの追加手段である。

Cognito では、利用者が一度ログインした後でパスキーを登録する。ログイン時も最初にメールアドレスを入力し、次の画面で「パスキーでログイン」と「パスワードでログイン」を常に表示する。パスキーの登録有無で画面を出し分けないため、第三者へアカウントの状態を知らせない。

パスワードでログインした利用者には、ログイン成功後に一度だけパスキー登録を案内する。

- 案内は小さな確認画面にとどめる。
- 「パスキーを登録」と「あとで」の2つだけを表示する。
- 「あとで」を選んだ利用者へ毎回表示せず、30日間は再案内しない。
- 専用の設定画面は作らず、ログイン後のメイン画面も変更しない。
- パスキーを登録しなくても、パスワードログインを期限なく利用できる。

Google ログインは Google 側が本人確認を担当するため、Google 利用者へパワポ作るマン専用のパスキー登録は案内しない。

## ログイン画面

最初の画面は、Google とメールの2経路だけに絞る。

1. 「Googleで続ける」
2. メールアドレス入力と「メールで続ける」

メールを入力した次の画面では、青いグラデーションの「パスキーでログイン」を置き、その下にパスワード入力を常設する。パスキー未登録時や利用できない端末では、アカウントの状態を明かさない共通エラーを出してパスワードへ戻せるようにする。新規登録は同じメール画面の短い補助リンクから進める。

登録済みかどうかを第三者へ知らせないよう、存在しないメールアドレスや認証失敗時の表示は「メールアドレスまたは認証情報を確認してください」に統一する。

## 既存ユーザーの段階移行

新しい User Pool にユーザーが存在しない状態でパスワードログインを受けると、User Migration Trigger が旧 User Pool でパスワードを検証する。成功した利用者だけを新 User Pool に作成し、その後は新 User Pool が認証する。

この方式には次の性質がある。

- 利用者は従来と同じパスワードを使える。
- パスワードそのものやハッシュを一括で取り出す必要がない。
- CSV 一括インポートは属性だけを移せるが、従来のパスワードは移せないため主経路にしない。
- Google ログインやパスキーでは User Migration Trigger が起動しない。既存ユーザーの初回移行はパスワード経路で行う。
- 旧 User Pool への照会権限は移行 Lambda だけに与え、移行後に削除できる境界を保つ。

## Google ユーザーとの統合

Cognito は、メールアドレスが同じでもローカルユーザーと Google ユーザーを自動統合しない。既存ユーザーが移行前に Google を選ぶと、別プロフィールが作られる可能性がある。

初期リリースでは安全性を優先し、既存のメール利用者は一度パスワードで移行してから Google を連携する。確認済みメールアドレスだけを照合し、`AdminLinkProviderForUser` で新 User Pool 内のプロフィールへリンクする。Google アカウントだけで新規登録した利用者は、そのまま Google 専用プロフィールとして扱う。

既存 User Pool にだけ存在するメールアドレスで先に Google を選んだ場合は、別プロフィールを作らず「最初の一度だけ従来のパスワードでログイン」と案内する。パスワードログインで新 User Pool へ移行した後は、同じ確認済みメールアドレスの Google アカウントを既存プロフィールへ連携できる。

## メール送信と SES の扱い

SES は、毎回のログインコードを送るためには使わない。Cognito の標準メール送信を、新規登録時のメール確認とパスワード再設定に限定して使う。

Cognito の標準メール送信は、AWS アカウントあたり1日50通が上限である。初期の利用規模ではこの構成で開始し、実測で不足する段階になったら SES の本番利用申請または別のメール配信サービスを検討する。メール配信基盤の変更は認証方式の変更と切り離す。

## 将来もう一度 User Pool を移す場合

- パスワードは今回と同様に User Migration Trigger で段階移行できる。
- パスキー認証情報はエクスポートできないため、新しい User Pool で再登録が必要になる。
- Google の認証情報は Google 側にあるため、新しいリダイレクト URL を設定すれば再ログインできる。
- Cognito の `sub` は変わる。スライド履歴、契約、利用枠など永続データを持つ時点で、Cognito と別の固定利用者 ID を導入する。

## 実装条件

- Cognito User Pool は Essentials プラン以上にする。
- パスキーの Relying Party ID は本番ドメイン `pawapo.minoruonda.com` に固定する。
- App Client は `USER_PASSWORD_AUTH` と、パスキーを含む選択型認証 `USER_AUTH` を許可する。
- AgentCore Runtime へ渡すのは Cognito のアクセストークンとする。
- パスワード再設定と新規登録時の確認メールが、Cognito 標準メールの上限内で届くことを本番切り替え前に確認する。
- パスキーの登録、ログイン、削除、別端末での利用、パスワードへのフォールバックを PC と iPhone で確認する。

## 公式資料

- [Cognito の認証フローとパスキー](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow-methods.html)
- [Cognito のメール設定と標準送信上限](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html)
- [Cognito の User Migration Trigger](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-migrate-user.html)
- [Cognito のユーザーインポート](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-using-import-tool.html)
- [Amplify のパスキー管理](https://docs.amplify.aws/react/build-a-backend/auth/manage-users/manage-webauthn-credentials/)
- [Cognito のフェデレーションユーザー統合](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-identity-federation-consolidate-users.html)
