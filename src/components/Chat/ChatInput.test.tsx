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
    it('品質と速度の違いが分かる2モデルだけを選択肢に表示する', () => {
      render(<ChatInput {...defaultProps} />);
      const select = screen.getByTitle('使用するAIモデルを選択');
      expect(select).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '高品質（Claude Sonnet 4.6）' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '高速（Kimi K2.5）' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Claude Sonnet 5' })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'GLM 5' })).not.toBeInTheDocument();
    });

    it('閉じた状態では選択中モデルの特徴を表示する', () => {
      const { rerender } = render(<ChatInput {...defaultProps} />);
      expect(screen.getByText('高品質')).toBeInTheDocument();

      rerender(<ChatInput {...defaultProps} modelType="kimi" />);
      expect(screen.getByText('高速')).toBeInTheDocument();
    });

    it('会話中はモデルセレクターが無効になる', () => {
      render(<ChatInput {...defaultProps} hasUserMessage={true} />);
      const select = screen.getByTitle('会話中はモデルを変更できません');
      expect(select).toBeDisabled();
    });
  });
});
