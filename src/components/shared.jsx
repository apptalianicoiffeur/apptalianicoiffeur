/**
 * Shared small components: shop status badge, Google button, phone dialog,
 * route guards.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarOff, LogIn, ShieldAlert } from 'lucide-react';
import t from '../i18n/ar';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { DEFAULT_COUNTRY_CODE, isValidPhone, nationalPart } from '../utils/phone';
import { EmptyState, Field, FullSpinner, Modal } from './ui';

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
export function GoogleSignInButton({ compact = false, className = '' }) {
  const { signInWithGoogle, signingIn } = useAuth();
  const { toast } = useToast();

  const handle = async () => {
    const res = await signInWithGoogle();
    if (!res.ok && res.error) toast(res.error, 'error');
  };

  return (
    <button
      onClick={handle}
      disabled={signingIn}
      className={`${compact ? 'btn-outline btn-sm' : 'btn-gold w-full'} ${className} bg-ink-700/60`}
    >
      <GoogleIcon size={compact ? 15 : 18} />
      {signingIn ? t.auth.signingIn : t.nav.signIn}
    </button>
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
