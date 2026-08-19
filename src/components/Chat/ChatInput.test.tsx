import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatInput } from './ChatInput';
import * as types from './types';

const defaultProps = {
  input: '',
  setInput: vi.fn(),
  modelType: 'grok' as types.ModelType,
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
    // 有効なモデルがGrok 4.6の1件だけになったので、選ばせる意味がない。
    // 2件以上へ戻したときだけセレクターが復活する（ChatInputのshowModelSelector）。
    it('選べるモデルが1件のときはセレクターを出さない', () => {
      render(<ChatInput {...defaultProps} />);
      expect(screen.queryByTitle('使用するAIモデルを選択')).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: '標準（Grok 4.6）' })).not.toBeInTheDocument();
    });

    it('既定のモデルはGrok 4.6である', () => {
      expect(types.MODEL_OPTIONS).toHaveLength(1);
      expect(types.MODEL_OPTIONS[0]).toMatchObject({ value: 'grok', label: '標準（Grok 4.6）' });
      expect(defaultProps.modelType).toBe('grok');
    });
  });
});
