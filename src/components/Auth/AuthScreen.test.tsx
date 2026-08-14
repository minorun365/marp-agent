import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthScreen } from './AuthScreen';

describe('AuthScreen', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });
  });

  it('Googleとメールだけを最初の選択肢として表示する', () => {
    const { container } = render(<AuthScreen demoMode onAuthenticated={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Googleで続ける/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'メールで続ける' })).toBeInTheDocument();
    expect(screen.queryByLabelText('パスワード')).not.toBeInTheDocument();
    expect(screen.getByText('登録されたメールアドレスは認証目的でのみ使用します。')).toBeInTheDocument();
    expect(screen.queryByText(/利用規約/)).not.toBeInTheDocument();
    expect(container.querySelector('.auth-mark')).not.toBeInTheDocument();
  });

  it('メール入力後はパスキーと従来のパスワードを選べる', () => {
    render(<AuthScreen demoMode onAuthenticated={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'メールで続ける' }));

    expect(screen.getByRole('button', { name: 'パスキーでログイン' })).toBeInTheDocument();
    expect(screen.getByLabelText('パスワード')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'パスワードでログイン' })).toBeInTheDocument();
  });

  it('パスワードログイン後は任意のパスキー案内を一度表示する', async () => {
    render(<AuthScreen demoMode onAuthenticated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'メールで続ける' }));
    fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'パスワードでログイン' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: '次回は、もっとかんたんに' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'あとで' })).toBeInTheDocument();
  });
});
