/**
 * Pure PWA install helpers: standalone detection, platform detection,
 * manifest validation and dismissal cooldown.
 *
 * Everything here is free of side effects at import time and takes globals as
 * parameters, so the logic can be unit-tested under Node (tests/unit/pwa.test.mjs).
 */

/** Storage keys used by the install-offer flow. */
export const STORAGE_KEYS = {
  /** localStorage flag set once the app is installed (or running installed). */
  installed: 'taliani:pwa:installed',
  /** localStorage timestamp of the last dismissal (not now / prompt rejected). */
  dismissedAt: 'taliani:pwa:dismissedAt',
  /** sessionStorage flag: offer the dialog at most once per browser session. */
  sessionOffered: 'taliani:pwa:sessionOffered',
};

/** Do not re-offer the install dialog within this window after a dismissal. */
export const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Display modes that mean "the app was launched from the home screen". */
const INSTALLED_DISPLAY_MODES = ['standalone', 'fullscreen', 'minimal-ui'];

/** Manifest `display` values that are compatible with an installed app. */
const INSTALLABLE_DISPLAY_MODES = ['standalone', 'fullscreen', 'minimal-ui'];

/**
 * True when the page runs inside an installed app window.
 * Covers `display-mode` media queries (Chrome/Android/desktop) and the legacy
 * `window.navigator.standalone` flag used by iOS Safari.
 */
export function isStandalone(win = globalThis) {
  try {
    if (win.navigator && win.navigator.standalone === true) return true;
    if (typeof win.matchMedia === 'function') {
      for (const mode of INSTALLED_DISPLAY_MODES) {
        if (win.matchMedia(`(display-mode: ${mode})`).matches) return true;
      }
    }
  } catch {
    // matchMedia can throw in exotic webviews; treat as "not standalone".
  }
  return false;
}

/** Largest pixel size declared in an icon's `sizes` attribute (0 if unknown). */
export function parseIconSize(sizes = '') {
  let best = 0;
  for (const part of String(sizes).split(/\s+/).filter(Boolean)) {
    const match = /^(\d+)x(\d+)$/.exec(part);
    if (match) best = Math.max(best, Number(match[1]), Number(match[2]));
  }
  return best;
}

/**
 * Validate a parsed web app manifest for installability.
 * Returns `{ valid, reason?, icon? }` where `icon` is the best candidate src.
 */
export function evaluateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { valid: false, reason: 'unreadable' };
  }
  if (!manifest.name && !manifest.short_name) return { valid: false, reason: 'missing-name' };
  if (!manifest.start_url) return { valid: false, reason: 'missing-start-url' };

  const display =
    manifest.display ||
    (Array.isArray(manifest.display_override) ? manifest.display_override[0] : '');
  if (display && !INSTALLABLE_DISPLAY_MODES.includes(display)) {
    return { valid: false, reason: 'display-not-installable' };
  }

  const icons = (Array.isArray(manifest.icons) ? manifest.icons : []).filter(
    (icon) => icon && icon.src
  );
  if (!icons.length) return { valid: false, reason: 'missing-icons' };

  // Chrome requires at least a 192x192 icon; SVGs declare `sizes: "any"`.
  const usable = icons.filter(
    (icon) => String(icon.sizes).includes('any') || parseIconSize(icon.sizes) >= 192
  );
  if (!usable.length) return { valid: false, reason: 'icons-too-small' };

  const score = (icon) =>
    String(icon.sizes).includes('any') ? Number.MAX_SAFE_INTEGER : parseIconSize(icon.sizes);
  const maskPenalty = (icon) => (icon.purpose === 'maskable' ? 1 : 0);
  usable.sort((a, b) => score(b) - score(a) || maskPenalty(a) - maskPenalty(b));

  return { valid: true, icon: usable[0].src };
}

/** True when `timestamp` is a valid moment inside the dismissal cooldown. */
export function isWithinCooldown(timestamp, now = Date.now(), cooldownMs = DISMISS_COOLDOWN_MS) {
  const at = Number(timestamp);
  if (!Number.isFinite(at) || at <= 0) return false;
  const age = now - at;
  return age >= 0 && age < cooldownMs;
}

/**
 * Detect the current platform from browser sniffing strings.
 * `platform` + `maxTouchPoints` are needed to catch iPadOS 13+, which
 * masquerades as a Macintosh in its user agent.
 */
export function detectPlatform(userAgent = '', platform = '', maxTouchPoints = 0) {
  const ua = String(userAgent || '');
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    (/Mac/i.test(String(platform)) && Number(maxTouchPoints) > 1);
  const chromiumToken = /Chrome|CriOS|Chromium|Edg|OPR|SamsungBrowser/i.test(ua);
  return {
    ios,
    android: /Android/i.test(ua),
    // Blink-based browsers (Chrome, Edge, Opera, Samsung Internet, Brave…).
    chromium: !ios && chromiumToken,
    // Safari on desktop macOS (Safari token without any Chromium token).
    safari:
      !ios &&
      !/Android/i.test(ua) &&
      !chromiumToken &&
      !/Firefox/i.test(ua) &&
      /Safari/i.test(ua),
  };
}
