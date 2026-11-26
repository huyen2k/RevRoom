import { deepStrictEqual, equal, ok } from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, buildDemandProfile, calendarDays, generateHistory, historicalCsv, updateDefaultBaseline, type DayOverrides } from '../src/model/dataSimulation';
import { generateCustomers, remainingForecast } from '../src/model/demand';
import { run } from '../src/model/simulation';
import { DEFAULT } from '../src/model/types';

const eventDay = '2026-10-03';
const overrides: DayOverrides = { [eventDay]: { kind: 'Sự kiện', name: 'Hội nghị', factors: [1, 1, 1.5] } };

test('CSV has repeatable requests with real booking dates and correctly marked stay dates', () => {
  const start = '2026-10-01';
  const history = generateHistory(start, 2026, DEFAULT.demands, overrides);
  const csv = historicalCsv(history);
  equal(csv, historicalCsv(generateHistory(start, 2026, DEFAULT.demands, overrides)));
  const rows = csv.trim().split('\r\n').slice(1).map(row => row.split(','));
  equal(rows.length, history.total);
  equal(new Set(rows.map(row => row[2])).size, 30);
  ok(rows.every(row => row[1] >= addDays(row[2], -30) && row[1] <= addDays(row[2], -1)));
  ok(rows.filter(row => row[2] === eventDay).every(row => row[5] === '"Hội nghị"'));
  ok(rows.some(row => row[2] === '2026-10-04' && row[4] === '"Cuối tuần"'));
});

test('the four combinations use the intended baseline and apply calendar factors once', () => {
  const history = generateHistory('2026-09-01', 2026, DEFAULT.demands);
  const calendar = calendarDays('2026-10-01', overrides);
  const baseline = buildDemandProfile(DEFAULT.demands, history)!;
  const upcoming = buildDemandProfile(DEFAULT.demands, undefined, calendar)!;
  const combined = buildDemandProfile(DEFAULT.demands, history, calendar)!;

  equal(buildDemandProfile(DEFAULT.demands), undefined);
  equal(baseline.dailyMeans[2][2], history.days.reduce((sum, stay) =>
    sum + stay.counts.slice(0, 10).reduce((stage, day) => stage + day[2], 0), 0) / 300);
  equal(combined.dailyMeans[2][2], baseline.dailyMeans[2][2] * 1.5);
  equal(combined.dailyMeans[2][0], baseline.dailyMeans[2][0]); // Event overrides Saturday.
  equal(combined.dailyMeans[3][0], baseline.dailyMeans[3][0] * 1.2);
  ok(upcoming.dailyMeans[2][2] > upcoming.dailyMeans[1][2]);
  deepStrictEqual(combined.dailyMeans[4], baseline.dailyMeans[4]);
  equal(updateDefaultBaseline([0, 0, 0], upcoming)!.dailyMeans[2][2], 0);
  equal(updateDefaultBaseline([0, 0, 0], combined), combined);
});

test('the active profile drives generated customers and the EMSR-b forecast from the same means', () => {
  const dailyMeans = Array.from({ length: 30 }, (_, index): [number, number, number] => index === 10 ? [0, 0, 25] : [0, 0, 0]);
  const config = { ...DEFAULT, demandProfile: { dailyMeans } };
  const customers = generateCustomers(config);
  ok(customers[10].length > 0);
  ok(customers.flat().every(customer => customer.segment === 'business' && customer.arrivalDay === 11));
  equal(remainingForecast(config, 11, config.prices)[2], 25 * (1.6 - 1) / 0.9);
  deepStrictEqual(remainingForecast(config, 12, config.prices), [0, 0, 0]);
  const { histories } = run(config);
  for (const policy of ['A', 'B', 'C'] as const) {
    deepStrictEqual(histories[policy][10].transactions.map(customer => customer.id), customers[10].map(customer => customer.id));
  }
});
