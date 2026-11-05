import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../worker.js';

test('Worker sends API requests to the push handler before static assets', async () => {
  const response = await worker.fetch(
    new Request('https://taliani.example/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
    {}
  );

  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /FIREBASE_SERVICE_ACCOUNT/);
});

test('Worker rejects unsupported methods for the push endpoint', async () => {
  const response = await worker.fetch(
    new Request('https://taliani.example/api/send-push'),
    {}
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST');
});

test('Worker routes new-booking notifications to their server handler', async () => {
  const response = await worker.fetch(
    new Request('https://taliani.example/api/booking-created', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: 'booking-id' }),
    }),
    {}
  );

  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /FIREBASE_SERVICE_ACCOUNT/);
});

test('Worker exposes guest booking status lookup without leaking booking data', async () => {
  const invalid = await worker.fetch(
    new Request('https://taliani.example/api/guest-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: '../private', token: 'bad' }),
    }),
    {}
  );
  assert.equal(invalid.status, 400);

  const unconfigured = await worker.fetch(
    new Request('https://taliani.example/api/guest-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: 'booking-id', token: 'a'.repeat(64) }),
    }),
    {}
  );
  assert.equal(unconfigured.status, 503);
  assert.match((await unconfigured.json()).error, /not configured/i);

  const invalidLookup = await worker.fetch(
    new Request('https://taliani.example/api/guest-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingCode: 'bad', phone: '0550123456' }),
    }),
    {}
  );
  assert.equal(invalidLookup.status, 400);

  const unconfiguredLookup = await worker.fetch(
    new Request('https://taliani.example/api/guest-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingCode: 'ABC234', phone: '0550123456' }),
    }),
    {}
  );
  assert.equal(unconfiguredLookup.status, 503);
  assert.match((await unconfiguredLookup.json()).code, /LOOKUP_NOT_CONFIGURED/);
});

test('new-booking handler rejects malformed booking identifiers before Firestore access', async () => {
  const response = await worker.fetch(
    new Request('https://taliani.example/api/booking-created', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: '../private' }),
    }),
    { FIREBASE_SERVICE_ACCOUNT: '{"project_id":"demo-project"}' }
  );

  assert.equal(response.status, 400);
});

test('new-booking handler rejects invalid Firebase ID tokens', async () => {
  const response = await worker.fetch(
    new Request('https://taliani.example/api/booking-created', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid-token',
      },
      body: JSON.stringify({ bookingId: 'booking-id' }),
    }),
    { FIREBASE_SERVICE_ACCOUNT: '{"project_id":"demo-project"}' }
  );

  assert.equal(response.status, 401);
});

test('Worker serves non-API requests from the static assets binding', async () => {
  const request = new Request('https://taliani.example/bookings');
  const assetResponse = new Response('app shell');
  const response = await worker.fetch(request, {
    ASSETS: {
      fetch: async (assetRequest) => {
        assert.equal(assetRequest.url, request.url);
        return assetResponse;
      },
    },
  });

  assert.equal(response, assetResponse);
});
