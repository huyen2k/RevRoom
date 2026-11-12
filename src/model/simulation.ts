import { DEFAULT, POLICIES, validate, type Config, type Customer, type Day, type Policy, type State } from './types';
import { generateCustomers } from './shared/customerGenerator';
import { simulateFcfsDay } from './strategy-a/fcfs';
import { simulateEmsrDay } from './strategy-b/simulation';
import { simulateDynamicEmsrDay } from './strategy-c/simulation';
import { calculateDynamicPrices } from './strategy-c/dynamicPricing';

export function initial(): State { return { day: 0, histories: { A: [], B: [], C: [] } }; }

/** Compatibility API retained for the existing UI. */
export function dailyPrices(c: Config, p: Policy, day: number, sold: number): [number, number, number] {
  if (p !== 'C') return [...c.prices] as [number, number, number];
  return calculateDynamicPrices(c, day, sold).prices;
}

export function policyDay(c: Config, p: Policy, day: number, previous: Day | undefined, customers: Customer[]): Day {
  if (p === 'A') return simulateFcfsDay(c, day, previous, customers);
  if (p === 'B') return simulateEmsrDay(c, day, previous, customers);
  return simulateDynamicEmsrDay(c, day, previous, customers);
}

export function step(c: Config, state: State, customers: Customer[][]): State {
  if (state.day >= 30) return state;
  const day = state.day + 1;
  const histories = { ...state.histories };
  for (const policy of POLICIES) histories[policy] = [...histories[policy], policyDay(c, policy, day, histories[policy].at(-1), customers[day - 1])];
  return { day, histories };
}

export function run(c: Config = DEFAULT, customers = generateCustomers(c)): State {
  const errors = validate(c);
  if (errors.length) throw new Error(errors.join(' '));
  let state = initial();
  while (state.day < 30) state = step(c, state, customers);
  return state;
}
