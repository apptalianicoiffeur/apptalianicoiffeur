import test from 'node:test';
import assert from 'node:assert/strict';
import { shopCoordinates, shopMapUrl, shopNames } from '../../src/utils/shopInfo';

test('shopNames returns Arabic and French shop names with legacy fallback', () => {
  assert.deepEqual(shopNames({ shopNameAr: 'اسم المحل', shopNameFr: 'Nom du salon' }), {
    arabic: 'اسم المحل',
    french: 'Nom du salon',
  });
  assert.deepEqual(shopNames({ shopName: 'اسم قديم' }), {
    arabic: 'اسم قديم',
    french: 'Taliani Coiffeur',
  });
});

test('shopCoordinates validates map coordinates and map URLs use the exact location', () => {
  const settings = { shopLocationLatitude: '36.7538', shopLocationLongitude: '3.0588' };
  assert.deepEqual(shopCoordinates(settings), [36.7538, 3.0588]);
  assert.equal(
    shopMapUrl(settings),
    'https://www.google.com/maps/search/?api=1&query=36.7538%2C3.0588'
  );
  assert.equal(shopCoordinates({ shopLocationLatitude: ' ', shopLocationLongitude: '' }), null);
  assert.equal(shopCoordinates({ shopLocationLatitude: '91', shopLocationLongitude: '3' }), null);
  assert.equal(shopMapUrl({ address: '' }), null);
});
