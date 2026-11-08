import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingTrackingUrl,
  createGuestTrackingToken,
  guestTrackingUrl,
} from '../../src/utils/guestTracking.js';

test('guest tracking tokens are high-entropy URL-safe hex strings', () => {
  const token = createGuestTrackingToken();
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.notEqual(token, createGuestTrackingToken());
});

test('guest tracking URL encodes the booking id and token', () => {
  const url = guestTrackingUrl(
    { id: 'booking_123', guestTrackingToken: 'a'.repeat(64) },
    'https://taliani.example'
  );
  assert.equal(
    url,
    `https://taliani.example/track?bookingId=booking_123#token=${'a'.repeat(64)}`
  );
});

test('guest tracking URL rejects malformed tokens', () => {
  assert.equal(
    guestTrackingUrl({ id: 'booking_123', guestTrackingToken: 'short' }, 'https://taliani.example'),
    null
  );
});

test('booking tracking URL uses the secure guest link or the signed-in bookings page', () => {
  assert.equal(
    bookingTrackingUrl(
      { id: 'guest_123', guestTrackingToken: 'a'.repeat(64) },
      'https://taliani.example'
    ),
    `https://taliani.example/track?bookingId=guest_123#token=${'a'.repeat(64)}`
  );
  assert.equal(
    bookingTrackingUrl({ id: 'account booking', userId: 'client_123' }, 'https://taliani.example'),
    'https://taliani.example/bookings?bookingId=account+booking'
  );
  assert.equal(bookingTrackingUrl({ id: 'legacy_guest' }, 'https://taliani.example'), null);
});
