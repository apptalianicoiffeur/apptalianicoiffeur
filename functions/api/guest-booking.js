import {
  firestoreField,
  queryFirestoreDocuments,
  readFirestoreDocument,
} from './send-push.js';

const BOOKING_ID_PATTERN = /^[A-Za-z0-9_-]{1,60}$/;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const BOOKING_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
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
  const bookingCode = typeof payload?.bookingCode === 'string' ? payload.bookingCode.trim().toUpperCase() : '';
  const phone = normalizeAlgerianPhone(payload?.phone);
  const useTrackingLink = Boolean(bookingId || token);
  const useBookingLookup = Boolean(bookingCode || payload?.phone);

  if (useTrackingLink === useBookingLookup) {
    return respond({ ok: false, code: 'INVALID_INPUT', error: 'Invalid lookup details.' }, 400);
  }
  if (
    (useTrackingLink && (!BOOKING_ID_PATTERN.test(bookingId) || !TOKEN_PATTERN.test(token))) ||
    (useBookingLookup && (!BOOKING_CODE_PATTERN.test(bookingCode) || !phone))
  ) {
    return respond({ ok: false, code: 'INVALID_INPUT', error: 'Invalid lookup details.' }, 400);
  }

  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    return respond(
      {
        ok: false,
        code: 'LOOKUP_NOT_CONFIGURED',
        error: 'Guest booking lookup is not configured.',
      },
      503
    );
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  } catch {
    return respond({ ok: false, code: 'LOOKUP_MISCONFIGURED', error: 'Guest booking lookup is misconfigured.' }, 500);
  }
  if (!serviceAccount.project_id) {
    return respond({ ok: false, code: 'LOOKUP_MISCONFIGURED', error: 'Guest booking lookup is misconfigured.' }, 500);
  }

  try {
    let booking;
    let resolvedBookingId;
    if (useTrackingLink) {
      booking = await readFirestoreDocument(serviceAccount, `bookings/${bookingId}`);
      const storedToken = firestoreField(booking, 'guestTrackingToken');
      if (!isGuestBooking(booking) || !storedToken || !constantTimeEqual(storedToken, token)) {
        return respond({ ok: false, code: 'BOOKING_NOT_FOUND', error: 'Booking not found or link is invalid.' }, 404);
      }
      resolvedBookingId = bookingId;
    } else {
      const matches = await queryFirestoreDocuments(serviceAccount, {
        from: [{ collectionId: 'bookings' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'code' },
            op: 'EQUAL',
            value: { stringValue: bookingCode },
          },
        },
        limit: { value: 25 },
      });
      const matchingBookings = matches.filter(
        (candidate) =>
          isGuestBooking(candidate) &&
          normalizeAlgerianPhone(firestoreField(candidate, 'phone')) === phone
      );
      if (matchingBookings.length !== 1) {
        return respond({ ok: false, code: 'BOOKING_NOT_FOUND', error: 'Booking not found.' }, 404);
      }
      booking = matchingBookings[0];
      resolvedBookingId = booking.name.split('/').pop();
    }

    return respond({
      ok: true,
      booking: {
        id: resolvedBookingId,
        code: firestoreField(booking, 'code') || '',
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

function isGuestBooking(booking) {
  return (
    booking &&
    firestoreField(booking, 'source') === 'online' &&
    firestoreField(booking, 'userId') === null
  );
}

function normalizeAlgerianPhone(value) {
  if (typeof value !== 'string') return null;
  let digits = value.trim().replace(/[\s\-().]/g, '');
  if (!digits) return null;

  if (digits.startsWith('+213')) digits = digits.slice(4);
  else if (digits.startsWith('00213')) digits = digits.slice(5);
  else if (digits.startsWith('213')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);

  if (!/^(?:[567]\d{8}|[234]\d{7})$/.test(digits)) return null;
  return `+213${digits}`;
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
