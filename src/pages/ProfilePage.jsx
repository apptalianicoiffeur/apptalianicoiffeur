/**
 * Personal account details and future preference settings.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import t from '../i18n/ar';
import { DEFAULT_COUNTRY_CODE, nationalPart, normalizePhone } from '../utils/phone';
import { Field, FullSpinner, Spinner } from '../components/ui';

export default function ProfilePage() {
  const { user, profile, saveProfile } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!profile) return;
    setName(profile.name || user?.displayName || '');
    setPhone(nationalPart(profile.phone || ''));
  }, [profile, user?.displayName]);

  if (!profile) return <FullSpinner />;

  const submit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (name.trim().length < 3 || name.trim().length > 80) {
      nextErrors.name = t.profile.nameInvalid;
    }
    if (phone.trim() && !normalizePhone(phone)) {
      nextErrors.phone = t.validation.phoneInvalid;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    try {
      await saveProfile({ name, phone: phone.trim() });
      toast(t.profile.saved);
    } catch (err) {
      console.error('Failed to save the user profile.', err);
      toast(t.profile.saveFailed, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-5 animate-fade-in">
      <header className="mb-5">
        <p className="text-xs text-gold-400 font-bold mb-1">{t.nav.profileSettings}</p>
        <h1 className="text-xl sm:text-2xl font-black">{t.profile.title}</h1>
        <p className="text-sm text-slate-400 mt-2 leading-relaxed">{t.profile.subtitle}</p>
      </header>

      <form className="card p-4 sm:p-5" onSubmit={submit}>
        <h2 className="section-title mb-4">{t.profile.personalInfo}</h2>
        <Field label={t.auth.nameLabel} error={errors.name} htmlFor="profile-name">
          <input
            id="profile-name"
            className="input"
            autoComplete="name"
            maxLength={80}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setErrors((current) => ({ ...current, name: '' }));
            }}
          />
        </Field>

        <Field label={t.auth.emailLabel} hint={t.profile.emailHint} htmlFor="profile-email">
          <input
            id="profile-email"
            className="input opacity-60"
            type="email"
            dir="ltr"
            value={user?.email || ''}
            readOnly
          />
        </Field>

        <Field
          label={t.auth.phoneLabel}
          hint={`${t.profile.phoneHint} (${DEFAULT_COUNTRY_CODE})`}
          error={errors.phone}
          htmlFor="profile-phone"
        >
          <input
            id="profile-phone"
            className="input"
            type="tel"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel-national"
            maxLength={20}
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setErrors((current) => ({ ...current, phone: '' }));
            }}
          />
        </Field>

        <button type="submit" className="btn-gold w-full" disabled={busy}>
          {busy ? <Spinner size={16} /> : null}
          {busy ? t.app.loading : t.app.saveChanges}
        </button>
      </form>

      <section className="card p-4 sm:p-5 mt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="section-title mb-1">{t.profile.preferencesTitle}</h2>
            <p className="text-xs text-slate-400 leading-relaxed">{t.profile.preferencesHint}</p>
          </div>
          <span className="chip bg-gold-500/10 text-gold-300 border border-gold-500/25 shrink-0">
            {t.app.comingSoon}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-ink-700/50 p-3">
            <p className="text-xs text-slate-400">{t.profile.language}</p>
            <p className="mt-1 text-sm font-bold">{t.profile.currentLanguage}</p>
          </div>
          <div className="rounded-2xl bg-ink-700/50 p-3">
            <p className="text-xs text-slate-400">{t.profile.personalPreferences}</p>
            <p className="mt-1 text-sm font-bold">{t.app.comingSoon}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
