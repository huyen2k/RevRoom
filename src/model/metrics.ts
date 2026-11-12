import { POLICIES, type Config, type State } from './types';
import { evaluate as evaluateMonteCarlo } from './shared/monteCarlo';
export { stats } from './shared/statistics';
export { monteCarloCsv } from './shared/monteCarlo';

export function metrics(day: State['histories'][keyof State['histories']][number] | undefined, capacity: number, base = 0) {
  const revenue = day?.revenue ?? 0, sold = day?.sold ?? 0;
  return { revenue, sold, remaining: capacity - sold, occupancy: sold / capacity * 100, adr: sold ? revenue / sold : 0, revpar: revenue / capacity, delta: revenue - base, growth: base ? (revenue - base) / base * 100 : null };
}

/** Compatibility API: previous UI expects evaluate(config, n). */
export function evaluate(config: Config, n = 100) { return evaluateMonteCarlo(config, n); }

export function csv(config: Config, state: State) {
  const header = ['policy','day','distribution','tourists_arrived','standard_arrived','business_arrived','potential','price_reject','full','protected','accepted','daily_revenue','cumulative_revenue','sold','remaining','tourist_price','standard_price','business_price','tourist_wtp','standard_wtp','business_wtp','protection_tourist','protection_standard','price_multiplier','config'];
  const quote = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = POLICIES.flatMap(policy => state.histories[policy].map(day => {
    const by = [0,1,2].map(index => day.transactions.filter(t => (t.segment === 'tourist' ? 0 : t.segment === 'standard' ? 1 : 2) === index));
    return [policy,day.day,config.distribution,day.tourists,day.standard,day.business,day.potential,day.price,day.full,day.protected,day.accepted,day.dailyRevenue,day.revenue,day.sold,day.remaining,...day.prices,by[0].map(t=>t.wtp).join(';'),by[1].map(t=>t.wtp).join(';'),by[2].map(t=>t.wtp).join(';'),day.protection[0],day.protection[1],day.priceMultiplier,JSON.stringify(config)];
  }));
  return '\uFEFF' + [header, ...rows].map(row => row.map(quote).join(',')).join('\r\n');
}
