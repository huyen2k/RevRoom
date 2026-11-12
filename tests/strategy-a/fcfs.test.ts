import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT } from '../../src/model/types';
import { simulateFcfsDay } from '../../src/model/strategy-a/fcfs';

test('FCFS chấp nhận khách đủ WTP theo thứ tự đến, không có protection', () => {
  const customers = [
    { id: 1, segment: 'tourist' as const, wtp: 900000, arrivalDay: 1 },
    { id: 2, segment: 'business' as const, wtp: 2000000, arrivalDay: 1 },
    { id: 3, segment: 'standard' as const, wtp: 500000, arrivalDay: 1 },
  ];
  const day = simulateFcfsDay({ ...DEFAULT, capacity: 2 }, 1, undefined, customers);
  assert.equal(day.accepted, 2);
  assert.equal(day.price, 1);
  assert.equal(day.full, 0);
  assert.deepEqual(day.protection, [0, 0, 0]);
  assert.equal(day.sold, 2);
  assert.equal(day.revenue, 700000 + 1600000);
});

test('FCFS kế thừa tồn kho và doanh thu từ ngày trước', () => {
  const previous = { day: 1, potential: 0, tourists: 0, standard: 0, business: 0, price: 0, full: 0, protected: 0, accepted: 0, dailyRevenue: 0, revenue: 1100000, sold: 1, remaining: 99, prices: DEFAULT.prices, protection: [0,0,0] as [number,number,number], transactions: [], priceMultiplier: 1 };
  const day = simulateFcfsDay(DEFAULT, 2, previous, []);
  assert.equal(day.sold, 1);
  assert.equal(day.revenue, 1100000);
  assert.equal(day.remaining, 99);
});
