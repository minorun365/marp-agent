import { useEffect, useState, type FormEvent } from 'react';
import {
  associateWebAuthnCredential,
  confirmResetPassword,
  confirmSignUp,
  resendSignUpCode,
  resetPassword,
  signIn,
  signInWithRedirect,
  signUp,
} from 'aws-amplify/auth';
import './AuthScreen.css';

type AuthState = 'initial' | 'email' | 'signup' | 'verify' | 'reset' | 'resetConfirm' | 'offer';

const authStates: readonly AuthState[] = ['initial', 'email', 'signup', 'verify', 'reset', 'resetConfirm', 'offer'];
const PASSKEY_OFFER_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

function demoInitialState(demoMode: boolean): AuthState {
  if (!demoMode) return 'initial';
  const requestedState = window.location.hash.slice(1) as AuthState;
  return authStates.includes(requestedState) ? requestedState : 'initial';
}

function PasskeyIcon() {
  return (
    <svg className="auth-passkey-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8.2" cy="10.2" r="3.6" />
      <path d="M11.2 12.2 20 12.2M17 12.2V15M14.2 12.2V14.2" />
    </svg>
  );
}

interface AuthScreenProps {
  readonly demoMode?: boolean;
  readonly initialError?: string;
  readonly onAuthenticated: () => void;
}

function toMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.name === 'NotAuthorizedException' || error.name === 'UserNotFoundException') {
      return 'メールアドレスまたは認証情報を確認してください。';
    }
    if (error.name === 'UsernameExistsException') {
      return 'このメールアドレスは登録済みです。ログインをお試しください。';
    }
    return error.message;
  }
  return '認証処理に失敗しました。時間をおいてもう一度お試しください。';
}

export function AuthScreen({ demoMode = false, initialError = '', onAuthenticated }: AuthScreenProps) {
  const [state, setState] = useState<AuthState>(() => demoInitialState(demoMode));
  const [email, setEmail] = useState(demoMode ? 'you@example.com' : '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [state]);

  // リダイレクトログインの失敗は画面の再表示としてしか現れないため、
  // 親から届いた理由をそのまま初期エラーとして出す。
  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);

  const run = async (operation: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await operation();
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const continueWithEmail = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setState('email');
  };

  const passwordSignIn = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (demoMode) {
        setState('offer');
        return;
      }
      const result = await signIn({
        username: email,
        password,
        options: { authFlowType: 'USER_PASSWORD_AUTH' },
      });
      if (!result.isSignedIn) {
        throw new Error('ログインを完了できませんでした。パスワード再設定をお試しください。');
      }
      const registered = localStorage.getItem(`pawapo-passkey-registered:${email}`) === 'true';
      const dismissedAt = Number(localStorage.getItem(`pawapo-passkey-offer-dismissed-at:${email}`));
      const coolingDown = Number.isFinite(dismissedAt)
        && Date.now() - dismissedAt < PASSKEY_OFFER_COOLDOWN_MS;
      if (registered || coolingDown) onAuthenticated();
      else setState('offer');
    });
  };

  const passkeySignIn = () => {
    void run(async () => {
      if (demoMode) {
        onAuthenticated();
        return;
      }
      const result = await signIn({
        username: email,
        options: {
          authFlowType: 'USER_AUTH',
          preferredChallenge: 'WEB_AUTHN',
        },
      });
      if (!result.isSignedIn) {
        throw new Error('パスキーでログインできませんでした。パスワードでログインしてください。');
      }
      localStorage.setItem(`pawapo-passkey-registered:${email}`, 'true');
      onAuthenticated();
    });
  };

  const createAccount = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (!demoMode) {
        await signUp({
          username: email,
          password,
          options: { userAttributes: { email } },
        });
      }
      setCode('');
      setState('verify');
    });
  };

  const verifyAccount = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (!demoMode) {
        await confirmSignUp({ username: email, confirmationCode: code });
        const result = await signIn({
          username: email,
          password,
          options: { authFlowType: 'USER_PASSWORD_AUTH' },
        });
        if (!result.isSignedIn) throw new Error('登録後のログインに失敗しました。');
      }
      setState('offer');
    });
  };

  const requestReset = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (!demoMode) await resetPassword({ username: email });
      setCode('');
      setPassword('');
      setState('resetConfirm');
    });
  };

  const finishReset = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (!demoMode) {
        await confirmResetPassword({ username: email, confirmationCode: code, newPassword: password });
      }
      setState('email');
    });
  };

  const registerPasskey = () => {
    void run(async () => {
      if (!demoMode) await associateWebAuthnCredential();
      localStorage.setItem(`pawapo-passkey-registered:${email}`, 'true');
      localStorage.setItem(`pawapo-passkey-offer-dismissed:${email}`, 'true');
      onAuthenticated();
    });
  };

  const dismissPasskey = () => {
    localStorage.setItem(`pawapo-passkey-offer-dismissed-at:${email}`, String(Date.now()));
    onAuthenticated();
  };

  return (
    <main className="auth-page" data-auth-state={state}>
      <section className="auth-brand" aria-label="パワポ作るマン">
        <div className="auth-brand-inner">
          <div className="auth-wordmark">パワポ作るマン by みのるん</div>
          <div className="auth-copy">
            <h1>チャット一言で、<br />スライド完成！</h1>
            <p>テーマを伝えるだけで、構成からデザインまで。AIと会話しながらプレゼン資料を仕上げられます。</p>
          </div>
          <div className="auth-powered">Powered by Strands &amp; AgentCore</div>
        </div>
      </section>

      <section className="auth-panel" aria-label="ログイン">
        <div className="auth-shell">
          {state === 'initial' && (
            <>
              <p className="auth-eyebrow">Welcome back</p>
              <h2>続きをはじめましょう</h2>
              <p className="auth-lead">Googleまたはメールアドレスで続けられます。</p>
              <button className="auth-action auth-secondary" type="button" disabled={busy} onClick={() => void run(async () => {
                if (demoMode) onAuthenticated();
                else await signInWithRedirect({ provider: 'Google' });
              })}>
                <span className="google-mark">G</span>Googleで続ける
              </button>
              <div className="auth-divider">または</div>
              <form onSubmit={continueWithEmail}>
                <label className="auth-field">メールアドレス
                  <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
                </label>
                <button className="auth-action auth-primary" type="submit">メールで続ける</button>
              </form>
            </>
          )}

          {state === 'email' && (
            <>
              <button className="auth-back" type="button" onClick={() => setState('initial')}>← 戻る</button>
              <p className="auth-eyebrow">Sign in</p>
              <h2>メールでログイン</h2>
              <p className="auth-lead">パスキーを登録済みなら、顔認証や指紋認証を使えます。これまでのパスワードも引き続き使えます。</p>
              <div className="auth-email-summary"><span>{email}</span><button type="button" onClick={() => setState('initial')}>変更</button></div>
              <button className="auth-action auth-primary" type="button" disabled={busy} onClick={passkeySignIn}><PasskeyIcon />パスキーでログイン</button>
              <div className="auth-divider">または</div>
              <form onSubmit={passwordSignIn}>
                <label className="auth-field">パスワード
                  <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="パスワード" required />
                </label>
                <button className="auth-action auth-secondary" type="submit" disabled={busy}>パスワードでログイン</button>
              </form>
              <button className="auth-text-button auth-center" type="button" onClick={() => setState('reset')}>パスワードを忘れた方</button>
              <div className="auth-new-user">初めてご利用の方は <button className="auth-text-button" type="button" onClick={() => setState('signup')}>アカウントを作成</button></div>
            </>
          )}

          {state === 'signup' && (
            <>
              <button className="auth-back" type="button" onClick={() => setState('email')}>← 戻る</button>
              <p className="auth-eyebrow">Create account</p>
              <h2>アカウントを作成</h2>
              <p className="auth-lead">メールアドレスとパスワードで始められます。</p>
              <form onSubmit={createAccount}>
                <label className="auth-field">メールアドレス<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
                <label className="auth-field">パスワード<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} placeholder="8文字以上" required /></label>
                <button className="auth-action auth-primary" type="submit" disabled={busy}>アカウントを作成</button>
              </form>
              <p className="auth-privacy">登録後、メールアドレス確認のために一度だけ確認コードをお送りします。</p>
            </>
          )}

          {state === 'verify' && (
            <>
              <button className="auth-back" type="button" onClick={() => setState('signup')}>← 戻る</button>
              <p className="auth-eyebrow">Email verification</p>
              <h2>メールを確認してください</h2>
              <p className="auth-lead">新規登録を完了するため、6桁の確認コードを入力してください。<strong>{email}</strong></p>
              <form onSubmit={verifyAccount}>
                <label className="auth-field">確認コード<input className="auth-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} maxLength={6} required /></label>
                <button className="auth-action auth-primary" type="submit" disabled={busy}>確認してはじめる</button>
              </form>
              <button className="auth-text-button auth-center" type="button" onClick={() => void run(async () => { if (!demoMode) await resendSignUpCode({ username: email }); })}>コードを再送</button>
            </>
          )}

          {state === 'reset' && (
            <>
              <button className="auth-back" type="button" onClick={() => setState('email')}>← 戻る</button>
              <p className="auth-eyebrow">Password reset</p><h2>パスワードを再設定</h2>
              <p className="auth-lead">確認コードをメールでお送りします。</p>
              <form onSubmit={requestReset}>
                <label className="auth-field">メールアドレス<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
                <button className="auth-action auth-primary" type="submit" disabled={busy}>確認コードを送る</button>
              </form>
            </>
          )}

          {state === 'resetConfirm' && (
            <>
              <button className="auth-back" type="button" onClick={() => setState('reset')}>← 戻る</button>
              <p className="auth-eyebrow">Password reset</p><h2>新しいパスワードを入力</h2>
              <p className="auth-lead">{email} に届いた確認コードを入力してください。</p>
              <form onSubmit={finishReset}>
                <label className="auth-field">確認コード<input inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} maxLength={6} required /></label>
                <label className="auth-field">新しいパスワード<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>
                <button className="auth-action auth-primary" type="submit" disabled={busy}>パスワードを変更</button>
              </form>
            </>
          )}

          {state === 'offer' && (
            <>
              <div className="auth-offer-icon"><PasskeyIcon /></div>
              <p className="auth-eyebrow">Optional</p>
              <h2>次回は、もっとかんたんに</h2>
              <p className="auth-lead">パスキーを登録すると、次回から端末の顔認証や指紋認証だけでログインできます。</p>
              <button className="auth-action auth-primary" type="button" disabled={busy} onClick={registerPasskey}>パスキーを登録</button>
              <button className="auth-action auth-secondary auth-spaced" type="button" disabled={busy} onClick={dismissPasskey}>あとで</button>
              <p className="auth-privacy">登録しなくても、これまでのパスワードを引き続き使えます。</p>
            </>
          )}

          {error && <p className="auth-error" role="alert">{error}</p>}
          {state === 'initial' && <p className="auth-privacy">登録されたメールアドレスは認証目的でのみ使用します。</p>}
        </div>
      </section>
    </main>
  );
}
