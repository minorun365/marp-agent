import { useMemo, useEffect, useRef, useState } from 'react';
import Marp from '@marp-team/marp-core';
import { observe } from '@marp-team/marpit-svg-polyfill';
import borderTheme from '../themes/border.css?raw';

interface SlidePreviewProps {
  markdown: string;
  onDownloadPdf: () => void;
  onDownloadPptx: () => void;
  isDownloading: boolean;
  onRequestEdit?: () => void;
}

export function SlidePreview({ markdown, onDownloadPdf, onDownloadPptx, isDownloading, onRequestEdit }: SlidePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Safari/iOS WebKit向けのpolyfillを適用
  useEffect(() => {
    if (containerRef.current) {
      const cleanup = observe(containerRef.current);
      return cleanup;
    }
  }, [markdown]);

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isDropdownOpen]);

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
        slides: Array.from(svgs).map((svg, index) => {
          // SVGのwidth/height属性を変更してレスポンシブ対応
          svg.setAttribute('width', '100%');
          svg.removeAttribute('height');
          svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          return {
            index,
            html: svg.outerHTML,
          };
        }),
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
          {/* ダウンロードドロップダウン */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              disabled={isDownloading || slides.length === 0}
              className="btn-kag text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              {isDownloading ? 'ダウンロード中...' : 'ダウンロード ▼'}
            </button>
            {isDropdownOpen && !isDownloading && slides.length > 0 && (
              <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-10 min-w-[160px]">
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onDownloadPdf();
                  }}
                  className="block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 active:bg-gray-200 text-left rounded-t-lg"
                >
                  PDF形式
                </button>
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onDownloadPptx();
                  }}
                  className="block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 active:bg-gray-200 text-left border-t rounded-b-lg"
                >
                  PPTX形式
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* スライド一覧 */}
      <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4">
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
              <div className="bg-gray-50 p-1 overflow-hidden">
                <div
                  className="marpit w-full overflow-hidden"
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
