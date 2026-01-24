import { useMemo } from 'react';
import Marp from '@marp-team/marp-core';
import borderTheme from '../themes/border.css?raw';

interface SlidePreviewProps {
  markdown: string;
  onDownloadPdf: () => void;
  isDownloading: boolean;
  onRequestEdit?: () => void;
}

export function SlidePreview({ markdown, onDownloadPdf, isDownloading, onRequestEdit }: SlidePreviewProps) {
  const { slides, css } = useMemo(() => {
    if (!markdown) return { slides: [], css: '' };

    try {
      const marp = new Marp();
      // カスタムテーマ「border」を追加
      marp.themeSet.add(borderTheme);
      const { html, css } = marp.render(markdown);

      // Marpが生成したsvg要素をそのまま抽出（DOM構造を維持）
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const svgs = doc.querySelectorAll('svg[data-marpit-svg]');

      return {
        slides: Array.from(svgs).map((svg, index) => ({
          index,
          html: svg.outerHTML,
        })),
        css,
      };
    } catch (error) {
      console.error('Marp render error:', error);
      return { slides: [], css: '' };
    }
  }, [markdown]);

  if (!markdown) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <p className="text-lg">スライドがありません</p>
          <p className="text-sm mt-2">チャットでスライドを生成してください</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="flex justify-between items-center px-6 py-4 border-b">
        <span className="text-sm text-gray-600">
          {slides.length} スライド
        </span>
        <div className="flex gap-2">
          {onRequestEdit && (
            <button
              onClick={onRequestEdit}
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              修正を依頼
            </button>
          )}
          <button
            onClick={onDownloadPdf}
            disabled={isDownloading || slides.length === 0}
            className="btn-kag text-white px-4 py-2 rounded-lg flex items-center gap-2"
          >
            {isDownloading ? '生成中...' : 'PDFダウンロード'}
          </button>
        </div>
      </div>

      {/* スライド一覧 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <style>{css}</style>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {slides.map((slide) => (
            <div
              key={slide.index}
              className="border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-white"
            >
              <div className="bg-gray-100 px-3 py-1 text-xs text-gray-600 border-b">
                スライド {slide.index + 1}
              </div>
              <div className="aspect-video overflow-hidden flex items-center justify-center bg-gray-50">
                <div
                  className="marpit w-full h-full [&>svg]:!w-full [&>svg]:!h-auto [&>svg]:!max-h-full [&>svg]:block [&>svg]:mx-auto"
                  dangerouslySetInnerHTML={{ __html: slide.html }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
