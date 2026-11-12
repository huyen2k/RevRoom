import type { Config, Customer, Day, Transaction } from '../types';

/** FCFS độc lập: không áp dụng bảo vệ tồn kho; khách đủ WTP được nhận đến khi hết phòng. */
export function simulateFcfsDay(
  config: Config,
  day: number,
  previous: Day | undefined,
  customers: Customer[],
): Day {
  let sold = previous?.sold ?? 0;
  let revenue = previous?.revenue ?? 0;
  const prices = [...config.prices] as [number, number, number];
  const result: Day = {
    day, potential: customers.length,
    tourists: customers.filter(x => x.segment === 'tourist').length,
    standard: customers.filter(x => x.segment === 'standard').length,
    business: customers.filter(x => x.segment === 'business').length,
    price: 0, full: 0, protected: 0, accepted: 0,
    dailyRevenue: 0, revenue, sold, remaining: config.capacity - sold,
    prices, protection: [0, 0, 0], transactions: [], priceMultiplier: 1,
  };
  for (const customer of customers) {
    const index = customer.segment === 'tourist' ? 0 : customer.segment === 'standard' ? 1 : 2;
    const price = prices[index];
    const before = config.capacity - sold;
    let outcome: Transaction['outcome'];
    if (customer.wtp < price) outcome = 'price';
    else if (before <= 0) outcome = 'full';
    else outcome = 'accepted';
    result[outcome]++;
    let transactionRevenue = 0;
    if (outcome === 'accepted') {
      sold++;
      revenue += price;
      transactionRevenue = price;
      result.dailyRevenue += price;
    }
    result.transactions.push({ ...customer, price, outcome, before, protection: 0, revenue: transactionRevenue });
  }
  return { ...result, sold, revenue, remaining: config.capacity - sold };
}
