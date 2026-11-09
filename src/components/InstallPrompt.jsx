/**
 * PWA install-offer dialog.
 *
 * Shown once per browser session (7-day cooldown after any dismissal) and only
 * after the `pwaInstall` service verified that the site really is installable.
 *
 * Modes:
 *  - 'native'       Chromium: triggers the real `beforeinstallprompt` prompt.
 *  - 'ios'          iPhone/iPad Safari: share-sheet instructions.
 *  - 'chrome-menu'  Chromium without a live prompt: menu instructions.
 *  - 'safari-menu'  macOS Safari: "File > Add to Dock" instructions.
 */
import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import t from '../i18n/ar';
import { Modal, Spinner } from './ui';
import { useToast } from '../context/ToastContext';
import {
  getOfferMode,
  markOfferedThisSession,
  onAppInstalled,
  promptInstall,
  recordDismissal,
} from '../services/pwaInstall';

/** Grace period after the page loads so the dialog never interrupts entry. */
const OFFER_DELAY_MS = 4000;

const INSTRUCTIONS = {
  ios: { heading: t.pwa.ios.heading, steps: t.pwa.ios.steps },
  'chrome-menu': { heading: t.pwa.chrome.heading, steps: t.pwa.chrome.steps },
  'safari-menu': { heading: t.pwa.safari.heading, steps: t.pwa.safari.steps },
};

export default function InstallPrompt() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const installedToastShown = useRef(false);

  const notifyInstalled = () => {
    if (installedToastShown.current) return;
    installedToastShown.current = true;
    toastRef.current(t.pwa.installed);
  };

  // Decide once per page load whether (and how) to offer the dialog.
  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const offer = async () => {
      const nextMode = await getOfferMode();
      if (cancelled || !nextMode) return;
      timer = setTimeout(() => {
        if (cancelled) return;
        markOfferedThisSession();
        setMode(nextMode);
        setOpen(true);
      }, OFFER_DELAY_MS);
    };

    if (document.readyState === 'complete') offer();
    else window.addEventListener('load', offer, { once: true });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('load', offer);
    };
  }, []);

  // Close + celebrate when the app gets installed (our button or browser UI).
  useEffect(
    () =>
      onAppInstalled(() => {
        setOpen(false);
        notifyInstalled();
      }),
    []
  );

  /** "Not now", close button, backdrop, Escape → hide + start the cooldown. */
  const dismiss = () => {
    recordDismissal();
    setOpen(false);
  };

  const handleInstall = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await promptInstall();
      if (outcome === 'accepted') {
        setOpen(false);
        notifyInstalled(); // `appinstalled` also fires; the ref guards duplicates
      } else if (outcome === 'dismissed') {
        setOpen(false); // cooldown already recorded by the service
      } else {
        setMode('chrome-menu'); // prompt vanished → fall back to instructions
      }
    } finally {
      setBusy(false);
    }
  };

  if (!open || !mode) return null;

  const native = mode === 'native';
  const instructions = INSTRUCTIONS[mode];

  return (
    <Modal
      open={open}
      onClose={dismiss}
      title={t.pwa.title}
      footer={
        native ? (
          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1" onClick={dismiss} disabled={busy}>
              {t.pwa.notNow}
            </button>
            <button
              type="button"
              className="btn-gold flex-1"
              onClick={handleInstall}
              disabled={busy}
            >
              {busy ? <Spinner size={16} /> : <Download size={17} />}
              {t.pwa.install}
            </button>
          </div>
        ) : (
          <button type="button" className="btn-gold w-full" onClick={dismiss}>
            {t.pwa.understood}
          </button>
        )
      }
    >
      <div className="flex flex-col items-center text-center">
        <div className="w-20 h-20 shrink-0 rounded-3xl overflow-hidden ring-2 ring-gold-500/40 shadow-glow">
          <img src="/icons/icon.svg" alt={t.app.name} className="w-full h-full object-cover" />
        </div>
        <p className="mt-4 text-sm text-slate-300 leading-relaxed text-balance">
          {t.pwa.description}
        </p>
      </div>

      {!native && instructions && (
        <div className="card p-4 mt-4">
          <p className="text-xs font-extrabold text-gold-300 mb-3">{instructions.heading}</p>
          <ol className="space-y-3">
            {instructions.steps.map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-start">
                <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full bg-gold-500/15 text-gold-300 text-xs font-black flex items-center justify-center">
                  {index + 1}
                </span>
                <span className="text-sm text-slate-300 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Modal>
  );
}
