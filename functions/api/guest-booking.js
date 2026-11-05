import { firestoreField, readFirestoreDocument } from './send-push.js';

const BOOKING_ID_PATTERN = /^[A-Za-z0-9_-]{1,60}$/;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};

function respond(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS', 'Cache-Control': 'no-store' } });
}

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return respond({ ok: false, error: 'Invalid request.' }, 400);
  }
  const bookingId = typeof payload?.bookingId === 'string' ? payload.bookingId : '';
  const token = typeof payload?.token === 'string' ? payload.token : '';
  if (!BOOKING_ID_PATTERN.test(bookingId) || !TOKEN_PATTERN.test(token)) {
    return respond({ ok: false, error: 'Invalid booking link.' }, 400);
  }
  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    return respond({ ok: false, error: 'Guest booking lookup is not configured.' }, 503);
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  } catch {
    return respond({ ok: false, error: 'Guest booking lookup is misconfigured.' }, 500);
  }
  if (!serviceAccount.project_id) {
    return respond({ ok: false, error: 'Guest booking lookup is misconfigured.' }, 500);
  }

  try {
    const booking = await readFirestoreDocument(serviceAccount, `bookings/${bookingId}`);
    const storedToken = firestoreField(booking, 'guestTrackingToken');
    if (
      !booking ||
      firestoreField(booking, 'source') !== 'online' ||
      firestoreField(booking, 'userId') !== null ||
      !storedToken ||
      !constantTimeEqual(storedToken, token)
    ) {
      return respond({ ok: false, error: 'Booking not found or link is invalid.' }, 404);
    }

    return respond({
      ok: true,
      booking: {
        id: bookingId,
        name: firestoreField(booking, 'name') || '',
        serviceName: firestoreField(booking, 'serviceName') || '',
        price: firestoreField(booking, 'price') || 0,
        date: firestoreField(booking, 'date') || '',
        scheduledStart: firestoreField(booking, 'scheduledStart') || '',
        status: firestoreField(booking, 'status') || '',
        proposedDate: firestoreField(booking, 'proposedDate') || null,
        proposedTime: firestoreField(booking, 'proposedTime') || null,
        barberMessage: firestoreField(booking, 'barberMessage') || '',
      },
    });
  } catch (err) {
    console.error('Failed to look up a guest booking.', err);
    return respond({ ok: false, error: 'Could not load this booking right now.' }, 502);
  }
}

function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) {
    return false;
  }
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}
