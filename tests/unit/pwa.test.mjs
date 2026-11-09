import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISMISS_COOLDOWN_MS,
  STORAGE_KEYS,
  detectPlatform,
  evaluateManifest,
  isStandalone,
  isWithinCooldown,
  parseIconSize,
} from '../../src/utils/pwa.js';

const UA_IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const UA_IPAD_SAFARI =
  'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const UA_IPADOS_MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const UA_ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';
const UA_DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const UA_DESKTOP_EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0';
const UA_DESKTOP_FIREFOX =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0';
const UA_SAMSUNG_INTERNET =
  'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36';

/* ------------------------------ storage keys ----------------------------- */

test('storage keys are namespaced so they cannot collide with other data', () => {
  assert.equal(STORAGE_KEYS.installed, 'taliani:pwa:installed');
  assert.equal(STORAGE_KEYS.dismissedAt, 'taliani:pwa:dismissedAt');
  assert.equal(STORAGE_KEYS.sessionOffered, 'taliani:pwa:sessionOffered');
});

/* --------------------------- standalone detection ------------------------ */

test('isStandalone detects the display-mode media query', () => {
  const win = {
    matchMedia: (query) => ({ matches: query === '(display-mode: standalone)' }),
  };
  assert.equal(isStandalone(win), true);
});

test('isStandalone detects the iOS Safari standalone flag', () => {
  const win = { navigator: { standalone: true }, matchMedia: () => ({ matches: false }) };
  assert.equal(isStandalone(win), true);
});

test('isStandalone is false in a normal browser tab', () => {
  const win = { navigator: {}, matchMedia: () => ({ matches: false }) };
  assert.equal(isStandalone(win), false);
});

test('isStandalone never throws when matchMedia is unavailable', () => {
  const win = {
    matchMedia: () => {
      throw new Error('boom');
    },
  };
  assert.equal(isStandalone(win), false);
  assert.equal(isStandalone({}), false);
});

/* --------------------------- platform detection -------------------------- */

test('detectPlatform flags iPhone Safari as iOS', () => {
  const p = detectPlatform(UA_IPHONE_SAFARI, 'iPhone', 5);
  assert.equal(p.ios, true);
  assert.equal(p.chromium, false);
});

test('detectPlatform flags iPad Safari as iOS (touch-capable Mac UA too)', () => {
  assert.equal(detectPlatform(UA_IPAD_SAFARI, 'iPad', 5).ios, true);
  // iPadOS 13+ masquerades as a Macintosh in its user agent.
  assert.equal(detectPlatform(UA_IPADOS_MAC_SAFARI, 'MacIntel', 5).ios, true);
  // A real desktop Mac (no touch) must NOT be treated as iOS.
  assert.equal(detectPlatform(UA_IPADOS_MAC_SAFARI, 'MacIntel', 0).ios, false);
});

test('detectPlatform flags Android Chrome as chromium + android', () => {
  const p = detectPlatform(UA_ANDROID_CHROME, 'Linux armv8l');
  assert.equal(p.android, true);
  assert.equal(p.chromium, true);
  assert.equal(p.ios, false);
});

test('detectPlatform flags desktop Chrome/Edge/Samsung Internet as chromium', () => {
  assert.equal(detectPlatform(UA_DESKTOP_CHROME, 'Win32').chromium, true);
  assert.equal(detectPlatform(UA_DESKTOP_EDGE, 'Win32').chromium, true);
  assert.equal(detectPlatform(UA_SAMSUNG_INTERNET, 'Linux').chromium, true);
});

test('detectPlatform flags macOS Safari as safari only', () => {
  const p = detectPlatform(UA_IPADOS_MAC_SAFARI, 'MacIntel', 0);
  assert.equal(p.safari, true);
  assert.equal(p.chromium, false);
  assert.equal(p.ios, false);
});

test('detectPlatform leaves Firefox with no install mode', () => {
  const p = detectPlatform(UA_DESKTOP_FIREFOX, 'Win32');
  assert.equal(p.chromium, false);
  assert.equal(p.safari, false);
  assert.equal(p.ios, false);
});

/* ---------------------------- manifest checks ---------------------------- */

test('parseIconSize takes the largest dimension pair', () => {
  assert.equal(parseIconSize('192x192 512x512'), 512);
  assert.equal(parseIconSize('any'), 0);
  assert.equal(parseIconSize(''), 0);
  assert.equal(parseIconSize('nonsense'), 0);
});

const validManifest = {
  name: 'طالياني كوافير',
  short_name: 'طالياني',
  start_url: '/',
  display: 'standalone',
  icons: [
    { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
  ],
};

test('evaluateManifest accepts a complete manifest and picks an icon', () => {
  const result = evaluateManifest(validManifest);
  assert.equal(result.valid, true);
  assert.ok(result.icon);
});

test('evaluateManifest rejects missing/broken manifests', () => {
  assert.equal(evaluateManifest(null).valid, false);
  assert.equal(evaluateManifest('not json').valid, false);
  assert.equal(evaluateManifest({ start_url: '/', icons: [] }).valid, false); // no name
  assert.equal(evaluateManifest({ name: 'x', icons: [] }).valid, false); // no start_url
  assert.equal(evaluateManifest({ ...validManifest, start_url: undefined }).valid, false);
});

test('evaluateManifest rejects non-installable display modes', () => {
  const result = evaluateManifest({ ...validManifest, display: 'browser' });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'display-not-installable');
});

test('evaluateManifest requires at least one usable icon', () => {
  const tiny = evaluateManifest({
    ...validManifest,
    icons: [{ src: '/icons/48.png', sizes: '48x48' }],
  });
  assert.equal(tiny.valid, false);
  assert.equal(tiny.reason, 'icons-too-small');

  const none = evaluateManifest({ ...validManifest, icons: [] });
  assert.equal(none.valid, false);
});

test('evaluateManifest accepts display_override when display is missing', () => {
  const result = evaluateManifest({
    name: 'x',
    start_url: '/',
    display_override: ['standalone'],
    icons: [{ src: '/i.png', sizes: '512x512' }],
  });
  assert.equal(result.valid, true);
});

test('evaluateManifest prefers the scalable SVG icon for the dialog', () => {
  const result = evaluateManifest({
    ...validManifest,
    icons: [
      { src: '/icons/512.png', sizes: '512x512' },
      { src: '/icons/icon.svg', sizes: 'any' },
      { src: '/icons/maskable.png', sizes: '512x512', purpose: 'maskable' },
    ],
  });
  assert.equal(result.icon, '/icons/icon.svg');
});

/* --------------------------- dismissal cooldown -------------------------- */

test('isWithinCooldown only reports true for recent timestamps', () => {
  const now = 1_700_000_000_000;
  assert.equal(isWithinCooldown(now - 1000, now), true);
  assert.equal(isWithinCooldown(now - DISMISS_COOLDOWN_MS + 1, now), true);
  assert.equal(isWithinCooldown(now - DISMISS_COOLDOWN_MS - 1, now), false);
  assert.equal(isWithinCooldown(now + 60_000, now), false); // clock skew
  assert.equal(isWithinCooldown(null, now), false);
  assert.equal(isWithinCooldown('garbage', now), false);
  assert.equal(isWithinCooldown(0, now), false);
});

/* ------------------------- service import safety ------------------------- */

test('the install service is import-safe without a DOM (no listeners at import)', async () => {
  const service = await import('../../src/services/pwaInstall.js');
  // In Node there is no window: the offer must be declined gracefully and the
  // install prompt reported as unavailable instead of throwing.
  assert.equal(await service.getOfferMode(), null);
  assert.equal(await service.promptInstall(), 'unavailable');
  const unsubscribe = service.onAppInstalled(() => {});
  assert.equal(typeof unsubscribe, 'function');
  assert.equal(unsubscribe(), true);
});
