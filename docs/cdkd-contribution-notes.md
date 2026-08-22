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
