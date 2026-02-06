# SSEアイドルタイムアウトによるスロットリングエラー対応

## Context

本番環境でOpusモデル使用時に `ModelThrottledException` (日次トークン制限) が発生すると、バックエンドのStrands Agentが内部で4回リトライし全て失敗。その間SSEストリームにイベントが来ないため、フロントエンドでは「考え中...」が永遠に表示され続ける。

**対応**: SSEストリームで10秒間データが来なかった場合、ユーザーに分かりやすいエラーメッセージを表示してloading状態を終了する。

## 変更ファイル (4ファイル + テスト)

### 1. `src/hooks/streaming/sseParser.ts`
- `SSEIdleTimeoutError` カスタムエラークラスを追加（exportする）
- `readSSEStream` に第4引数 `idleTimeoutMs?: number` を追加
- `reader.read()` を `Promise.race` でタイムアウト検知（各ループイテレーションごと）
- `idleTimeoutMs` が未指定の場合は既存動作と完全一致（エクスポートAPIに影響なし）

### 2. `src/hooks/api/agentCoreClient.ts`
- 定数 `SSE_IDLE_TIMEOUT_MS = 10_000` を追加
- `SSEIdleTimeoutError` をimport
- `readSSEStream` 呼び出しに第4引数としてタイムアウト値を渡す

### 3. `src/components/Chat/constants.ts`
- `MESSAGES` に `ERROR_MODEL_THROTTLED` を追加
  - 文面: `モデルの負荷が高いようです。しばらく時間を置いてからリトライするか、他のモデルをお試しください。`

### 4. `src/components/Chat/hooks/useChatMessages.ts`
- `SSEIdleTimeoutError` をimport
- `onError` コールバック内で `error instanceof SSEIdleTimeoutError` を判定
- マッチした場合は `MESSAGES.ERROR_MODEL_THROTTLED` を表示
- catch節にも同様の分岐を追加（防御的）

### 5. `src/hooks/streaming/sseParser.test.ts`
- タイムアウト発生時に `SSEIdleTimeoutError` がthrowされるテスト
- タイムアウト未設定時は既存動作と同じテスト

## 検証方法
1. `npm run test` でユニットテスト
2. `npm run build` でビルド確認
3. `VITE_USE_MOCK=true npm run dev` で動作確認（mockClient に一時的にハング再現コードを入れて10秒後にメッセージが出ることを確認）

## 実装結果

✅ **実装完了** (2026-02-06)

- 全5ファイルの変更をコミット済み (`94fcd15`)
- ユニットテスト12件すべてパス（タイムアウト関連3件を新規追加）
- ビルド成功確認済み
