import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT } from '../../src/model/types';
import { emsrB } from '../../src/model/strategy-b/emsrB';
import { simulateEmsrDay } from '../../src/model/strategy-b/simulation';

test('EMSR-b có hai protection level lồng nhau và không vượt capacity', () => {
  const protection = emsrB(DEFAULT.prices, [10, 20, 30], 100, 'poisson');
  assert.ok(protection[0] >= protection[1]);
  assert.equal(protection[2], 0);
  assert.ok(protection.every(value => value >= 0 && value <= 100));
});

test('Chiến lược B giữ giá cố định và ghi nhận protection vào ngày mô phỏng', () => {
  const customers = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, segment: 'tourist' as const, wtp: 2000000, arrivalDay: 1 }));
  const day = simulateEmsrDay(DEFAULT, 1, undefined, customers);
  assert.deepEqual(day.prices, DEFAULT.prices);
  assert.ok(day.protection[0] >= day.protection[1]);
  assert.equal(day.priceMultiplier, 1);
});
