/**
 * The install offer must stay hidden when the site fails its PWA health
 * check — here: the manifest icon cannot be loaded (broken icon path).
 * Runs in its own Node process so the service's cached verification is fresh.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const listeners = new Map();

globalThis.window = {
  isSecureContext: true,
  location: { href: 'https://example.test/' },
  matchMedia: () => ({ matches: false }),
  addEventListener: (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
  },
  sessionStorage: {
    getItem: () => null,
    setItem: () => {},
  },
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
    icons: [{ src: '/icons/broken.png', sizes: '192x192', type: 'image/png' }],
  }),
});

// The icon probe always fails: the path is broken.
globalThis.Image = class {
  set src(_value) {
    queueMicrotask(() => this.onerror?.());
  }
};

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    platform: 'Win32',
    maxTouchPoints: 0,
    serviceWorker: { getRegistration: async () => null },
  },
});

const service = await import('../../src/services/pwaInstall.js');

test('broken PWA health check → no install offer at all', async () => {
  assert.equal(await service.verifyInstallSupport(), false);
  assert.equal(await service.getOfferMode(), null);
  // The service must still be safe to use (no duplicated/missing listeners).
  assert.equal(listeners.get('beforeinstallprompt')?.size ?? 0, 1);
  assert.equal(await service.promptInstall(), 'unavailable');
});
