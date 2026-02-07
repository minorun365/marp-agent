/**
 * スライドエクスポートAPI（PDF/PPTX/共有）
 * ※ PDF/PPTXは90%同じコードだったため統合
 */

import { getAgentCoreConfig } from './agentCoreClient';
import { readSSEStream, base64ToBlob } from '../streaming/sseParser';

export type ExportFormat = 'pdf' | 'pptx';

const MIME_TYPES: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/**
 * スライドをエクスポート（PDF/PPTX共通処理）
 */
export async function exportSlide(
  markdown: string,
  format: ExportFormat,
  theme: string = 'border'
): Promise<Blob> {
  const { url, accessToken } = await getAgentCoreConfig();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      action: `export_${format}`,
      markdown,
      theme,
    }),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  let resultBlob: Blob | null = null;

  await readSSEStream(reader, (event) => {
    if (event.type === format && event.data) {
      resultBlob = base64ToBlob(event.data as string, MIME_TYPES[format]);
      return 'stop';
    } else if (event.type === 'error') {
      throw new Error((event.message || event.error || `${format.toUpperCase()}生成エラー`) as string);
    }
  });

  if (!resultBlob) {
    throw new Error(`${format.toUpperCase()}生成に失敗しました`);
  }

  return resultBlob;
}

// 後方互換性のための関数
export async function exportPdf(markdown: string, theme: string = 'border'): Promise<Blob> {
  return exportSlide(markdown, 'pdf', theme);
}

export async function exportPptx(markdown: string, theme: string = 'border'): Promise<Blob> {
  return exportSlide(markdown, 'pptx', theme);
}

/**
 * スライド共有結果
 */
export interface ShareResult {
  url: string;
  expiresAt: number;
}

/**
 * スライドを共有（S3にアップロードして公開URLを取得）
 */
export async function shareSlide(markdown: string, theme: string = 'border'): Promise<ShareResult> {
  const { url, accessToken } = await getAgentCoreConfig();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      action: 'share_slide',
      markdown,
      theme,
    }),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  let result: ShareResult | null = null;

  await readSSEStream(reader, (event) => {
    if (event.type === 'share_result' && event.url) {
      result = {
        url: event.url as string,
        expiresAt: event.expiresAt as number,
      };
      return 'stop';
    } else if (event.type === 'error') {
      throw new Error((event.message || event.error || 'スライド共有エラー') as string);
    }
  });

  if (!result) {
    throw new Error('スライド共有に失敗しました');
  }

  return result;
}
