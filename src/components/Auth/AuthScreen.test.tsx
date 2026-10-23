import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signIn } from 'aws-amplify/auth';
import { AuthScreen } from './AuthScreen';
import { LEGACY_RESET_LEAD, LEGACY_SIGNIN_ERROR } from './legacyAccountNote';

vi.mock('aws-amplify/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('aws-amplify/auth')>()),
  signIn: vi.fn(),
}));

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
  it('パスワードログインに失敗したら、8月14日より前の登録者へ登録し直しを案内する', async () => {
    const error = Object.assign(new Error('Incorrect username or password.'), { name: 'NotAuthorizedException' });
    vi.mocked(signIn).mockRejectedValueOnce(error);
    render(<AuthScreen onAuthenticated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('メールアドレス'), { target: { value: 'old@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'メールで続ける' }));
    fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'パスワードでログイン' }));

    await waitFor(() => expect(screen.getByText(LEGACY_SIGNIN_ERROR)).toBeInTheDocument());

    // 再設定へ進んだら前の画面のエラーは消し、同じ案内を2回並べない
    fireEvent.click(screen.getByRole('button', { name: 'パスワードを忘れた方' }));
    expect(screen.getByText(LEGACY_RESET_LEAD)).toBeInTheDocument();
    expect(screen.queryByText(LEGACY_SIGNIN_ERROR)).not.toBeInTheDocument();
  });

  it('パスワード再設定の画面で、8月14日より前の登録者へ登録し直しを案内する', () => {
    render(<AuthScreen demoMode onAuthenticated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'メールで続ける' }));
    fireEvent.click(screen.getByRole('button', { name: 'パスワードを忘れた方' }));

    expect(screen.getByText(LEGACY_RESET_LEAD)).toBeInTheDocument();
  });
});
