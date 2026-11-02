/**
 * Shared small components: shop status badge, Google button, phone dialog,
 * route guards.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LockKeyhole, LogIn, Mail, ShieldAlert, UserRound } from 'lucide-react';
import t from '../i18n/ar';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { DEFAULT_COUNTRY_CODE, isValidPhone, nationalPart } from '../utils/phone';
import { EmptyState, Field, FullSpinner, Modal, Spinner } from './ui';

/** Google "G" logo (official 4-color version). */
export function GoogleIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** Live "open now / closed" badge driven by the barber's switch. */
export function ShopStatusBadge({ settings, size = 'md' }) {
  const open = Boolean(settings?.shopOpen);
  const pad = size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-3 py-1';
  return (
    <span
      className={`chip ${pad} ${
        open
          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
          : 'bg-red-500/15 text-red-300 border border-red-500/40'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${open ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}
      />
      {open ? t.status.open : t.status.closed}
    </span>
  );
}

/** Sign in with Google button with Arabic error handling. */
export function GoogleSignInButton({ compact = false, className = '', onSuccess }) {
  const { signInWithGoogle, signingIn } = useAuth();
  const { toast } = useToast();

  const handle = async () => {
    const res = await signInWithGoogle();
    if (!res.ok && res.error) toast(res.error, 'error');
    if (res.ok) onSuccess?.();
  };

  return (
    <button
      type="button"
      onClick={handle}
      disabled={signingIn}
      className={`${compact ? 'btn-outline btn-sm' : 'btn-gold w-full'} ${className} bg-ink-700/60`}
    >
      <GoogleIcon size={compact ? 15 : 18} />
      {signingIn ? t.auth.signingIn : t.auth.signInWithGoogle}
    </button>
  );
}

/** Sign-in, registration, password-reset, and same-UID provider-link flows. */
export function AuthModal({ open, onClose, initialMode = 'signin' }) {
  const {
    user,
    signingIn,
    signInWithEmail,
    createAccount,
    resetPassword,
    linkEmailPassword,
  } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setName('');
    setEmail(user?.email || '');
    setPassword('');
    setConfirmation('');
    setMessage('');
    setSuccess(false);
  }, [open, initialMode, user?.email]);

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setPassword('');
    setConfirmation('');
    setMessage('');
    setSuccess(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    setMessage('');
    setSuccess(false);

    if (
      mode !== 'link' &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      setMessage(t.auth.invalidEmail);
      return;
    }

    if (mode !== 'reset' && !password) {
      setMessage(t.auth.passwordRequired);
      return;
    }

    if (mode === 'signup' && name.trim().length < 2) {
      setMessage(t.auth.nameRequired);
      return;
    }

    if (mode === 'signup' || mode === 'link') {
      if (password.length < 8) {
        setMessage(t.auth.weakPassword);
        return;
      }
      if (password !== confirmation) {
        setMessage(t.auth.passwordMismatch);
        return;
      }
    }

    let result;
    if (mode === 'signup') {
      result = await createAccount({ name, email, password });
    } else if (mode === 'reset') {
      result = await resetPassword(email);
      if (result.ok) {
        setSuccess(true);
        setMessage(t.auth.resetSent);
        return;
      }
    } else if (mode === 'link') {
      result = await linkEmailPassword(password);
    } else {
      result = await signInWithEmail(email, password);
    }

    if (result.ok) {
      if (mode === 'link') {
        setSuccess(true);
        setMessage(t.auth.passwordLinked);
        return;
      }
      onClose();
    } else {
      setMessage(result.error);
    }
  };

  const titles = {
    signin: t.auth.signInTitle,
    signup: t.auth.createAccount,
    reset: t.auth.resetTitle,
    link: t.auth.linkPasswordTitle,
  };

  return (
    <Modal open={open} onClose={onClose} title={titles[mode]}>
      {(mode === 'signin' || mode === 'signup') && (
        <>
          <GoogleSignInButton className="w-full" onSuccess={onClose} />
          <div className="flex items-center gap-3 my-4 text-xs text-slate-500">
            <span className="h-px flex-1 bg-ink-500" />
            {t.auth.orEmail}
            <span className="h-px flex-1 bg-ink-500" />
          </div>
        </>
      )}

      <form onSubmit={submit} className="space-y-1" noValidate>
        {mode === 'link' && (
          <p className="text-sm text-slate-400 mb-4">
            {t.auth.linkPasswordBody} <span dir="ltr">{user?.email}</span>
          </p>
        )}

        {mode === 'signup' && (
          <Field label={t.auth.nameLabel} htmlFor="auth-name">
            <div className="relative">
              <UserRound size={17} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="auth-name"
                className="input pr-10"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
          </Field>
        )}

        {mode !== 'link' && (
          <Field label={t.auth.emailLabel} htmlFor="auth-email">
            <div className="relative">
              <Mail size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="auth-email"
                className="input"
                dir="ltr"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
          </Field>
        )}

        {mode !== 'reset' && (
          <Field
            label={t.auth.passwordLabel}
            hint={(mode === 'signup' || mode === 'link') ? t.auth.passwordHint : undefined}
            htmlFor="auth-password"
          >
            <div className="relative">
              <LockKeyhole size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="auth-password"
                className="input"
                dir="ltr"
                type="password"
                autoComplete={mode === 'signup' || mode === 'link' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
          </Field>
        )}

        {(mode === 'signup' || mode === 'link') && (
          <Field label={t.auth.confirmPasswordLabel} htmlFor="auth-confirm-password">
            <div className="relative">
              <LockKeyhole size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="auth-confirm-password"
                className="input"
                dir="ltr"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
              />
            </div>
          </Field>
        )}

        {message && (
          <p
            role={success ? 'status' : 'alert'}
            className={`text-sm leading-relaxed ${success ? 'text-emerald-300' : 'text-red-300'}`}
          >
            {message}
          </p>
        )}

        <button type="submit" className="btn-gold w-full mt-2" disabled={signingIn}>
          {signingIn && <Spinner size={17} />}
          {signingIn
            ? t.auth.signingIn
            : mode === 'signup'
              ? t.auth.createAccount
              : mode === 'reset'
                ? t.auth.sendReset
                : mode === 'link'
                  ? t.auth.linkPasswordAction
                  : t.auth.signInTitle}
        </button>
      </form>

      {mode === 'signin' && (
        <div className="flex flex-wrap justify-between gap-3 mt-4 text-sm">
          <button type="button" className="text-gold-300 hover:text-gold-200" onClick={() => changeMode('signup')}>
            {t.auth.createAccount}
          </button>
          <button type="button" className="text-slate-400 hover:text-slate-200" onClick={() => changeMode('reset')}>
            {t.auth.forgotPassword}
          </button>
        </div>
      )}
      {mode === 'signup' && (
        <button
          type="button"
          className="w-full text-center text-sm text-gold-300 mt-4"
          onClick={() => changeMode('signin')}
        >
          {t.auth.haveAccount}
        </button>
      )}
      {mode === 'reset' && (
        <button
          type="button"
          className="w-full text-center text-sm text-gold-300 mt-4"
          onClick={() => changeMode('signin')}
        >
          {t.auth.backToSignIn}
        </button>
      )}
    </Modal>
  );
}

/** One-time phone number request after the first Google login. */
export function PhoneModal() {
  const { needsPhone, savePhone, skipPhoneAsk } = useAuth();
  const { toast } = useToast();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!isValidPhone(`${DEFAULT_COUNTRY_CODE}${nationalPart(value) || value.replace(/^0/, '')}`)) {
      setError(t.validation.phoneInvalid);
      return;
    }
    setBusy(true);
    try {
      await savePhone(value);
      toast(t.auth.phoneSaved);
      setValue('');
      setError('');
    } catch {
      setError(t.validation.phoneInvalid);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={needsPhone} onClose={() => skipPhoneAsk()} title={t.auth.phoneTitle}>
      <p className="text-sm text-slate-400 leading-relaxed mb-5">{t.auth.phoneBody}</p>
      <Field label={t.auth.phoneLabel} error={error}>
        <div className="flex gap-2" dir="ltr">
          <span className="input flex items-center justify-center w-24 bg-ink-600 font-bold text-gold-300">
            {DEFAULT_COUNTRY_CODE}
          </span>
          <input
            className="input flex-1"
            inputMode="tel"
            placeholder="5XX XX XX XX"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
      </Field>
      <div className="flex gap-2 pt-1">
        <button className="btn-outline flex-1" onClick={() => skipPhoneAsk()}>
          {t.auth.phoneLater}
        </button>
        <button className="btn-gold flex-1" onClick={submit} disabled={busy}>
          {busy ? t.app.loading : t.auth.phoneSave}
        </button>
      </div>
    </Modal>
  );
}

/** Access denied / sign-in required screen. */
function AccessDenied({ needAuth }) {
  return (
    <div className="max-w-lg mx-auto px-4 py-16">
      <EmptyState
        icon={needAuth ? LogIn : ShieldAlert}
        title={needAuth ? t.auth.needSignIn : t.owner.ownerOnlyNotice}
        body={t.errors.permission}
        action={
          <div className="flex gap-2 mt-2">
            <Link to="/" className="btn-outline btn-sm">
              {t.errors.goHome}
            </Link>
            {needAuth && <GoogleSignInButton compact />}
          </div>
        }
      />
    </div>
  );
}

/** Require any signed-in user. */
export function RequireAuth({ children }) {
  const { user, initializing } = useAuth();
  if (initializing) return <FullSpinner />;
  if (!user) return <AccessDenied needAuth />;
  return children;
}

/** Require the owner (barber) account. The rules enforce this server-side too. */
export function RequireOwner({ children }) {
  const { user, isOwner, initializing } = useAuth();
  if (initializing) return <FullSpinner />;
  if (!user || !isOwner) return <AccessDenied />;
  return children;
}

/** Auto-close helper used by dropdown menus. */
export function useOutsideClose(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

/** Small helper to redirect home after finishing a flow. */
export function useGoHome() {
  const navigate = useNavigate();
  return () => navigate('/');
}
