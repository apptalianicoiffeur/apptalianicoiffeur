/**
 * Cloudflare Pages Function / Worker handler: POST /api/send-push
 *
 * Sends a push notification through the FCM HTTP v1 API. This replaces Firebase
 * Cloud Functions so the app stays on the free Spark plan.
 *
 * Security:
 *  1. The caller must present a valid Firebase ID token. Its RS256 signature is
 *     verified with the Web Crypto API against Google's securetoken JWKs
 *     (issuer, audience and expiry are also checked).
 *  2. The token's email must equal the configured OWNER_EMAIL, so only the
 *     barber can trigger pushes.
 *
 * Only Web APIs are used (fetch + crypto.subtle), so the function runs on the
 * Cloudflare Workers runtime without any compatibility flags.
 *
 * Required Cloudflare environment (Pages or Worker > Settings > Variables):
 *  - FIREBASE_SERVICE_ACCOUNT : JSON string of a Firebase service account
 *    (Project settings > Service accounts > Generate new private key).
 * Grant it the "Firebase Cloud Messaging API Admin" and read-only
 * "Cloud Datastore Viewer" roles.
 *  - OWNER_EMAIL              : the barber's Google account email.
 *
 * The function degrades gracefully: if it is not configured the app keeps
 * working with in-app (Firestore) notifications only.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/* --------------------------- small base64 helpers --------------------------- */

/** base64url -> Uint8Array */
function b64urlToBytes(input) {
  const b64 = String(input).replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Uint8Array -> base64url */
function bytesToB64url(bytes) {
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeJsonPart(part) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));
}

/* --------------------------- Firebase ID token --------------------------- */

let jwksCache = { keys: [], fetchedAt: 0 };

/** Fetch (and cache) Google's securetoken public keys. */
async function getSecureTokenKeys() {
  if (jwksCache.keys.length && Date.now() - jwksCache.fetchedAt < 6 * 3600 * 1000) {
    return jwksCache.keys;
  }
  const res = await fetch(JWK_URL);
  const data = await res.json();
  jwksCache = { keys: data.keys || [], fetchedAt: Date.now() };
  return jwksCache.keys;
}

/** Verify a Firebase ID token. Returns the payload or null. */
export async function verifyIdToken(idToken, projectId) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) return null;

  let header;
  let payload;
  try {
    header = decodeJsonPart(parts[0]);
    payload = decodeJsonPart(parts[1]);
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (payload.aud !== projectId) return null;
  if (!payload.exp || payload.exp < now) return null;
  if (!payload.email) return null;

  try {
    const keys = await getSecureTokenKeys();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;

    const publicKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const valid = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      publicKey,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    return valid ? payload : null;
  } catch {
    return null;
  }
}

/* --------------------------- FCM HTTP v1 send --------------------------- */

/** Convert a PKCS#8 PEM private key to an ArrayBuffer usable by WebCrypto. */
function pemToDer(pem) {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Sign a JWT with the service account key (RS256, WebCrypto). */
async function signServiceAccount(sa, scope = 'https://www.googleapis.com/auth/firebase.messaging') {
  const now = Math.floor(Date.now() / 1000);
  const header = bytesToB64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = bytesToB64url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: sa.client_email,
        scope,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      })
    )
  );
  const data = `${header}.${claims}`;

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    new TextEncoder().encode(data)
  );
  return `${data}.${bytesToB64url(new Uint8Array(signature))}`;
}

/** Exchange the signed JWT for an OAuth access token. */
async function getAccessToken(sa, scope = 'https://www.googleapis.com/auth/firebase.messaging') {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: await signServiceAccount(sa, scope),
    }),
  });
  const body = await res.json();
  return body.access_token || null;
}

/** Send one message through FCM HTTP v1. */
export async function sendFcm(sa, token, title, body, data) {
  const access = await getAccessToken(sa);
  if (!access) return false;

  const stringData = {};
  Object.entries(data || {}).forEach(([k, v]) => {
    stringData[k] = String(v);
  });

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${access}`,
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data: stringData,
        webpush: {
          notification: { icon: '/icons/icon.svg', badge: '/icons/icon.svg', dir: 'rtl', lang: 'ar' },
        },
      },
    }),
  });
  return res.ok;
}

/** Read one Firestore REST document using a read-only service-account scope. */
export async function readFirestoreDocument(sa, documentPath) {
  const access = await getAccessToken(sa, 'https://www.googleapis.com/auth/datastore');
  if (!access) throw new Error('Could not obtain a Firestore access token.');

  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}` +
    `/databases/(default)/documents/${documentPath}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore lookup failed with HTTP ${response.status}.`);
  return response.json();
}

/** Run a read-only structured query against a Firestore collection. */
export async function queryFirestoreDocuments(sa, structuredQuery) {
  const access = await getAccessToken(sa, 'https://www.googleapis.com/auth/datastore');
  if (!access) throw new Error('Could not obtain a Firestore access token.');

  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}` +
    '/databases/(default)/documents:runQuery';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!response.ok) throw new Error(`Firestore query failed with HTTP ${response.status}.`);
  const rows = await response.json();
  return rows.map((row) => row.document).filter(Boolean);
}

/** Return a decoded scalar from a Firestore REST document. */
export function firestoreField(document, name) {
  const field = document?.fields?.[name];
  if (!field) return undefined;
  if ('stringValue' in field) return field.stringValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return field.doubleValue;
  if ('booleanValue' in field) return field.booleanValue;
  if ('timestampValue' in field) return field.timestampValue;
  if ('nullValue' in field) return null;
  return undefined;
}

/* ------------------------------- handler -------------------------------- */

export async function onRequestPost(context) {
  const { request, env } = context;

  // --- Configuration ---------------------------------------------------
  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    return json(
      { ok: false, error: 'Push is not configured: FIREBASE_SERVICE_ACCOUNT secret is missing.' },
      503
    );
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  } catch {
    return json({ ok: false, error: 'FIREBASE_SERVICE_ACCOUNT is not valid JSON.' }, 500);
  }

  const ownerEmail = (env.OWNER_EMAIL || env.VITE_OWNER_EMAIL || '').toLowerCase();
  if (!ownerEmail) {
    return json({ ok: false, error: 'OWNER_EMAIL environment variable is missing.' }, 503);
  }

  // --- Caller authentication ------------------------------------------
  const authHeader = request.headers.get('Authorization') || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!idToken) return json({ ok: false, error: 'Missing Firebase ID token.' }, 401);

  const payload = await verifyIdToken(idToken, serviceAccount.project_id);
  if (!payload) return json({ ok: false, error: 'Invalid Firebase ID token.' }, 401);
  if (String(payload.email || '').toLowerCase() !== ownerEmail) {
    return json({ ok: false, error: 'Only the shop owner may send push notifications.' }, 403);
  }

  // --- Payload ---------------------------------------------------------
  let bodyJson;
  try {
    bodyJson = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' }, 400);
  }

  const { token, title, body, data } = bodyJson || {};
  if (!token || !title) {
    return json({ ok: false, error: 'Both "token" and "title" are required.' }, 400);
  }

  // --- Send ------------------------------------------------------------
  try {
    const ok = await sendFcm(serviceAccount, token, String(title), String(body || ''), data || {});
    return json({ ok }, ok ? 200 : 502);
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err) }, 502);
  }
}
