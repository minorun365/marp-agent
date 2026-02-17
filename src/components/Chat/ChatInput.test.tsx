import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatInput } from './ChatInput';
import * as types from './types';

const defaultProps = {
  input: '',
  setInput: vi.fn(),
  modelType: 'sonnet' as types.ModelType,
  setModelType: vi.fn(),
  isLoading: false,
  hasUserMessage: false,
  onSubmit: vi.fn((e: React.FormEvent) => e.preventDefault()),
};

describe('ChatInput', () => {
  it('テキスト入力欄が表示される', () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByPlaceholderText('例：AgentCoreの入門資料')).toBeInTheDocument();
  });

  it('送信ボタンが表示される', () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByRole('button', { name: '送信' })).toBeInTheDocument();
  });

  it('入力が空のとき送信ボタンが無効', () => {
    render(<ChatInput {...defaultProps} input="" />);
    expect(screen.getByRole('button', { name: '送信' })).toBeDisabled();
  });

  it('入力があるとき送信ボタンが有効', () => {
    render(<ChatInput {...defaultProps} input="テスト" />);
    expect(screen.getByRole('button', { name: '送信' })).toBeEnabled();
  });

  it('isLoading中は入力欄と送信ボタンが無効', () => {
    render(<ChatInput {...defaultProps} input="テスト" isLoading={true} />);
    expect(screen.getByPlaceholderText('例：AgentCoreの入門資料')).toBeDisabled();
    expect(screen.getByRole('button', { name: '送信' })).toBeDisabled();
  });

  it('フォーム送信でonSubmitが呼ばれる', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(<ChatInput {...defaultProps} input="テスト" onSubmit={onSubmit} />);
    fireEvent.submit(screen.getByRole('button', { name: '送信' }).closest('form')!);
    expect(onSubmit).toHaveBeenCalled();
  });

  it('文字数が上限の90%を超えるとカウンターが表示される', () => {
    const longInput = 'あ'.repeat(1801);
    render(<ChatInput {...defaultProps} input={longInput} />);
    expect(screen.getByText(`${longInput.length}/2000`)).toBeInTheDocument();
  });

  it('文字数が上限の90%以下ではカウンターが表示されない', () => {
    render(<ChatInput {...defaultProps} input="短いテキスト" />);
    expect(screen.queryByText(/\/2000/)).not.toBeInTheDocument();
  });

  describe('モデルセレクターの表示制御', () => {
    it('MODEL_OPTIONSが1つのときもセレクターが表示される', () => {
      // 現在の設定（sonnetのみ）でもモデル名を表示するためセレクターは表示
      render(<ChatInput {...defaultProps} />);
      const select = screen.getByTitle('使用するAIモデルを選択');
      expect(select).toBeInTheDocument();
      expect(select.querySelectorAll('option')).toHaveLength(1);
    });

    it('MODEL_OPTIONSが複数のときセレクターが表示される', () => {
      // MODEL_OPTIONSを一時的に複数に変更
      const originalOptions = [...types.MODEL_OPTIONS];
      types.MODEL_OPTIONS.length = 0;
      types.MODEL_OPTIONS.push(
        { value: 'sonnet', label: '標準（Claude Sonnet 4.5）' },
        { value: 'opus', label: '高品質（Claude Opus 4.6）' },
      );

      try {
        render(<ChatInput {...defaultProps} />);
        const select = screen.getByTitle('使用するAIモデルを選択');
        expect(select).toBeInTheDocument();
        expect(select.querySelectorAll('option')).toHaveLength(2);
      } finally {
        // 元に戻す
        types.MODEL_OPTIONS.length = 0;
        originalOptions.forEach(o => types.MODEL_OPTIONS.push(o));
      }
    });

    it('会話中はモデルセレクターが無効になる', () => {
      const originalOptions = [...types.MODEL_OPTIONS];
      types.MODEL_OPTIONS.length = 0;
      types.MODEL_OPTIONS.push(
        { value: 'sonnet', label: '標準（Claude Sonnet 4.5）' },
        { value: 'opus', label: '高品質（Claude Opus 4.6）' },
      );

      try {
        render(<ChatInput {...defaultProps} hasUserMessage={true} />);
        const select = screen.getByTitle('会話中はモデルを変更できません');
        expect(select).toBeDisabled();
      } finally {
        types.MODEL_OPTIONS.length = 0;
        originalOptions.forEach(o => types.MODEL_OPTIONS.push(o));
      }
    });
  });
});
