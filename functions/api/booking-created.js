import {
  firestoreField,
  json,
  readFirestoreDocument,
  sendFcm,
  verifyIdToken,
} from './send-push.js';

const BOOKING_ID_PATTERN = /^[A-Za-z0-9_-]{1,60}$/;
const MAX_BOOKING_AGE_MS = 5 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;

export async function onRequestPost({ request, env }) {
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
  if (!serviceAccount.project_id) {
    return json({ ok: false, error: 'FIREBASE_SERVICE_ACCOUNT has no project_id.' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' }, 400);
  }
  const bookingId = body?.bookingId;
  if (typeof bookingId !== 'string' || !BOOKING_ID_PATTERN.test(bookingId)) {
    return json({ ok: false, error: 'A valid bookingId is required.' }, 400);
  }

  const authHeader = request.headers.get('Authorization') || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '');
  const caller = idToken ? await verifyIdToken(idToken, serviceAccount.project_id) : null;
  if (idToken && !caller) return json({ ok: false, error: 'Invalid Firebase ID token.' }, 401);

  try {
    const booking = await readFirestoreDocument(serviceAccount, `bookings/${bookingId}`);
    if (!booking) return json({ ok: false, error: 'Booking not found.' }, 404);
    if (
      firestoreField(booking, 'source') !== 'online' ||
      firestoreField(booking, 'status') !== 'pending'
    ) {
      return json({ ok: false, error: 'Only new online bookings can trigger this notification.' }, 403);
    }

    const userId = firestoreField(booking, 'userId');
    if (typeof userId === 'string') {
      if (!caller || caller.sub !== userId) {
        return json({ ok: false, error: 'The booking does not belong to this user.' }, 403);
      }
    } else if (userId !== null || caller) {
      return json({ ok: false, error: 'The booking owner could not be verified.' }, 403);
    }

    const createdAt = Date.parse(firestoreField(booking, 'createdAt'));
    const age = Date.now() - createdAt;
    if (!Number.isFinite(createdAt) || age > MAX_BOOKING_AGE_MS || age < -CLOCK_SKEW_MS) {
      return json({ ok: false, error: 'The booking is not recent.' }, 403);
    }

    const settings = await readFirestoreDocument(serviceAccount, 'settings/public');
    const ownerUid = firestoreField(settings, 'ownerUid');
    if (typeof ownerUid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(ownerUid)) {
      return json({ ok: false, error: 'The shop owner is not configured.' }, 503);
    }

    const ownerProfile = await readFirestoreDocument(serviceAccount, `users/${ownerUid}`);
    const token = firestoreField(ownerProfile, 'fcmToken');
    if (typeof token !== 'string' || !token) {
      return json({ ok: false, error: 'Push notifications are not enabled for the shop owner.' }, 409);
    }

    const name = firestoreField(booking, 'name') || 'زبون';
    const time = firestoreField(booking, 'scheduledStart') || '';
    const sent = await sendFcm(
      serviceAccount,
      token,
      'حجز جديد',
      `لديك حجز جديد من ${name} على الساعة ${time}.`,
      { bookingId }
    );
    return json({ ok: sent }, sent ? 200 : 502);
  } catch (err) {
    console.error('Failed to send the new-booking push notification.', err);
    return json({ ok: false, error: 'Could not deliver the booking notification.' }, 502);
  }
}
