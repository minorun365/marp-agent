# パワポ作るマン TODO

## 追加機能（Phase 2）

| タスク | 状態 | 工数 |
|--------|------|------|
| チャット応答のマークダウンレンダリング | ✅ | 中 |
| テーマ選択 | - | 中 |
| スライド編集（マークダウンエディタ） | - | 大 |

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
