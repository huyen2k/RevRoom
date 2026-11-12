export type DescriptiveStats = { mean: number; median: number; sd: number; min: number; max: number; ci95Low: number; ci95High: number };

export function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * Math.max(0, Math.min(1, q));
  const lower = Math.floor(position), fraction = position - lower;
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction;
}

export function descriptiveStats(values: number[]): DescriptiveStats {
  if (!values.length) return { mean: 0, median: 0, sd: 0, min: 0, max: 0, ci95Low: 0, ci95High: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sd = values.length > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)) : 0;
  const margin = values.length > 1 ? 1.96 * sd / Math.sqrt(values.length) : 0;
  return { mean, median: quantile(values, .5), sd, min: Math.min(...values), max: Math.max(...values), ci95Low: mean - margin, ci95High: mean + margin };
}

/** Backward-compatible summary helper. */
export function stats(values: number[]) {
  const result = descriptiveStats(values);
  return { mean: result.mean, sd: result.sd };
}
