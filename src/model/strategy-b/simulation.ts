import type { Config, Customer, Day, Transaction } from '../types';
import { remainingForecast } from '../demand';
import { emsrB } from './emsrB';

/** Một ngày của chiến lược B: giá cố định + hai protection level EMSR-b. */
export function simulateEmsrDay(config: Config, day: number, previous: Day | undefined, customers: Customer[]): Day {
  let sold = previous?.sold ?? 0;
  let revenue = previous?.revenue ?? 0;
  const prices = [...config.prices] as [number, number, number];
  const means = remainingForecast(config, day, prices) as [number, number, number];
  const protection = emsrB(prices, means, config.capacity - sold, config.distribution);
  const result: Day = {
    day, potential: customers.length,
    tourists: customers.filter(x => x.segment === 'tourist').length,
    standard: customers.filter(x => x.segment === 'standard').length,
    business: customers.filter(x => x.segment === 'business').length,
    price: 0, full: 0, protected: 0, accepted: 0,
    dailyRevenue: 0, revenue, sold, remaining: config.capacity - sold,
    prices, protection, transactions: [], priceMultiplier: 1,
  };
  for (const customer of customers) {
    const index = customer.segment === 'tourist' ? 0 : customer.segment === 'standard' ? 1 : 2;
    const price = prices[index], before = config.capacity - sold, y = index < 2 ? protection[index] : 0;
    let outcome: Transaction['outcome'];
    if (customer.wtp < price) outcome = 'price';
    else if (before === 0) outcome = 'full';
    else if (index < 2 && before <= y) outcome = 'protected';
    else outcome = 'accepted';
    result[outcome]++;
    let transactionRevenue = 0;
    if (outcome === 'accepted') { sold++; revenue += price; transactionRevenue = price; result.dailyRevenue += price; }
    result.transactions.push({ ...customer, price, outcome, before, protection: y, revenue: transactionRevenue });
  }
  return { ...result, sold, revenue, remaining: config.capacity - sold };
}
