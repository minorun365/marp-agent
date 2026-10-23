import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmSignIn, signIn, signUp } from 'aws-amplify/auth';
import { AuthScreen } from './AuthScreen';
import { LEGACY_OTP_NOTE } from './legacyAccountNote';

vi.mock('aws-amplify/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('aws-amplify/auth')>()),
  signIn: vi.fn(),
  confirmSignIn: vi.fn(),
  signUp: vi.fn(),
}));

describe('AuthScreen', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });
    vi.mocked(signIn).mockReset();
    vi.mocked(confirmSignIn).mockReset();
    vi.mocked(signUp).mockReset();
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

  it('メール入力後はパスキーとメールのコードを選べ、パスワードは出さない', () => {
    render(<AuthScreen demoMode onAuthenticated={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'メールで続ける' }));

    expect(screen.getByRole('button', { name: 'パスキーでログイン' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'メールにコードを送る' })).toBeInTheDocument();
    expect(screen.queryByLabelText('パスワード')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'パスワードを忘れた方' })).not.toBeInTheDocument();
  });

  it('メールのコードでログインしたら、任意のパスキー案内を一度表示する', async () => {
    render(<AuthScreen demoMode onAuthenticated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'メールで続ける' }));
    fireEvent.click(screen.getByRole('button', { name: 'メールにコードを送る' }));
    await waitFor(() => expect(screen.getByLabelText('コード')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('コード'), { target: { value: '12345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: '次回は、もっとかんたんに' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'あとで' })).toBeInTheDocument();
  });

  it('コード入力の画面で、8月14日より前の登録者へ登録し直しを案内する', async () => {
    render(<AuthScreen demoMode onAuthenticated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'メールで続ける' }));
    fireEvent.click(screen.getByRole('button', { name: 'メールにコードを送る' }));

    await waitFor(() => expect(screen.getByText(LEGACY_OTP_NOTE)).toBeInTheDocument());
  });

  it('メールのコードを Cognito の EMAIL_OTP で送り、間違ったコードには理由を出す', async () => {
    vi.mocked(signIn).mockResolvedValueOnce({ isSignedIn: false, nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE' } } as never);
    vi.mocked(confirmSignIn).mockRejectedValueOnce(Object.assign(new Error('Invalid code'), { name: 'CodeMismatchException' }));
    render(<AuthScreen onAuthenticated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('メールアドレス'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'メールで続ける' }));
    fireEvent.click(screen.getByRole('button', { name: 'メールにコードを送る' }));

    await waitFor(() => expect(screen.getByLabelText('コード')).toBeInTheDocument());
    expect(signIn).toHaveBeenCalledWith({
      username: 'user@example.com',
      options: { authFlowType: 'USER_AUTH', preferredChallenge: 'EMAIL_OTP' },
    });
    fireEvent.change(screen.getByLabelText('コード'), { target: { value: '00000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => expect(screen.getByText(/コードが正しくありません/)).toBeInTheDocument());
  });

  it('新規登録はメールアドレスだけで、パスワードを送らない', async () => {
    vi.mocked(signUp).mockResolvedValueOnce({ isSignUpComplete: false, nextStep: { signUpStep: 'CONFIRM_SIGN_UP' } } as never);
    render(<AuthScreen onAuthenticated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'アカウントを作成' }));
    expect(screen.queryByLabelText('パスワード')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('メールアドレス'), { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '確認コードを送る' }));

    await waitFor(() => expect(screen.getByLabelText('確認コード')).toBeInTheDocument());
    expect(signUp).toHaveBeenCalledWith({
      username: 'new@example.com',
      options: { userAttributes: { email: 'new@example.com' }, autoSignIn: { authFlowType: 'USER_AUTH' } },
    });
  });
});
