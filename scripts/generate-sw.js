#!/usr/bin/env node
/**
 * Generates `public/firebase-messaging-sw.js` at build time by injecting the
 * PUBLIC Firebase web config (a service worker cannot read Vite env vars).
 *
 * Values come from `.env` (or the process environment in CI, e.g. Cloudflare
 * Pages build environment variables).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Tiny .env parser (no dependencies). */
function loadEnvFile() {
  const env = {};
  const file = resolve(root, '.env');
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

const env = { ...loadEnvFile(), ...process.env };

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'REPLACE_ME',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'REPLACE_ME',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'REPLACE_ME',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'REPLACE_ME',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'REPLACE_ME',
  appId: env.VITE_FIREBASE_APP_ID || 'REPLACE_ME',
};

const templatePath = resolve(root, 'scripts/firebase-messaging-sw.template.js');
const outPath = resolve(root, 'public/firebase-messaging-sw.js');

const template = readFileSync(templatePath, 'utf8');
const output = template.replace('__FIREBASE_CONFIG__', JSON.stringify(config, null, 2));
writeFileSync(outPath, output, 'utf8');

const missing = Object.values(config).includes('REPLACE_ME');
console.log(
  `[generate-sw] wrote ${outPath} for project "${config.projectId}"${missing ? ' (WARNING: using placeholder values - fill in .env)' : ''}`
);
