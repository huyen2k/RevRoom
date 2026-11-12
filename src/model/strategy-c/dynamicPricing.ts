import type { Config } from '../types';

/** Heuristic cập nhật giá tại đầu ngày dựa trên booking pace, giữ giá trong ngày. */
export function calculateDynamicPrices(config: Config, day: number, soldAtStart: number): { prices: [number, number, number]; multiplier: number } {
  const multiplier = Math.max(config.min, Math.min(config.max,
    1 + config.k * (soldAtStart / config.capacity - (day - 1) / 30)));
  const prices = config.prices.map(price => (() => { const low = Math.ceil(price * config.min / 10000) * 10000; const high = Math.floor(price * config.max / 10000) * 10000; return low <= high ? Math.max(low, Math.min(high, Math.round(price * multiplier / 10000) * 10000)) : price * multiplier; })()) as [number, number, number];
  // If the 10k grid collapses fare classes, retain exact scaled prices.
  // Bounds and strict ordering take precedence over cosmetic rounding.
  if (!(prices[0] < prices[1] && prices[1] < prices[2])) {
    for (let i = 0; i < 3; i++) prices[i] = config.prices[i] * multiplier;
  }
  return { prices, multiplier };
}
