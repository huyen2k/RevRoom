import type { Config } from './types';
import { buyProbability, weights } from './shared/customerGenerator';
export { buyProbability, generateCustomers, normalCount, poisson, random, weights, CustomerGenerator } from './shared/customerGenerator';

/** Forecast of unconstrained remaining demand from the current booking day onward. */
export function remainingForecast(config: Config, day: number, prices: [number, number, number]): number[] {
  return [0, 1, 2].map(index => {
    if (config.demandProfile) {
      const remaining = config.demandProfile.dailyMeans.slice(day - 1).reduce((sum, means) => sum + means[index], 0);
      return remaining * config.intensity * buyProbability(prices[index], config.prices[index]);
    }
    const remainingWeight = weights(index as 0 | 1 | 2).slice(day - 1).reduce((sum, value) => sum + value, 0);
    return config.demands[index] * config.intensity * remainingWeight * buyProbability(prices[index], config.prices[index]);
  });
}
