import { useId, useRef, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Layout';
import { PasswordStrength } from '../components/PasswordStrength';
import { meetsPasswordRules } from '../lib/password';
import { db } from '../lib/supabase';

type Mode = 'signin' | 'signup';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // Confirm is only checked once the user has left that field or a submit got as far as comparing it,
  // so it never says "don't match" while they are still typing it.
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const meterId = useId();
  const rulesId = useId();
  const confirmMsgId = useId();

  const signup = mode === 'signup';
  const confirmError = !signup || !confirmChecked ? null : !confirm ? 'Re-enter your password.' : confirm !== password ? 'Passwords don’t match.' : null;

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setConfirm('');
    setConfirmChecked(false);
    setSubmitted(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim() || !password) return setError('Enter your email and password.');

    if (signup) {
      setSubmitted(true);
      if (!meetsPasswordRules(password)) {
        passwordRef.current?.focus();
        return setError('Your password doesn’t meet all the requirements yet.');
      }
      if (confirm !== password) {
        setConfirmChecked(true);
        confirmRef.current?.focus();
        return;
      }
    }

    setBusy(true);
    try {
      if (!signup) {
        const { error } = await db().auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await db().auth.signUp({
          email: email.trim(),
          password,
          // The desktop app's app:// origin can't be opened from an email, so it falls back to the Site URL.
          options: { emailRedirectTo: window.location.protocol.startsWith('http') ? window.location.origin : undefined },
        });
        if (error) throw error;
        if (!data.session) {
          switchMode('signin');
          setPassword('');
          setNotice(`We sent a confirmation link to ${email.trim()}. Open it, then sign in here.`);
        }
      }
    } catch (err) {
      const message = (err as { message?: string }).message ?? 'Something went wrong.';
      setError(/invalid login/i.test(message) ? 'Email or password is incorrect.' : message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth__card card" onSubmit={onSubmit} noValidate>
        <div className="auth__brand">
          <Logo />
          <span>Stockroom</span>
        </div>
        <h1>{signup ? 'Create an account' : 'Sign in'}</h1>
        <p className="muted">{signup ? 'Your account gets its own inventory, which only you can see.' : 'Track products, stock levels and every movement in one place.'}</p>

        {notice && <div className="banner banner--info">{notice}</div>}
        {error && (
          <div className="banner banner--error" role="alert">
            {error}
          </div>
        )}

        <label className="field">
          <span className="field__label">Email</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>

        <label className={`field${signup && submitted && !meetsPasswordRules(password) ? ' field--error' : ''}`}>
          <span className="field__label">Password</span>
          <input
            ref={passwordRef}
            type="password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={signup ? `${meterId} ${rulesId}` : undefined}
            aria-invalid={signup && submitted && !meetsPasswordRules(password)}
          />
        </label>

        {signup && (
          <>
            <PasswordStrength password={password} email={email} showErrors={submitted} meterId={meterId} rulesId={rulesId} />

            <label className={`field${confirmError ? ' field--error' : ''}`}>
              <span className="field__label">Confirm password</span>
              <input
                ref={confirmRef}
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onBlur={() => confirm && setConfirmChecked(true)}
                aria-describedby={confirmMsgId}
                aria-invalid={Boolean(confirmError)}
              />
              <span id={confirmMsgId} aria-live="polite">
                {confirmError ? (
                  <span className="field__error">{confirmError}</span>
                ) : confirm && confirm === password ? (
                  <span className="field__ok">
                    <Icon name="check" size={14} /> Passwords match
                  </span>
                ) : null}
              </span>
            </label>
          </>
        )}

        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
        </button>
        <p className="auth__switch muted">
          {signup ? 'Already have an account?' : 'No account yet?'}{' '}
          <button type="button" className="link-btn" onClick={() => switchMode(signup ? 'signin' : 'signup')}>
            {signup ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </form>
    </div>
  );
}
