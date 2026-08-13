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
