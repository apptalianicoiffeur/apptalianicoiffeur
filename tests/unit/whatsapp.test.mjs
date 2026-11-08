import test from 'node:test';
import assert from 'node:assert/strict';
import { fillTemplate } from '../../src/utils/whatsapp.js';

test('fillTemplate replaces provided empty placeholders without exposing their token', () => {
  assert.equal(
    fillTemplate('متابعة الحجز: {tracking_url}', { tracking_url: '' }),
    'متابعة الحجز: '
  );
});

test('fillTemplate keeps unknown placeholders available for later substitution', () => {
  assert.equal(fillTemplate('حجز {booking_id}', {}), 'حجز {booking_id}');
});
