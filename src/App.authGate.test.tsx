import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Amplifyの認証まわりは呼ばれた事実だけ見たいので差し替える
const hubHandlers: Array<(m: { payload: { event: string; data?: unknown } }) => void> = [];
vi.mock('aws-amplify/utils', () => ({
  Hub: { listen: (_ch: string, fn: (m: { payload: { event: string; data?: unknown } }) => void) => {
    hubHandlers.push(fn);
    return () => undefined;
  } },
}));
vi.mock('aws-amplify/auth', () => ({
  getCurrentUser: () => Promise.reject(new Error('未ログイン')),
  signOut: () => Promise.resolve(),
}));
vi.mock('./components/Auth/AuthScreen', () => ({
  AuthScreen: () => <div data-testid="auth-screen">ログイン画面</div>,
}));
vi.mock('./components/Chat', () => ({ Chat: () => <div /> }));
vi.mock('./components/SlidePreview', () => ({ SlidePreview: () => <div /> }));

import App from './App';

describe('ログイン画面の差し替わり方', () => {
  beforeEach(() => { hubHandlers.length = 0; });

  it('signedIn を受けてもログイン画面を閉じない（パスキー案内へ進む前に消えてしまうため）', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('auth-screen')).toBeInTheDocument());

    hubHandlers.forEach((fn) => fn({ payload: { event: 'signedIn' } }));

    // 画面内のログインは AuthScreen 側が閉じる。ここで閉じるとパスキー登録の案内が出せない。
    expect(screen.getByTestId('auth-screen')).toBeInTheDocument();
  });

  it('Googleリダイレクトの復帰だけはログイン画面を閉じる', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('auth-screen')).toBeInTheDocument());

    hubHandlers.forEach((fn) => fn({ payload: { event: 'signInWithRedirect' } }));

    await waitFor(() => expect(screen.queryByTestId('auth-screen')).not.toBeInTheDocument());
  });
});
