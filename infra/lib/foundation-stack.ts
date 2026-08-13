import * as cdk from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

export interface FoundationStackProps extends cdk.StackProps {
  readonly appDomain: string;
}

export class FoundationStack extends cdk.Stack {
  readonly tavilySecret: secretsmanager.Secret;
  readonly googleOAuthClientSecret: secretsmanager.Secret;
  readonly hostedZone: route53.PublicHostedZone;

  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);

    this.tavilySecret = new secretsmanager.Secret(this, 'TavilyApiKeys', {
      secretName: 'pawapo/tavily-api-keys',
      description: 'パワポ作るマンのWeb検索APIキー',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.googleOAuthClientSecret = new secretsmanager.Secret(this, 'GoogleOAuthClientSecret', {
      secretName: 'pawapo/google-oauth-client-secret',
      description: 'パワポ作るマンのGoogle OAuthクライアントシークレット',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.hostedZone = new route53.PublicHostedZone(this, 'AppHostedZone', {
      zoneName: props.appDomain,
      comment: 'minoruonda.comから委任するパワポ作るマン専用ゾーン',
    });

    const budgetEmail = this.node.tryGetContext('budgetEmail') as string | undefined;
    const monthlyBudgetUsd = Number(this.node.tryGetContext('monthlyBudgetUsd') ?? 100);
    if (budgetEmail) {
      new budgets.CfnBudget(this, 'MonthlyBudget', {
        budget: {
          budgetName: 'pawapo-monthly',
          budgetType: 'COST',
          timeUnit: 'MONTHLY',
          budgetLimit: { amount: monthlyBudgetUsd, unit: 'USD' },
        },
        notificationsWithSubscribers: [{
          notification: {
            comparisonOperator: 'GREATER_THAN',
            notificationType: 'FORECASTED',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: budgetEmail }],
        }],
      });
    }

    new cdk.CfnOutput(this, 'DelegatedZoneId', {
      value: this.hostedZone.hostedZoneId,
    });
  }
}
