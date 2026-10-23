import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SlidePreview } from './SlidePreview';

vi.mock('@marp-team/marpit-svg-polyfill', () => ({ observe: () => () => undefined }));

const noop = () => undefined;

describe('SlidePreview', () => {
  it('運営者向けの非公開テーマを、組み込みのテーマの後ろに選択肢として出す', () => {
    render(
      <SlidePreview
        markdown="# タイトル"
        selectedTheme="speee"
        extraThemes={[{ id: 'corp', name: 'Corp', css: '/* @theme corp */ section { color: red; }' }]}
        onThemeChange={noop}
        onDownloadPdf={noop}
        onDownloadPptx={noop}
        onDownloadEditablePptx={noop}
        onShareSlide={noop}
        isDownloading={false}
      />,
    );

    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toContain('Corp');
    expect(options.indexOf('Corp')).toBe(options.length - 1);
  });
});
