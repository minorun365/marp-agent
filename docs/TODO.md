# パワポ作るマン TODO

## GitHub Issues（解消しやすい順）

### ✅ #5 ブラウザによってはタイトルバーが折り返されてダサい
**対応済み** — ヘッダーをレスポンシブ化（`truncate`で省略表示、ログアウトボタン縮小、`flex-shrink-0`で被り防止）

---

### ✅ #4 PDFダウンロードを2連続で行った際、ツイート督促メッセージがうざい
**対応済み** — `hasShownSharePrompt`フラグで初回のみシェア督促を表示

---

### ✅ #3 PDFダウンロードがポップアップブロックされた場合、ユーザーが気づきづらい
**対応済み** — ポップアップブロック検出時に`<a>`タグで直接ダウンロードにフォールバック＋チャットにガイダンス表示

---

### #6 Tavilyレートリミット枯渇に気付きたい
**工数**: 中

**現状**: `agent.py` 44-48行目でレートリミット検出済み。ユーザーには通知するが、**管理者（みのるん）への通知がない**。

**対応方法**:
1. **CloudWatch Logs Insight** でエラーログを検知
   ```
   filter @message like /rate limit/ or @message like /quota/
   ```
2. **CloudWatch Alarm** → **SNS** → メール/Slack通知
3. または `agent.py` 内でSNS直接通知:
   ```python
   import boto3
   sns = boto3.client('sns')
   sns.publish(
     TopicArn='arn:aws:sns:us-east-1:xxx:tavily-alerts',
     Message='Tavily API rate limit exceeded!'
   )
   ```

---

### #7 エラーを監視、通知したい
**工数**: 中

**現状**: エラーログはCloudWatch Logsに出力されているが、アラート設定なし。

**対応方法**:
1. **CDKでCloudWatch Alarm追加** (`amplify/agent/resource.ts`):
   ```typescript
   import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
   import * as sns from 'aws-cdk-lib/aws-sns';

   const errorAlarm = new cloudwatch.Alarm(stack, 'AgentErrorAlarm', {
     metric: new cloudwatch.Metric({
       namespace: 'AWS/Logs',
       metricName: 'IncomingLogEvents',
       dimensionsMap: { LogGroupName: runtime.logGroup.logGroupName },
     }),
     threshold: 5,
     evaluationPeriods: 1,
   });
   ```
2. **AgentCore Observability** で異常検知（既にトレース出力対応済み）
3. **メトリクスフィルター** でエラー率を計測

---

### #2 追加指示の文脈をうまく汲んでくれないことがある
**工数**: 中

**現状**: `agent.py` 139-164行目でセッションID管理、Strands Agentsの会話履歴は保持されている。

**考えられる原因**:
1. **コンテキストウィンドウ超過**: 長い会話で古い履歴が切り捨てられる
2. **現在のマークダウンが長すぎる**: プロンプトに毎回全文を含めている（234-235行目）
3. **システムプロンプトの指示不足**: 「前回の指示を踏まえて」の明示がない

**対応方法**:
1. **システムプロンプト改善** (`agent.py` SYSTEM_PROMPT):
   ```
   ## 重要: 会話の文脈
   - ユーザーの追加指示は、直前のスライドに対する修正依頼です
   - 「もっと」「さらに」「他に」などの言葉は、前回の内容を維持しつつ追加することを意味します
   ```
2. **マークダウンの要約**: 長いスライドは要約版をプロンプトに含める
3. **会話履歴のサマリー機能**: Strands Agentsの `memory` 機能を検討

---

### #8 検索APIキーの自動ローテーションに対応したい
**工数**: 大

**現状**: `TAVILY_API_KEY` は環境変数で固定設定（Amplify Console / CDK）。

**対応方法**:
1. **AWS Secrets Manager** でAPIキーを管理
2. **Lambda Rotation Function** を作成:
   - 定期的に新しいAPIキーを取得（Tavily API経由 or 手動更新）
   - Secrets Managerの値を更新
3. **AgentCore RuntimeからSecrets Manager参照**:
   ```python
   import boto3
   secrets = boto3.client('secretsmanager')
   secret = secrets.get_secret_value(SecretId='tavily-api-key')
   TAVILY_API_KEY = json.loads(secret['SecretString'])['api_key']
   ```
4. **CDKでSecrets Manager + IAM権限追加**

**注意**: Tavily APIがキーローテーションAPIを提供しているか要確認。

---

### #9 作成したスライドを他の人と共有できるようにしたい
**工数**: 大

**現状**: スライドはフロントエンドのReact state（メモリ）のみ。永続化なし。

**対応方法**:

**1. インフラ追加（CDK）**:
```typescript
// DynamoDB テーブル
const slidesTable = new dynamodb.Table(stack, 'SlidesTable', {
  partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'slideId', type: dynamodb.AttributeType.STRING },
});

// S3 バケット（マークダウン/PDF保存）
const slidesBucket = new s3.Bucket(stack, 'SlidesBucket', {
  cors: [{ allowedMethods: [s3.HttpMethods.GET], allowedOrigins: ['*'] }],
});
```

**2. データモデル**:
```
DynamoDB スキーマ:
- userId (PK)
- slideId (SK)
- shareId (短縮URL用、GSI)
- title
- s3Key (マークダウン保存先)
- isPublic
- createdAt
```

**3. API追加**:
- `POST /slides` - スライド保存、shareId発行
- `GET /slides/{shareId}` - 共有スライド取得（認証不要）

**4. フロントエンドUI**:
- 「共有リンクをコピー」ボタン追加（SlidePreview.tsx）
- 共有ページ作成（/share/{shareId}）

---

## 今後のタスク

| タスク | 説明 | 影響範囲 |
|--------|------|----------|
| 環境識別子のリネーム | main→prod、dev→sandbox に変更 | リソース名変更（AgentCore Runtime再作成の可能性あり） |

### 環境識別子リネームの詳細

**現状:**
| 識別子 | 用途 |
|--------|------|
| main | 本番環境（mainブランチ） |
| dev | sandbox環境（ローカル開発） |

**変更後:**
| 識別子 | 用途 |
|--------|------|
| prod | 本番環境（mainブランチ） |
| sandbox | sandbox環境（ローカル開発） |

**変更が必要なファイル:**
- `amplify/backend.ts` - branchName/環境名の判定ロジック
- `amplify/agent/resource.ts` - ランタイム名の生成ロジック

**注意事項:**
- AgentCore Runtimeのランタイム名が変わるため、新しいRuntimeが作成される
- 既存のRuntime（marp_agent_main, marp_agent_dev）は手動削除が必要になる可能性あり
- Amplify Consoleの環境変数設定も確認が必要

---

## 追加機能（Phase 2）

| タスク | 状態 | 工数 |
|--------|------|------|
| チャット応答のマークダウンレンダリング | ✅ | 中 |
| テーマ選択 | - | 中 |
| スライド編集（マークダウンエディタ） | - | 大 |
