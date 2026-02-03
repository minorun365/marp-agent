import { useMemo, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import Marp from '@marp-team/marp-core';
import { observe } from '@marp-team/marpit-svg-polyfill';
import borderTheme from '../themes/border.css?raw';
import gradientTheme from '../themes/gradient.css?raw';
import beamTheme from '../themes/beam.css?raw';

// テーマ定義
const THEMES = [
  { id: 'border', name: 'Border', css: borderTheme },
  { id: 'gradient', name: 'Gradient', css: gradientTheme },
  { id: 'beam', name: 'Beam', css: beamTheme },
] as const;

type ThemeId = typeof THEMES[number]['id'];

interface SlidePreviewProps {
  markdown: string;
  onDownloadPdf: (theme: string) => void;
  onDownloadPptx: (theme: string) => void;
  onShareSlide: (theme: string) => void;
  isDownloading: boolean;
  isSharing: boolean;
  onRequestEdit?: () => void;
}

export function SlidePreview({ markdown, onDownloadPdf, onDownloadPptx, onShareSlide, isDownloading, isSharing: _isSharing, onRequestEdit }: SlidePreviewProps) {
  void _isSharing; // propsとして受け取るが、このコンポーネントでは使用しない
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>('gradient');

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

  // マークダウンにテーマ指定を注入
  const markdownWithTheme = useMemo(() => {
    if (!markdown) return '';

    // 既存のフロントマターを解析
    const frontMatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);

    if (frontMatterMatch) {
      // 既存のフロントマターにthemeを追加/上書き
      const frontMatter = frontMatterMatch[1];
      const hasTheme = /^theme:/m.test(frontMatter);

      if (hasTheme) {
        // 既存のthemeを置換
        const newFrontMatter = frontMatter.replace(/^theme:.*$/m, `theme: ${selectedTheme}`);
        return markdown.replace(frontMatterMatch[0], `---\n${newFrontMatter}\n---`);
      } else {
        // themeを追加
        return markdown.replace(frontMatterMatch[0], `---\n${frontMatter}\ntheme: ${selectedTheme}\n---`);
      }
    } else {
      // フロントマターがない場合は追加
      return `---\ntheme: ${selectedTheme}\n---\n\n${markdown}`;
    }
  }, [markdown, selectedTheme]);

  const { slides, css } = useMemo(() => {
    if (!markdownWithTheme) return { slides: [], css: '' };

    try {
      const marp = new Marp();
      // 全カスタムテーマを登録
      THEMES.forEach(theme => {
        if (theme.css) {
          marp.themeSet.add(theme.css);
        }
      });
      const { html, css } = marp.render(markdownWithTheme);

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
  }, [markdownWithTheme]);

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
        <div className="flex flex-col gap-1">
          {/* テーマ選択 */}
          <span className="text-xs text-gray-500">デザイン</span>
          <select
            value={selectedTheme}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedTheme(e.target.value as ThemeId)}
            className="text-sm border rounded px-2 py-1"
          >
            {THEMES.map(theme => (
              <option key={theme.id} value={theme.id}>{theme.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          {onRequestEdit && (
            <button
              onClick={onRequestEdit}
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              修正
            </button>
          )}
          {/* エクスポートドロップダウン */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              disabled={isDownloading || slides.length === 0}
              className="btn-kag text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              {isDownloading ? 'ダウンロード中...' : 'エクスポート'}
              {!isDownloading && <span className="text-xs">▼</span>}
            </button>
            {isDropdownOpen && !isDownloading && slides.length > 0 && (
              <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-10 min-w-[160px]">
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onDownloadPdf(selectedTheme);
                  }}
                  className="block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 active:bg-gray-200 text-left rounded-t-lg whitespace-nowrap"
                >
                  PDF形式でダウンロード
                </button>
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onDownloadPptx(selectedTheme);
                  }}
                  className="block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 active:bg-gray-200 text-left border-t whitespace-nowrap"
                >
                  PPTX形式でダウンロード
                </button>
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onShareSlide(selectedTheme);
                  }}
                  className="block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 active:bg-gray-200 text-left border-t rounded-b-lg flex items-center justify-between whitespace-nowrap"
                >
                  <span>URLで公開</span>
                  <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">NEW</span>
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
              <div className="bg-gray-50 p-1 overflow-hidden">
                <div
                  className="marpit w-full overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: slide.html }}
                />
              </div>
              <div className="bg-gray-100 px-3 py-1 text-xs text-gray-600 border-t text-center">
                スライド {slide.index + 1}/{slides.length}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
