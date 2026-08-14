# ナレッジベース

開発中に得られた知見・調査結果をここに蓄積していく。

## 目次

| ファイル | 内容 |
|----------|------|
| [setup.md](./setup.md) | 使用ライブラリ、Python環境管理（uv） |
| [backend.md](./backend.md) | AgentCore SDK、Strands Agents、セッション管理、Observability |
| [cdk.md](./cdk.md) | AgentCore CDK、Hotswap、deploy-time-build |
| [marp.md](./marp.md) | Marp CLI、テーマ、Marp Core |
| [frontend.md](./frontend.md) | React、Tailwind CSS、フロントエンド構成 |
| [amplify.md](./amplify.md) | Amplify Gen2、Cognito認証、ビルド設定 |
| [features.md](./features.md) | API接続、シェア機能、共有機能、ローカル開発 |

## 関連ドキュメント（docs/temp）

| ファイル | 内容 |
|----------|------|
| [temp-improvement.md](../temp/temp-improvement.md) | セッション単価改善（分析・施策・効果測定） |

## 検討メモ

| ファイル | 内容 |
|----------|------|
| [migration-architecture.md](../migration-architecture.md) | Amplify 卒業後の AWS 構成、CDKD 運用、ローカル開発、移行手順 |
| [authentication-options.md](../authentication-options.md) | パスキー、Googleログイン、既存ユーザーと将来のCognito移行 |
| [sonnet-quota-subscription-design.md](../sonnet-quota-subscription-design.md) | Sonnet 4.6の月1回お試し枠（初期選択とKimiへの自動フォールバック）、利用回数の管理、将来のサブスクリプション設計 |

## 参考リンク

- [Marp公式](https://marp.app/)
- [Marp Core](https://github.com/marp-team/marp-core)
- [Strands Agents](https://strandsagents.com/)
- [Amplify Gen2](https://docs.amplify.aws/gen2/)
- [AgentCore CDK](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-bedrock-agentcore-alpha-readme.html)
- [uv](https://docs.astral.sh/uv/)
