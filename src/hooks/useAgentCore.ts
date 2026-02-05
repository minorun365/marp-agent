/**
 * AgentCore API統合モジュール
 * 各機能は分割されたモジュールからre-export
 */

// 型定義
export type { AgentCoreCallbacks, ModelType } from './api/agentCoreClient';
export type { ShareResult, ExportFormat } from './api/exportClient';

// 本番API
export { invokeAgent } from './api/agentCoreClient';
export { exportPdf, exportPptx, exportSlide, shareSlide } from './api/exportClient';

// モック（ローカル開発用）
export { invokeAgentMock, exportPdfMock, exportPptxMock, shareSlideMock } from './mock/mockClient';
