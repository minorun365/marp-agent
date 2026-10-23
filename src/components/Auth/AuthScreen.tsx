import { useEffect, useState, type FormEvent } from 'react';
import {
  associateWebAuthnCredential,
  autoSignIn,
  confirmSignIn,
  confirmSignUp,
  resendSignUpCode,
  signIn,
  signInWithRedirect,
  signUp,
} from 'aws-amplify/auth';
import './AuthScreen.css';
import { LEGACY_OTP_NOTE, SIGNIN_CHECK_MESSAGE } from './legacyAccountNote';

type AuthState = 'initial' | 'email' | 'otp' | 'signup' | 'verify' | 'offer';

const authStates: readonly AuthState[] = ['initial', 'email', 'otp', 'signup', 'verify', 'offer'];
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
      return SIGNIN_CHECK_MESSAGE;
    }
    if (error.name === 'CodeMismatchException') {
      return 'コードが正しくありません。届いたメールのコードをもう一度確認してください。';
    }
    if (error.name === 'ExpiredCodeException') {
      return 'コードの有効期限が切れました。コードを送り直してください。';
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
  const [code, setCode] = useState('');
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  // 新規登録はメール入力前後のどちらからも入れるため、戻り先を覚えておく。
  const [signupFrom, setSignupFrom] = useState<AuthState>('email');

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

  // パスキーを登録していない人は、ログインのたびにパスキーを案内する（30日に1回まで）
  const finishSignIn = () => {
    const registered = localStorage.getItem(`pawapo-passkey-registered:${email}`) === 'true';
    const dismissedAt = Number(localStorage.getItem(`pawapo-passkey-offer-dismissed-at:${email}`));
    const coolingDown = Number.isFinite(dismissedAt)
      && Date.now() - dismissedAt < PASSKEY_OFFER_COOLDOWN_MS;
    if (registered || coolingDown) onAuthenticated();
    else setState('offer');
  };

  const sendLoginCode = () => {
    void run(async () => {
      if (!demoMode) {
        // 登録の無いアドレスでも Cognito は同じ応答を返す（preventUserExistenceErrors）。
        // 届かない場合の案内はコード入力の画面に出す。
        await signIn({
          username: email,
          options: { authFlowType: 'USER_AUTH', preferredChallenge: 'EMAIL_OTP' },
        });
      }
      setCode('');
      setState('otp');
    });
  };

  const confirmLoginCode = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (demoMode) {
        setState('offer');
        return;
      }
      const result = await confirmSignIn({ challengeResponse: code.trim() });
      if (!result.isSignedIn) throw new Error('ログインを完了できませんでした。コードを送り直してください。');
      finishSignIn();
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
        throw new Error('パスキーでログインできませんでした。メールのコードでログインしてください。');
      }
      localStorage.setItem(`pawapo-passkey-registered:${email}`, 'true');
      onAuthenticated();
    });
  };

  const createAccount = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (!demoMode) {
        // パスワードは作らない。確認コードの入力がそのまま初回ログインになる
        await signUp({
          username: email,
          options: { userAttributes: { email }, autoSignIn: { authFlowType: 'USER_AUTH' } },
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
        const confirmed = await confirmSignUp({ username: email, confirmationCode: code.trim() });
        if (confirmed.nextStep.signUpStep !== 'COMPLETE_AUTO_SIGN_IN') {
          throw new Error('登録は完了しました。メールのコードでログインしてください。');
        }
        const result = await autoSignIn();
        if (!result.isSignedIn) throw new Error('登録後のログインに失敗しました。メールのコードでログインしてください。');
      }
      setState('offer');
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
          <div className="auth-copy">
            <h1>パワポ作るマン<span className="auth-by">by みのるん</span></h1>
          </div>
          <div className="auth-powered">Powered by Strands &amp; AgentCore</div>
        </div>
      </section>

      <section className="auth-panel" aria-label="ログイン">
        <div className="auth-shell">
          {state === 'initial' && (
            <>
              <p className="auth-tagline">チャット一言でプレゼン資料を作ろう！</p>
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
              <div className="auth-new-user">初めてご利用の方は <button className="auth-text-button" type="button" onClick={() => { setSignupFrom('initial'); setState('signup'); }}>アカウントを作成</button></div>
            </>
          )}

          {state === 'email' && (
            <>
              <button className="auth-back" type="button" onClick={() => setState('initial')}>← 戻る</button>
              <p className="auth-eyebrow">Sign in</p>
              <h2>メールでログイン</h2>
              <p className="auth-lead">パスキーを登録済みなら、顔認証や指紋認証で入れます。登録していない方は、メールに届くコードで入れます。</p>
              <div className="auth-email-summary"><span>{email}</span><button type="button" onClick={() => setState('initial')}>変更</button></div>
              <button className="auth-action auth-primary" type="button" disabled={busy} onClick={passkeySignIn}><PasskeyIcon />パスキーでログイン</button>
              <div className="auth-divider">または</div>
              <button className="auth-action auth-secondary" type="button" disabled={busy} onClick={sendLoginCode}>メールにコードを送る</button>
              <div className="auth-new-user">初めてご利用の方は <button className="auth-text-button" type="button" onClick={() => { setSignupFrom('email'); setState('signup'); }}>アカウントを作成</button></div>
            </>
          )}

          {state === 'otp' && (
            <>
              <button className="auth-back" type="button" onClick={() => setState('email')}>← 戻る</button>
              <p className="auth-eyebrow">Sign in</p>
              <h2>コードを入力</h2>
              <p className="auth-lead"><strong>{email}</strong> に届いたコードを入力してください。</p>
              <form onSubmit={confirmLoginCode}>
                <label className="auth-field">コード<input className="auth-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} maxLength={8} required /></label>
                <button className="auth-action auth-primary" type="submit" disabled={busy}>ログイン</button>
              </form>
              <button className="auth-text-button auth-center" type="button" disabled={busy} onClick={sendLoginCode}>コードを送り直す</button>
              <p className="auth-privacy">{LEGACY_OTP_NOTE} <button className="auth-text-button" type="button" onClick={() => { setSignupFrom('otp'); setState('signup'); }}>アカウントを作成</button></p>
            </>
          )}

          {state === 'signup' && (
            <>
              <button className="auth-back" type="button" onClick={() => setState(signupFrom)}>← 戻る</button>
              <p className="auth-eyebrow">Create account</p>
              <h2>アカウントを作成</h2>
              <p className="auth-lead">メールアドレスだけで始められます。パスワードは要りません。</p>
              <form onSubmit={createAccount}>
                <label className="auth-field">メールアドレス<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
                <button className="auth-action auth-primary" type="submit" disabled={busy}>確認コードを送る</button>
              </form>
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

          {state === 'offer' && (
            <>
              <div className="auth-offer-icon"><PasskeyIcon /></div>
              <p className="auth-eyebrow">Optional</p>
              <h2>次回は、もっとかんたんに</h2>
              <p className="auth-lead">パスキーを登録すると、次回から端末の顔認証や指紋認証だけでログインできます。</p>
              <button className="auth-action auth-primary" type="button" disabled={busy} onClick={registerPasskey}>パスキーを登録</button>
              <button className="auth-action auth-secondary auth-spaced" type="button" disabled={busy} onClick={dismissPasskey}>あとで</button>
              <p className="auth-privacy">登録しなくても、メールに届くコードでログインできます。</p>
            </>
          )}

          {error && <p className="auth-error" role="alert">{error}</p>}
          {state === 'initial' && <p className="auth-privacy">登録されたメールアドレスは認証目的でのみ使用します。</p>}
        </div>
      </section>
    </main>
  );
}
