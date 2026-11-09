/**
 * Integration tests for the PWA install-offer service.
 *
 * A minimal fake browser environment (window/document/navigator/Image/fetch)
 * is installed BEFORE the service is imported so its single module-level
 * listener registration can be observed. Each test file runs in its own
 * Node process, so the module state here is isolated.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

/* ------------------------- fake browser environment ---------------------- */

const listeners = new Map();
const on = (type, fn) => {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
};
const dispatch = (type, event) => {
  for (const fn of [...(listeners.get(type) || [])]) fn(event);
};

function makeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  };
}

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const SAFARI_MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const FIREFOX_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0';

const env = {
  standalone: false,
  userAgent: CHROME_UA,
  platform: 'Win32',
  maxTouchPoints: 0,
  iconOk: true,
};

const fakeLocalStorage = makeStorage();
const fakeSessionStorage = makeStorage();

globalThis.window = {
  isSecureContext: true,
  location: { href: 'https://example.test/' },
  matchMedia: (query) => ({ matches: env.standalone && query === '(display-mode: standalone)' }),
  addEventListener: (type, fn) => on(type, fn),
  removeEventListener: (type, fn) => listeners.get(type)?.delete(fn),
  localStorage: fakeLocalStorage,
  sessionStorage: fakeSessionStorage,
};

globalThis.document = {
  querySelector: (selector) =>
    selector === 'link[rel="manifest"]' ? { href: 'https://example.test/manifest.json' } : null,
};

globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({
    name: 'طالياني كوافير',
    start_url: '/',
    display: 'standalone',
    icons: [{ src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }),
});

globalThis.Image = class {
  set src(value) {
    queueMicrotask(() => (env.iconOk ? this.onload?.() : this.onerror?.()));
  }
};

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    get userAgent() {
      return env.userAgent;
    },
    get platform() {
      return env.platform;
    },
    get maxTouchPoints() {
      return env.maxTouchPoints;
    },
    serviceWorker: { getRegistration: async () => null },
  },
});

const service = await import('../../src/services/pwaInstall.js');
const { STORAGE_KEYS, DISMISS_COOLDOWN_MS } = await import('../../src/utils/pwa.js');

/** A minimal BeforeInstallPromptEvent stand-in. */
function fakePromptEvent(outcome = 'accepted') {
  return {
    prompted: false,
    preventDefault() {},
    prompt() {
      this.prompted = true;
    },
    userChoice: Promise.resolve({ outcome }),
  };
}

const clearFlags = () => {
  fakeLocalStorage.clear();
  fakeSessionStorage.clear();
};

/* --------------------------------- tests -------------------------------- */

test('browser listeners are registered exactly once', async () => {
  assert.equal(listeners.get('beforeinstallprompt')?.size ?? 0, 1);
  assert.equal(listeners.get('appinstalled')?.size ?? 0, 1);

  const off = service.onAppInstalled(() => {});
  off();
  await service.onAppInstalled(() => {});
  assert.equal(listeners.get('appinstalled')?.size ?? 0, 1); // still a single listener
});

test('installability is verified once and cached', async () => {
  assert.equal(await service.verifyInstallSupport(), true);
  assert.equal(await service.verifyInstallSupport(), true);
});

test('no offer when running in a standalone (installed) window', async () => {
  env.standalone = true;
  assert.equal(await service.getOfferMode(), null);
  // The standalone launch is remembered as "installed" for browser-tab visits.
  assert.ok(fakeLocalStorage.getItem(STORAGE_KEYS.installed));
  env.standalone = false;
  clearFlags();
});

test('no offer when installation was already remembered', async () => {
  fakeLocalStorage.setItem(STORAGE_KEYS.installed, String(Date.now()));
  assert.equal(await service.getOfferMode(), null);
  clearFlags();
});

test('no offer twice within the same browser session', async () => {
  fakeSessionStorage.setItem(STORAGE_KEYS.sessionOffered, '1');
  assert.equal(await service.getOfferMode(), null);
  clearFlags();
});

test('no offer during the cooldown, offer again once it expires', async () => {
  const now = Date.now();
  fakeLocalStorage.setItem(STORAGE_KEYS.dismissedAt, String(now));
  assert.equal(await service.getOfferMode({ now }), null);

  fakeLocalStorage.setItem(
    STORAGE_KEYS.dismissedAt,
    String(now - DISMISS_COOLDOWN_MS - 1000)
  );
  env.userAgent = IOS_UA;
  env.platform = 'iPhone';
  assert.equal(await service.getOfferMode({ now }), 'ios');
  // Even after all those calls, listeners were never duplicated.
  assert.equal(listeners.get('beforeinstallprompt')?.size ?? 0, 1);
  clearFlags();
});

test('iPhone Safari gets the share-sheet instructions mode', async () => {
  env.userAgent = IOS_UA;
  env.platform = 'iPhone';
  assert.equal(await service.getOfferMode(), 'ios');
  clearFlags();
});

test('Chromium with a captured prompt event offers the native mode', async () => {
  env.userAgent = CHROME_UA;
  env.platform = 'Win32';
  dispatch('beforeinstallprompt', fakePromptEvent());
  assert.equal(await service.getOfferMode(), 'native');
});

test('promptInstall accepts → marks installed and can no longer prompt', async () => {
  const event = fakePromptEvent('accepted');
  dispatch('beforeinstallprompt', event);
  assert.equal(await service.promptInstall(), 'accepted');
  assert.equal(event.prompted, true);
  assert.ok(fakeLocalStorage.getItem(STORAGE_KEYS.installed));
  assert.equal(await service.promptInstall(), 'unavailable'); // one-shot event
  clearFlags();
});

test('promptInstall rejection → records the cooldown timestamp', async () => {
  dispatch('beforeinstallprompt', fakePromptEvent('dismissed'));
  assert.equal(await service.promptInstall(), 'dismissed');
  assert.ok(Number(fakeLocalStorage.getItem(STORAGE_KEYS.dismissedAt)) > 0);
  clearFlags();
});

test('appinstalled marks installed and notifies subscribers', async () => {
  let notified = 0;
  const off = service.onAppInstalled(() => {
    notified += 1;
  });
  dispatch('appinstalled', {});
  assert.equal(notified, 1);
  assert.ok(fakeLocalStorage.getItem(STORAGE_KEYS.installed));
  assert.equal(await service.getOfferMode(), null); // installed → no more offers
  assert.equal(off(), true);
  clearFlags();
});

test('a late beforeinstallprompt upgrades the pending offer to native', async () => {
  const pending = service.getOfferMode(); // Chromium, no event yet → waits
  setTimeout(() => dispatch('beforeinstallprompt', fakePromptEvent()), 50);
  assert.equal(await pending, 'native');
  await service.promptInstall(); // consume the one-shot event
  clearFlags();
});

test('Chromium without a prompt event falls back to menu instructions', async () => {
  env.userAgent = CHROME_UA;
  env.platform = 'Win32';
  assert.equal(await service.getOfferMode(), 'chrome-menu');
  clearFlags();
});

test('macOS Safari gets the Add-to-Dock instructions mode', async () => {
  env.userAgent = SAFARI_MAC_UA;
  env.platform = 'MacIntel';
  env.maxTouchPoints = 0;
  assert.equal(await service.getOfferMode(), 'safari-menu');
  clearFlags();
});

test('browsers without a web install path get no offer', async () => {
  env.userAgent = FIREFOX_UA;
  env.platform = 'Win32';
  assert.equal(await service.getOfferMode(), null);
  clearFlags();
});

test('iPadOS masquerading as a Mac is still detected as iOS', async () => {
  env.userAgent = SAFARI_MAC_UA;
  env.platform = 'MacIntel';
  env.maxTouchPoints = 5;
  assert.equal(await service.getOfferMode(), 'ios');
  clearFlags();
});
