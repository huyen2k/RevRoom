import { POLICIES, type Config, type Policy } from '../types';
import { run } from '../simulation';
import { descriptiveStats } from './statistics';

export type MonteCarloRun = { seed: number; revenue: Record<Policy, number>; sold: Record<Policy, number> };
export type MonteCarloResult = {
  config: Config; n: number; start: number; end: number; runs: MonteCarloRun[];
  rows: Array<{ policy: Policy; mean: number; median: number; sd: number; min: number; max: number; ci95Low: number; ci95High: number; occupancy: number; winRate: number }>;
  pairs: Array<{ label: string; left: Policy; right: Policy; mean: number; median: number; sd: number; min: number; max: number; ci95Low: number; ci95High: number; winRate: number; tieRate: number }>;
};

/** Paired Monte Carlo: each seed produces one market scenario shared by A/B/C. */
export function evaluate(config: Config, n = 100): MonteCarloResult {
  if (!Number.isInteger(n) || n < 2 || n > 10000) throw new RangeError('Số lượt Monte Carlo phải là số nguyên từ 2 đến 10.000.');
  const runs: MonteCarloRun[] = Array.from({ length: n }, (_, i) => {
    const seed = (config.seed + i) % 4294967096;
    const state = run({ ...config, seed });
    return {
      seed,
      revenue: Object.fromEntries(POLICIES.map(p => [p, state.histories[p][29].revenue])) as Record<Policy, number>,
      sold: Object.fromEntries(POLICIES.map(p => [p, state.histories[p][29].sold])) as Record<Policy, number>,
    };
  });
  const best = runs.map(row => Math.max(...POLICIES.map(p => row.revenue[p])));
  const rows = POLICIES.map(policy => {
    const values = runs.map(row => row.revenue[policy]);
    const stats = descriptiveStats(values);
    return { policy, ...stats,
      occupancy: runs.reduce((sum, row) => sum + row.sold[policy] / config.capacity * 100, 0) / n,
      winRate: runs.filter((row, i) => row.revenue[policy] === best[i]).length / n * 100,
    };
  });
  const pairs = ([['B', 'A'], ['C', 'A'], ['C', 'B']] as const).map(([left, right]) => {
    const diffs = runs.map(row => row.revenue[left] - row.revenue[right]);
    const stats = descriptiveStats(diffs);
    return { label: `${left} − ${right}`, left, right, ...stats,
      winRate: diffs.filter(value => value > 0).length / n * 100,
      tieRate: diffs.filter(value => value === 0).length / n * 100,
    };
  });
  return { config: structuredClone(config), n, start: runs[0].seed, end: runs[runs.length - 1].seed, runs, rows, pairs };
}

export function monteCarloCsv(result: MonteCarloResult): string {
  const header = ['seed', ...POLICIES.flatMap(p => [`${p}_revenue`, `${p}_sold`]), 'config'];
  const rows = result.runs.map(run => [run.seed, ...POLICIES.flatMap(p => [run.revenue[p], run.sold[p]]), JSON.stringify(result.config)]);
  return '\uFEFF' + [header, ...rows].map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\r\n');
}
