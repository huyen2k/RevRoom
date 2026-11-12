import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT } from '../../src/model/types';
import { calculateDynamicPrices } from '../../src/model/strategy-c/dynamicPricing';
import { simulateDynamicEmsrDay } from '../../src/model/strategy-c/simulation';

test('Dynamic pricing giới hạn hệ số và làm tròn giá đến 10.000 đồng', () => {
  const result = calculateDynamicPrices(DEFAULT, 1, 100);
  assert.ok(result.multiplier <= DEFAULT.max);
  assert.ok(result.multiplier >= DEFAULT.min);
  assert.ok(result.prices.every(price => price % 10000 === 0));
});

test('Chiến lược C ghi nhận hệ số và giá động ở đầu ngày', () => {
  const day = simulateDynamicEmsrDay(DEFAULT, 1, undefined, []);
  assert.equal(day.priceMultiplier, 1);
  assert.deepEqual(day.prices, DEFAULT.prices);
  assert.ok(day.protection[0] >= day.protection[1]);
});


test('Giá luôn dương, giữ thứ tự và nằm trong giới hạn sau làm tròn', () => {
 for (const prices of [[10000,11000,12000],[15000,25000,35000],DEFAULT.prices] as [number,number,number][]) {
  for (const min of [.1,.8,1]) for (const max of [1,1.25,3]) for (const day of [1,15,30]) {
   const config={...DEFAULT,prices,min,max,k:3};
   const result=calculateDynamicPrices(config,day,0);
   assert.ok(result.prices[0]>0 && result.prices[0]<result.prices[1] && result.prices[1]<result.prices[2]);
   result.prices.forEach((p,i)=>assert.ok(p>=prices[i]*min && p<=prices[i]*max));
  }
 }
});
