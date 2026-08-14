# ナレッジベース

開発中に得られた知見・調査結果をここに蓄積していく。

現行の本番は CloudFront + AgentCore を CDK / CDKD でデプロイする。入口は [README](../../README.md)、[開発ガイド](../development.md)、[新基盤のアーキテクチャ](../new-architecture.html)。Amplify Gen2 の自己ホストは [`legacy/amplify`](https://github.com/minorun365/marp-agent/tree/legacy/amplify)。

## 目次

| ファイル | 内容 |
|----------|------|
| [setup.md](./setup.md) | 使用ライブラリ、Python環境管理（uv） |
| [backend.md](./backend.md) | AgentCore SDK、Strands Agents、セッション管理、Observability |
| [cdk.md](./cdk.md) | AgentCore CDK。現行の CDKD 運用と、Amplify 時代の Hotswap 知見 |
| [marp.md](./marp.md) | Marp CLI、テーマ、Marp Core |
| [frontend.md](./frontend.md) | React、Tailwind CSS、フロントエンド構成 |
| [amplify.md](./amplify.md) | Amplify Gen2 時代の Cognito・ビルド知見（現行本番の手順ではない） |
| [features.md](./features.md) | API接続、シェア機能、共有機能、ローカル開発 |

## 関連ドキュメント（docs/temp）

| ファイル | 内容 |
|----------|------|
| [temp-improvement.md](../temp/temp-improvement.md) | セッション単価改善（分析・施策・効果測定） |

## 検討メモ

| ファイル | 内容 |
|----------|------|
| [new-architecture.html](../new-architecture.html) | 現行基盤の構成解説 |
| [migration-architecture.md](../migration-architecture.md) | Amplify 卒業後の AWS 構成、CDKD 運用、移行手順 |
| [authentication-options.md](../authentication-options.md) | パスキー、Googleログイン、既存ユーザーと Cognito 移行 |
| [sonnet-quota-subscription-design.md](../sonnet-quota-subscription-design.md) | Sonnet 4.6の月1回お試し枠、利用回数の管理、将来のサブスクリプション設計 |
| [production-cutover-runbook.md](../production-cutover-runbook.md) | 公開ドメインを新 CloudFront へ切り替えた手順 |

## 参考リンク

- [Marp公式](https://marp.app/)
- [Marp Core](https://github.com/marp-team/marp-core)
- [Strands Agents](https://strandsagents.com/)
- [AgentCore CDK](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-bedrock-agentcore-alpha-readme.html)
- [CDKD](https://github.com/go-to-k/cdkd)
- [uv](https://docs.astral.sh/uv/)
