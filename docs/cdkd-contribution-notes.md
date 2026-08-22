# CDKD コントリビュート候補

## Route 53 HostedZone の `NameServers` が文字列として記録される

- 確認日: 2026年8月13日
- 実環境で確認したバージョン: CDKD 0.282.5
- 最新ソース確認: CDKD 0.283.5、commit `fc40d0cd864c8e4c2935c38bdb1b9304a44bb7a2`
- 状態: upstreamへのIssue・Pull Requestは未作成

### 症状

`AWS::Route53::HostedZone` の `NameServers` を `Fn::Join` で文字列化するCloudFormation Outputが、リソース作成後のOutput解決で失敗する。

```text
Failed to resolve output DelegatedZoneNameServers:
Fn::Join's second argument must be a list ..., but resolved to string
```

リソースの作成自体は成功するが、そのOutputはCDKDのstateへ保存されない。

### 最小のCDKコード

```ts
const zone = new route53.PublicHostedZone(this, 'HostedZone', {
  zoneName: 'example.com',
});

new cdk.CfnOutput(this, 'NameServers', {
  value: cdk.Fn.join(',', zone.hostedZoneNameServers ?? []),
});
```

### 原因候補

CloudFormationのリソース仕様では `NameServers` は配列だが、CDKDのRoute 53 providerは次の3経路で `join(',')` を行い、カンマ区切りの文字列としてattributesへ保存・返却している。

- Hosted Zone作成時のattributes
- Hosted Zone更新時のattributes
- `getAttribute('NameServers')`

最新ソースでも同じ実装を確認した。

- `src/provisioning/providers/route53-provider.ts`
- `tests/fixtures/cfn-schemas/AWS-Route53-HostedZone.json` では `NameServers: "array"`
- `tests/unit/provisioning/route53-provider.test.ts` は現状、文字列を期待している

GitHubのIssue検索では、同じエラーメッセージまたは `NameServers` と `Fn::Join` の組み合わせに該当する既存Issueは見つからなかった。

### 現在の回避策

FoundationスタックからNameServers一覧のOutputを外した。委任時は次のどちらかで取得する。

```bash
cdkd state show PawapoFoundation --profile pawapo --json
aws route53 get-hosted-zone --id <hosted-zone-id> --profile pawapo
```

本番DNSはまだ切り替えていないため、この回避策による利用者影響はない。

### upstreamへ出すときの確認項目

1. 最新版で最小スタックを実配備し、同じOutput警告が出ることを確認する。
2. Route 53 providerの `NameServers` attributesと `getAttribute` を配列に変更する。
3. provider単体テストを、文字列期待から配列期待へ変更する。
4. `Fn::Join` を含むOutput解決の回帰テストを追加する。
5. 既存CDKD stateが文字列を保持している場合の後方互換を確認する。
6. IssueまたはPull RequestにはAWSアカウントID、Hosted Zone ID、Secret ARNを載せない。

## IAM Role 作成直後の Lambda 作成が伝播待ち不足で失敗する

- 確認日: 2026年8月13日
- 実環境で確認したバージョン: CDKD 0.282.5
- 状態: CDKD 0.283.20で`--exclusively`が追加済み

IAM RoleとLambda Functionに正しい依存関係があっても、ロール作成の数秒後にLambdaを作成すると、次のエラーで失敗した。

```text
The role defined for the function cannot be assumed by Lambda.
```

CloudTrailではLambda `CreateFunction` が `InvalidParameterValueException` を返していた。CDKDの自動ロールバック後も、`RETAIN` と削除保護を付けたCognito User Poolだけが残った。現在の回避策は、Lambda実行ロールとロググループを別スタックで先にデプロイし、IAMの伝播後にAuthスタックをデプロイすること。

upstreamでは、この既知のLambdaエラーを短時間だけ再試行するか、IAM Role作成後に伝播待ちを入れる実装を検討する。再現テストではロールの信頼ポリシーが正しい場合だけを対象とし、恒久的な設定ミスを無限再試行しない。

## 明示スタックの依存スタックも既定でデプロイ対象になる

- 確認日: 2026年8月13日
- 実環境で確認したバージョン: CDKD 0.282.5
- 状態: upstreamへのIssue・Pull Requestは未作成

`cdkd deploy PawapoAuth --dry-run` は依存する `PawapoFoundation` も対象に含めた。この実行時にFoundation用のcontextを省略していたため、予算通知が削除候補として表示された。dry-runだったため実変更はない。

CDKD 0.282.5はCDK CLIの`--exclusively`を受け付けず、`unknown option`で停止していた。CDKD 0.283.20では同オプションを利用できる。単独更新では対象スタック名と`--exclusively`を指定し、全スタックの合成に必要なcontextは省略せず渡す。

## WebAuthnだけのUser PoolでMFAをOPTIONALへ補完して失敗する

- 確認日: 2026年8月13日
- 実環境で確認したバージョン: CDKD 0.282.5
- 状態: upstreamへのIssue・Pull Requestは未作成

Cognito User PoolにWebAuthnのRelying Party IDとユーザー検証方式を指定し、`MfaConfiguration`を省略すると、CDKDは`SetUserPoolMfaConfig`で`OPTIONAL`を補完する。WebAuthnだけではCognitoのMFA要素にならないため、SMS・メールOTP・TOTPのいずれも有効でない構成は次のエラーで失敗した。

```text
Invalid MFA Configuration given. SMS MFA, Email MFA, or Software Token MFA must be enabled.
```

パスキーを第1認証要素として使う構成では、`MfaConfiguration`の既定値は`OFF`である必要がある。現在の回避策は、CDKで`mfa: cognito.Mfa.OFF`を明示すること。upstreamでは、WebAuthnだけを指定した場合の補完値を`OFF`にする修正と回帰テストを検討する。

## Outputsだけの変更を差分・デプロイへ反映しない

- 確認日: 2026年8月14日
- 実環境で確認したバージョン: CDKD 0.282.5
- 状態: upstreamへのIssue・Pull Requestは未作成

既存スタックのリソースを別スタックから新たに参照すると、CDKは参照元スタックへ`Export.Name`付きのOutputを追加する。ところがリソース本体に差分がない場合、`cdkd diff`は「No changes detected」と判定し、`cdkd deploy`も新しいOutputをstateへ保存しなかった。その後、参照先スタックのデプロイは`Fn::ImportValue: export ... not found`で失敗した。

現在の回避策は、参照元スタックの既存リソースへ説明文などの安全な更新を同時に加え、通常のリソース更新としてデプロイしてOutputもstateへ保存させること。upstreamでは、Outputの追加・更新・削除を差分対象に含め、リソース差分が0件でもstateへ反映する修正と回帰テストを検討する。

## コンテナイメージLambdaで非対応設定をドリフト警告として表示する

- 確認日: 2026年8月14日
- 実環境で確認したバージョン: CDKD 0.282.5
- 状態: upstreamへのIssue・Pull Requestは未作成

Lambda Web Adapterを入れたコンテナイメージ形式のLambdaをデプロイしたところ、作成自体は成功したが、ドリフト用スナップショットの取得時に次の警告が出た。

```text
GetRuntimeManagementConfig failed ... container image function
GetFunctionCodeSigningConfig failed ... Code signing is not supported for functions created with container images
```

どちらもコンテナイメージ形式ではAWS側が対応していない設定であり、取得失敗は実リソースの異常ではない。CDKD自身も「差分上の誤った削除として見える可能性がある」と警告している。upstreamでは、Lambdaの`PackageType`が`Image`の場合にこの2項目をドリフト取得対象から外し、不要な警告と誤差分を出さない回帰テストを検討する。

## Cognito IDプロバイダーのクライアントシークレットをstateへ平文保存する

- 確認日: 2026年8月14日
- 実環境で確認したバージョン: CDKD 0.282.5
- 状態: GitHub Security Advisory GHSA-p5qg-v9gv-hc7wとして公開され、CDKD 0.283.20で修正済み

Secrets Managerの動的参照を`AWS::Cognito::UserPoolIdentityProvider.ProviderDetails.client_secret`へ指定してデプロイすると、CDKDは参照を解決した実値をstateの`Properties`と`Attributes.ProviderDetails`へ保存した。`cdkd state show`もマスクせず表示するため、AWS側で秘匿されるべきOAuthクライアントシークレットがstateとターミナルへ露出する。

CDKD 0.283.20では、Secrets ManagerとSSM SecureStringの動的参照を解決前の式へ戻してstateへ保存する。既存stateは次回デプロイ時に自動で浄化され、`cdkd scrub`でも再デプロイせずに修正できる。すでにstateへ保存された秘密値は漏えい済みとして扱い、別途ローテーションする。

新環境では切替直前の認証リソース置換を避けるため、カスタムリソースの回避策を当面維持する。CDK標準の`UserPoolIdentityProviderGoogle`へ戻す場合は、Google IDプロバイダーを削除・再作成する差分とログイン停止時間を別途確認してから実施する。

## 証明書置換時に利用中の旧証明書の削除を試みる

- 確認日: 2026年8月14日
- 実環境で確認したバージョン: CDKD 0.282.5
- 状態: upstreamへのIssue・Pull Requestは未作成
- 症状: 証明書を別スタックのCloudFrontが利用中のまま置換すると、新証明書の作成後に旧証明書の削除を試み、`ResourceInUseException` の警告が出る。デプロイ状態は新証明書を指すが、旧証明書は残る。
- 回避策: 証明書スタック、利用側スタックの順に完全待機でデプロイし、最後に `InUseBy` が空になった旧証明書だけを削除する。
- コントリビュート候補: スタック間の利用関係がある置換では削除を遅延するか、未削除リソースを後続のcleanup対象として記録する。

---

以下は 2026-08-22、既存Cognitoを取り込んで新基盤へ移す作業で踏んだもの。

## `--output` を既定以外にすると、アセットのコピーが再帰して落ちる

`cdkd synth PawapoAuth --output cdk.out.rehearsal` のように出力先を変えると、
`DockerImageCode.fromImageAsset(<リポジトリルート>)` のステージングが**出力先ごと**コピーし、
`cdk.out.rehearsal/asset.xxx/cdk.out.rehearsal/asset.xxx/...` と入れ子を作り続けて
`ENAMETOOLONG` で異常終了する。

原因は、除外設定が `cdk.json` の `output`（既定 `cdk.out`）や利用者の `exclude` に
書かれた名前だけを見ていて、**実行時に `--output` で指定されたディレクトリが除外に加わらない**こと。

- 期待する挙動: 実行時の出力ディレクトリを、アセットステージングの除外へ自動的に足す
- 影響: 「本番用の cdk.out を汚さずに別構成を synth したい」という自然な使い方が必ず失敗する
- 回避策: `--output` を使わず既定の `cdk.out` を使う

## 取り込んだだけでは Outputs / Export が state に無く、依存スタックが解決できない

`cdkd import` でリソースを state へ入れても、そのスタックの Outputs は記録されない。
その状態で依存側を deploy すると、次のように止まる。

```
Failed to create RuntimeRoleDefaultPolicy...: Fn::ImportValue: export
'PawapoFoundation:ExportsOutputFnGetAttWebSearchGatewayGatewayArnBA97E0DC' not found in any stack.
```

エラー文は正確だが、**「import 後に一度 deploy すれば解決する」ことがどこにも書かれていない**。
実際、差分ゼロのまま `cdkd deploy` を1回流すと（`Unchanged: 5`）Outputs が記録され、依存側が通る。

- 期待する挙動: import 時に Outputs も解決して state へ書く。難しければ、
  この Fn::ImportValue エラーに「取り込み済みで未デプロイのスタックがあります。
  一度 `cdkd deploy <stack>` を流してください」と示す
- 影響: 取り込みを伴う移行で必ず1回踏む。エラーだけ見ると「Export 名が違う」と誤診しやすい

## 子リソースの物理IDが複合キーであることを、エラー文から読み取れない

User Pool Client や User Pool Domain のような子リソースは、物理IDを `<親ID>|<子ID>` で渡す必要がある。
子IDだけを渡すとこうなる。

```
Failed to import UserPoolWebClient...: Identifier 1h57kexampleclientid00 is not valid
for identifier [/properties/UserPoolId, /properties/ClientId]
```

必要な**プロパティ名は出ているが、区切り文字と順序が書かれていない**ため、
`|` 区切りだと分かるまで試行錯誤になる。

- 期待する挙動: メッセージに具体例を添える
  （例: `expected "<UserPoolId>|<ClientId>", e.g. us-east-1_ABC123|1h57kfxxxxx`）
- 影響: 既存リソースの取り込みは初回が最も不安な作業なので、ここで詰まると心理的コストが高い

## `--state-prefix` が `synth` にだけ無い

`import` / `diff` / `deploy` は `--state-prefix` を受け付けるが、`synth` は
`error: unknown option '--state-prefix'` で落ちる。

同じ context 一式を並べたコマンドを、頭のサブコマンドだけ替えて実行する使い方
（リハーサル環境の検証）で確実に踏む。synth は state を読まないので**無視でよいから受理してほしい**。

## `--full-wait` ＋ DNS検証待ちの証明書で、永久に待って state を失う

`cdkd deploy PawapoFoundation --full-wait` は、ACM 証明書が `ISSUED` になるまで待つ。
DNS 検証は**利用者が検証レコードを入れるまで完了しない**ので、自力では決して終わらない。
待ち続けた末に中断すると、**AWS 上にはリソースが作られているのに state が書かれない**。
結果、5つの孤児リソース（証明書・IAMロール・インラインポリシー・Gateway・GatewayTarget）を
手で物理IDを調べて import し直すことになった。

- 期待する挙動: DNS検証待ちの証明書は待機の対象から外す。
  少なくとも「検証レコードをこのゾーンへ入れてください」と提示して待機を打ち切る
- あわせて: 中断時に、それまでに作成できたリソースを state へ書き出してほしい
  （孤児化を防ぐのが本質。ロールバックできる場合はロールバックでもよい）

## 部分取り込みで未解決になった intrinsic の直し方が示されない

一部だけ取り込むと、まだ state に無い兄弟リソースを指す `Fn::GetAtt` が解決できず、警告が出る。

```
Failed to resolve intrinsics in Properties for imported resource 'UserPool...':
Resource GoogleLinkFunctionFB2A52DF not found for Fn::GetAtt. State will be written with
the raw intrinsic shape, which may cause 'cdkd destroy' to fail on this resource
```

実際には、そのまま `cdkd deploy` すれば兄弟リソースが作られて解決する。
**警告文が `destroy` の失敗だけに触れていて、「次の deploy で解消する」normal path を書いていない**ため、
状態が壊れたのかと不安になる。一文足すだけで印象が変わる。

---

## 上記6件の検証結果（2026-08-22）

上の6件を、npm で配布されている CDKD **0.284.37**（当日の最新）と、本リポジトリが固定している
**0.283.20** の両方について、公開パッケージ同梱の source map から元のTypeScriptを取り出して確認した。
`cdkd synth --state-prefix` だけは 0.284.37 を実際に実行して再現させている。
結論として、**upstreamへ出すべきは1件、出せるが小粒なものが2件、出すべきでないものが3件**。

| # | 追記した見立て | 検証結果 |
|---|----------------|----------|
| 1 | `--output` でアセットのコピーが再帰する | **CDKDの不具合ではない**。出さない |
| 2 | import しただけでは Outputs が state に無い | **仕様。エラー文も既に案内済み**。出さない |
| 3 | 子リソースの複合物理IDがエラー文から読めない | 改善余地あり（小）。候補B |
| 4 | `--state-prefix` が `synth` に無い | 0.284.37 で再現。候補C（小） |
| 5 | `--full-wait` ＋ DNS検証待ちで永久に待ち state を失う | **前提は誤り。ただし孤児化は別原因の実バグ**。候補A（本命） |
| 6 | 部分取り込みの警告に normal path が無い | 既に対処済みの文言。単独では出さない |

### 1. `--output` の再帰は CDKD ではなく aws-cdk-lib の挙動

aws-cdk-lib 2.264.0 の `AssetStaging` が除外へ自動で足すのは `.is_custom_resource` だけで、
**アセンブリの出力先ディレクトリを除外しない**（`core/lib/asset-staging.js`）。
コピー本体の `FileSystem.copyDirectory` にも自己コピーを止める仕掛けは無い（`core/lib/fs/copy.js`）。
CDKD も本家 `cdk` CLI も、出力先は `CDK_OUTDIR` 環境変数でアプリへ渡すだけなので
（`src/synthesis/app-executor.ts:64`）、この再帰は**どちらのCLIでも同じように起きる**。
CLIを介さず `CDK_OUTDIR=cdk.out.rehearsal node app.mjs` を直接実行しても出力先がアセットへ入ることを確認した。

つまり原因は、こちらのアプリ側で除外名を `cdk.out` と直書きしていること
（`infra/lib/web-stack.ts` の `exclude`、`agent-stack.ts` も同様）。
出力先を変える運用を続けるなら、除外を `cdk.out*` 相当へ広げるのがこちらの直し。
上流へ出すとしても宛先は aws-cdk であって CDKD ではない。

### 2. import が Outputs を書かないのは仕様、案内も既にある

`src/cli/commands/import.ts` の `buildStackState` に
「the import flow never derives outputs (they're computed at deploy time from each resource's attributes)」
と明記されている。`Fn::ImportValue` 側のエラー文も 0.284.37 では
`Make sure the exporting stack has been deployed and the Output has an Export.Name property.`
まで書いてあり、「取り込んだだけでまだ deploy していない」状況はこの一文で射程に入る。
これ単独ではissueにしない。

### 3. 複合物理IDのエラー文（候補B・小）

`Identifier ... is not valid for identifier [...]` は Cloud Control API が返す文面で、CDKD は加工していない。
ただし CDKD は CFn schema の `primaryIdentifier` を自前で持っている（`src/cli/commands/export.ts` に多数の参照）ので、
`import` の失敗時に期待する複合形を組み立てて添えることは可能。過去に
[#1651](https://github.com/go-to-k/cdkd/issues/1651)（Glue Table の `<db>|<table>`）で同種の問題を扱っている。

### 4. `--state-prefix` が `synth` に無い（候補C・小）

0.284.37 で再現した。

```
$ cdkd synth --state-prefix foo --app "node -e 1"
error: unknown option '--state-prefix'
```

`src/cli/commands/synth.ts` は `appOptions` / `commonOptions` / `contextOptions` /
`annotationMessageOptions` だけを取り、`stateOptions` を取らない。synth は state を読まないので
挙動としては正しいが、`import` / `diff` / `deploy` と同じ引数列を頭のサブコマンドだけ替えて回す使い方では落ちる。
「受理して無視」を求める小さな要望として出せる。

### 5. 孤児化の真因は「タイムアウト時に取得済みのARNを捨てている」こと（候補A・本命）

追記した見立てのうち、次の2点は**0.283.20 の時点で既に満たされていた**ので、そのままでは出せない。

- 「永久に待つ」→ 待機は無制限ではなく**既定10分**（60回 × 10秒。`CDKD_ACM_POLL_ATTEMPTS` /
  `CDKD_ACM_POLL_INTERVAL_MS` で変更可、`--resource-timeout` でも上書き可）
- 「検証レコードを提示してほしい」→ 最初の `PENDING_VALIDATION` で
  `logger.info` により CNAME 一式を表示済み（`logValidationOptions`）
- Ctrl+C の場合も、待機ループは中断フラグを見て**正常 return** するので ARN は state へ入る

一方で、**孤児が出る経路は実在する**。`ACMCertificateProvider.create()` は
`RequestCertificate` が返した `certificateArn` を握っているのに、待機がタイムアウトすると
素の `Error` を投げ（`acm-certificate-provider.ts:600`）、外側の catch がそれを
`ProvisioningError` へ包み直す際に **physicalId へ明示的に `undefined` を渡している**（同 227行目）。
`DomainValidation` が `FAILED` / `VALIDATION_TIMED_OUT` などの終了状態に落ちた経路（同 575行目）も同じ。

CDKD には「CREATE が実体を作った後で失敗した」ための受け皿があり、
`ProvisioningError.physicalId` を見て残骸を掃除する実装が Cloud Control 側にある
（`src/provisioning/cloud-control-provider.ts:381-435`）。`glue-provider.ts:968` は実際に physicalId を渡している。
ACM プロバイダーだけがこの線路に乗っていない。しかも `RequestCertificate` は
`IdempotencyToken` を付けず、既存の同一ドメイン証明書を再利用もしないので、
**再実行のたびに新しい証明書が増える**。

これが「デプロイは失敗、AWS には証明書が残る、state には無い」の説明になる。修正は
`throw new ProvisioningError(msg, resourceType, logicalId, certificateArn, cause)` に相当する小さな変更で、
リポジトリ自身の既存パターンと一致する。issueとして出す価値が最も高い。

### 6. 部分取り込みの警告は既に案内入り

0.283.20 と 0.284.37 で文言は同一で、`import.ts` の該当行は既に
`re-import once every referenced sibling is in state, or remove this resource via 'cdkd state orphan'`
まで書いている。足すとしたら「次の deploy で解消する」の一文だけなので、候補Bへ同梱するなら可、単独では出さない。

### 出すときの本文（候補A）

````text
Title: fix(acm): a certificate whose ISSUED wait times out is lost — create() drops the ARN it already holds, so each retry orphans another certificate

Version: 0.284.37 (same code in 0.283.20)

## What happens

`ACMCertificateProvider.create()` calls `RequestCertificate`, then waits for the
certificate to reach `ISSUED` (default 60 polls x 10s = 10 minutes).

For a DNS-validated certificate the wait can only finish once the validation
records are live, so a first deploy that creates the certificate before its
validation records exist reliably reaches the timeout.

On that path the ARN is thrown away:

- `waitForCertificateIssued()` throws a plain `Error` whose only reference to the
  certificate is inside the message text (acm-certificate-provider.ts:600). The
  terminal-status branch (FAILED / VALIDATION_TIMED_OUT / ...) does the same
  (line 575).
- `create()`'s catch wraps it in a `ProvisioningError` and passes `undefined` for
  `physicalId` (line 227), even though `certificateArn` is in scope.

The certificate exists in AWS at that moment, but nothing downstream can name it:
it is not written to state, and `ProvisioningError.physicalId` — the field the
failed-CREATE remnant cleanup keys on (cloud-control-provider.ts:381-435) — is
empty. `RequestCertificate` is also called without an `IdempotencyToken`, and
`create()` does not look for an existing certificate for the same domain, so the
next `cdkd deploy` requests another one.

We hit this while migrating an existing environment: the deploy failed, and the
certificate stayed behind with no record of it in state. It had to be located by
hand and re-adopted with `cdkd import`.

## Expected

The ARN that `RequestCertificate` already returned should survive the failure,
e.g.

```ts
throw new ProvisioningError(message, resourceType, logicalId, certificateArn, cause);
```

the way `glue-provider.ts:968` does, so the existing failed-CREATE handling can
record or clean up the certificate instead of losing track of it. Whether the
remnant should then be deleted or kept for the retry is your call — a
`PENDING_VALIDATION` certificate the user has already added DNS records for may
be worth keeping.

## Steps to reproduce

1. Define a DNS-validated `AWS::CertificateManager::Certificate` for a domain
   whose validation records are not in place.
2. `cdkd deploy <stack>`.
3. After ~10 minutes: `ACM certificate <id> (<arn>) did not reach ISSUED status
   within 600s`.
4. `cdkd state show <stack>` has no entry for the certificate, while
   `aws acm list-certificates` shows it as `PENDING_VALIDATION`.
5. Re-running the deploy creates a second certificate.

## Notes

- The wait itself looks right: it is bounded, and `logValidationOptions()` prints
  the CNAMEs to add on the first `PENDING_VALIDATION` poll. SIGINT during the
  wait also returns normally, so that path keeps the ARN. This report is only
  about the throw paths.
- Steps 1-5 describe the shape of the failure we hit in a real migration; the
  code references above are from the published 0.284.37 bundle's source maps.
````
