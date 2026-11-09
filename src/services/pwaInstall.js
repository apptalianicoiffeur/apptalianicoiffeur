/**
 * PWA install-offer service.
 *
 * Responsibilities (all browser event listeners are registered exactly once):
 *  - Capture `beforeinstallprompt` and forward `appinstalled`.
 *  - Verify the site really is installable before anything is offered:
 *    manifest link + manifest shape + a reachable icon + a service worker.
 *  - Decide which offer mode fits the current platform:
 *      'native'       → Chromium (Android/desktop): call the native prompt().
 *      'ios'          → iPhone/iPad Safari: share-sheet instructions.
 *      'chrome-menu'  → Chromium without a live prompt: menu instructions.
 *      'safari-menu'  → macOS Safari: "File > Add to Dock" instructions.
 *      null           → not installable / already installed / cooldown / unsupported.
 *  - Persist "installed" and "dismissed" state: one offer per browser session
 *    and a 7-day cooldown after any dismissal.
 */
import {
  DISMISS_COOLDOWN_MS,
  STORAGE_KEYS,
  detectPlatform,
  evaluateManifest,
  isStandalone,
  isWithinCooldown,
} from '../utils/pwa';

/** How long to wait for a late `beforeinstallprompt` on Chromium. */
const PROMPT_WAIT_MS = 3000;
/** Timeout while probing that the manifest icon actually loads. */
const ICON_LOAD_TIMEOUT_MS = 5000;
const SW_SCRIPT_URL = '/firebase-messaging-sw.js';

/** The one captured BeforeInstallPromptEvent (one-shot per install). */
let deferredPrompt = null;
const promptWaiters = new Set();
const installedSubscribers = new Set();
let listenersAttached = false;
let supportPromise = null;

/* ------------------------------- storage ------------------------------- */

function storageGet(area, key) {
  try {
    return window[area].getItem(key);
  } catch {
    return null; // storage disabled (private mode / blocked cookies)
  }
}

function storageSet(area, key, value) {
  try {
    window[area].setItem(key, value);
  } catch {
    /* ignore: the offer simply becomes less persistent */
  }
}

/* ------------------------------ listeners ------------------------------ */

/** Register the PWA browser listeners once (idempotent). */
function attachListeners() {
  if (listenersAttached || typeof window === 'undefined') return;
  listenersAttached = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppress Chrome's mini-infobar: this app shows its own dialog instead.
    event.preventDefault();
    deferredPrompt = event;
    for (const resolve of promptWaiters) resolve(event);
    promptWaiters.clear();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    storageSet('localStorage', STORAGE_KEYS.installed, String(Date.now()));
    for (const notify of installedSubscribers) {
      try {
        notify();
      } catch {
        /* a broken subscriber must not break the others */
      }
    }
  });
}

attachListeners();

/* --------------------------- offer bookkeeping -------------------------- */

/** Remember that the app is installed (never offer again). */
export function markInstalled() {
  storageSet('localStorage', STORAGE_KEYS.installed, String(Date.now()));
}

/** Remember a dismissal so the offer stays hidden for the cooldown window. */
export function recordDismissal(now = Date.now()) {
  storageSet('localStorage', STORAGE_KEYS.dismissedAt, String(now));
}

/** Remember that the dialog was already offered in this browser session. */
export function markOfferedThisSession() {
  storageSet('sessionStorage', STORAGE_KEYS.sessionOffered, '1');
}

/** Subscribe to successful installs (our prompt or the browser UI). */
export function onAppInstalled(callback) {
  attachListeners();
  installedSubscribers.add(callback);
  return () => installedSubscribers.delete(callback);
}

/* ------------------------ installability checks ------------------------- */

async function loadManifest() {
  try {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link || !link.href) return null;
    const res = await fetch(link.href, { cache: 'no-store' });
    if (!res.ok) return null;
    const manifest = await res.json();
    return { manifest, href: link.href };
  } catch {
    return null; // missing / non-JSON manifest (SPA fallback page, offline…)
  }
}

/** Probe that the chosen icon URL resolves to a real image. */
function iconLoads(src, baseUrl) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(src, baseUrl || window.location.href).href;
    } catch {
      resolve(false);
      return;
    }
    const img = new Image();
    let settled = false;
    const settle = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => settle(false), ICON_LOAD_TIMEOUT_MS);
    img.onload = () => settle(true);
    img.onerror = () => settle(false);
    img.src = url;
  });
}

/** A usable service worker must be registered, or at least be deployable. */
async function serviceWorkerAvailable() {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration && (registration.active || registration.installing || registration.waiting)) {
      return true;
    }
    // Not registered yet (dev mode / first visit): the worker file must exist.
    const res = await fetch(SW_SCRIPT_URL, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Full PWA health check (manifest link → manifest shape → icon → service
 * worker). The result is computed once and cached for the page lifetime.
 */
export function verifyInstallSupport() {
  if (!supportPromise) supportPromise = computeInstallSupport();
  return supportPromise;
}

async function computeInstallSupport() {
  if (typeof window === 'undefined') return false;
  if (!window.isSecureContext) return false; // install requires HTTPS/localhost

  const loaded = await loadManifest();
  if (!loaded) return false;

  const check = evaluateManifest(loaded.manifest);
  if (!check.valid) return false;

  if (!(await iconLoads(check.icon, loaded.href))) return false;
  if (!(await serviceWorkerAvailable())) return false;
  return true;
}

/* ------------------------------ offer flow ------------------------------ */

/** Resolve with the prompt event if it arrives within `timeoutMs`. */
function waitForPrompt(timeoutMs = PROMPT_WAIT_MS) {
  if (deferredPrompt) return Promise.resolve(deferredPrompt);
  if (typeof window === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (event) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      promptWaiters.delete(finish);
      resolve(event);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    promptWaiters.add(finish);
  });
}

/**
 * Decide whether (and how) to offer the install dialog.
 * Returns an offer mode string, or `null` when nothing should be shown.
 */
export async function getOfferMode({ now = Date.now() } = {}) {
  attachListeners();
  if (typeof window === 'undefined') return null;

  // Already installed (standalone window, or remembered from `appinstalled`).
  if (isStandalone(window)) {
    markInstalled();
    return null;
  }
  if (storageGet('localStorage', STORAGE_KEYS.installed)) return null;

  // Offered at least once in this browser session.
  if (storageGet('sessionStorage', STORAGE_KEYS.sessionOffered)) return null;

  // Declined / closed recently: keep the 7-day cooldown.
  if (isWithinCooldown(storageGet('localStorage', STORAGE_KEYS.dismissedAt), now, DISMISS_COOLDOWN_MS)) {
    return null;
  }

  // Never assume the site is a valid PWA: verify manifest + icons + worker.
  if (!(await verifyInstallSupport())) return null;

  const platform = detectPlatform(
    navigator.userAgent,
    navigator.platform || '',
    navigator.maxTouchPoints || 0
  );

  if (platform.ios) return 'ios'; // Safari has no beforeinstallprompt API.
  if (deferredPrompt) return 'native';

  if (platform.chromium) {
    // The event can arrive slightly after page load; give it a moment.
    await waitForPrompt();
    return deferredPrompt ? 'native' : 'chrome-menu';
  }
  if (platform.safari) return 'safari-menu';
  return null; // e.g. Firefox: no web-triggered install option.
}

/**
 * Trigger the browser's native install dialog (Chromium only).
 * Resolves with 'accepted' | 'dismissed' | 'unavailable'.
 */
export async function promptInstall() {
  attachListeners();
  if (!deferredPrompt) return 'unavailable';

  const promptEvent = deferredPrompt;
  try {
    promptEvent.prompt();
  } catch {
    deferredPrompt = null;
    return 'unavailable';
  }

  let choice;
  try {
    choice = await promptEvent.userChoice;
  } catch {
    deferredPrompt = null;
    return 'unavailable';
  }

  // The event is one-shot: it can never prompt twice.
  deferredPrompt = null;

  if (choice && choice.outcome === 'accepted') {
    markInstalled();
    return 'accepted';
  }
  recordDismissal(); // user rejected the native dialog → apply cooldown
  return 'dismissed';
}
