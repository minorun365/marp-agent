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
- 状態: upstreamへのIssue・Pull Requestは未作成

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

単独更新では `--exclusively` を使う。CLIの動作自体はCDK互換だが、本番でcontext依存リソースを扱うときに意図しない削除を招きやすいため、対象スタック以外にも差分がある場合の警告強化やドキュメント改善を検討する。

## WebAuthnだけのUser PoolでMFAをOPTIONALへ補完して失敗する

- 確認日: 2026年8月13日
- 実環境で確認したバージョン: CDKD 0.282.5
- 状態: upstreamへのIssue・Pull Requestは未作成

Cognito User PoolにWebAuthnのRelying Party IDとユーザー検証方式を指定し、`MfaConfiguration`を省略すると、CDKDは`SetUserPoolMfaConfig`で`OPTIONAL`を補完する。WebAuthnだけではCognitoのMFA要素にならないため、SMS・メールOTP・TOTPのいずれも有効でない構成は次のエラーで失敗した。

```text
Invalid MFA Configuration given. SMS MFA, Email MFA, or Software Token MFA must be enabled.
```

パスキーを第1認証要素として使う構成では、`MfaConfiguration`の既定値は`OFF`である必要がある。現在の回避策は、CDKで`mfa: cognito.Mfa.OFF`を明示すること。upstreamでは、WebAuthnだけを指定した場合の補完値を`OFF`にする修正と回帰テストを検討する。

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
