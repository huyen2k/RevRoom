/**
 * REVROOM RMaaS - HOTEL SIMULATION SERVICE ENGINE
 * Động cơ mô phỏng toàn diện theo định hướng Dịch vụ định giá khách sạn (RMaaS).
 * Tự do nhận mọi số lượng phòng (Capacity) và mọi số lượng hạng giá (N Fare Classes),
 * tính toán các giới hạn bảo vệ EMSR-b, sinh tập khách hàng tương ứng và mô phỏng 30 ngày
 * cho cả 3 chiến lược: FCFS (A), EMSR-b (B), và Dynamic Pricing (C).
 */

import type { Distribution } from '../model/types';
import type { CustomFareClass, EmsrNResult, EmsrNStep } from './emsrN';
import { calculateEmsrN } from './emsrN';

export interface HotelConfig {
  hotelName: string;
  capacity: number;
  fareClasses: CustomFareClass[];
  seed: number;
  intensity: number;
  distribution: Distribution;
  k: number;
  min: number;
  max: number;
}

export interface HotelCustomer {
  id: number;
  classIndex: number;
  classId: string;
  className: string;
  basePrice: number;
  wtp: number;
  arrivalDay: number;
}

export type HotelOutcome = 'accepted' | 'price' | 'full' | 'protected';

export interface HotelTransaction {
  id: number;
  classIndex: number;
  classId: string;
  className: string;
  wtp: number;
  arrivalDay: number;
  offeredPrice: number;
  outcome: HotelOutcome;
  roomsBefore: number;
  protectionThreshold: number;
  revenue: number;
}

export interface HotelDayRecord {
  day: number;
  potentialCustomers: number;
  arrivalsByClass: Record<string, number>;
  acceptedByClass: Record<string, number>;
  acceptedCount: number;
  rejectedPriceCount: number;
  rejectedProtectedCount: number;
  rejectedFullCount: number;
  dailyRevenue: number;
  cumulativeRevenue: number;
  cumulativeSold: number;
  remainingRooms: number;
  pricesByClass: Record<string, number>;
  protectionByClass: Record<string, number>;
  bookingLimitsByClass: Record<string, number>;
  priceMultiplier: number;
  transactions: HotelTransaction[];
}

export interface HotelSimulationState {
  day: number;
  histories: {
    A: HotelDayRecord[];
    B: HotelDayRecord[];
    C: HotelDayRecord[];
  };
}

export interface MonteCarloRunResult {
  seed: number;
  revenue: { A: number; B: number; C: number };
  sold: { A: number; B: number; C: number };
}

export interface MonteCarloSummaryRow {
  policy: 'A' | 'B' | 'C';
  mean: number;
  median: number;
  sd: number;
  min: number;
  max: number;
  ci95Low: number;
  ci95High: number;
  occupancy: number;
  winRate: number;
}

export interface MonteCarloPairRow {
  label: string;
  mean: number;
  median: number;
  sd: number;
  min: number;
  max: number;
  ci95Low: number;
  ci95High: number;
  winRate: number;
  tieRate: number;
}

export interface MonteCarloBatchResult {
  n: number;
  start: number;
  end: number;
  rows: MonteCarloSummaryRow[];
  pairs: MonteCarloPairRow[];
  runs: MonteCarloRunResult[];
}

/** PRNG Mulberry32 */
function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Knuth Poisson (với xấp xỉ Normal O(1) khi lambda > 500 để tránh tràn bộ nhớ / treo CPU) */
function samplePoisson(lambda: number, rng: () => number): number {
  if (lambda <= 0) return 0;
  if (lambda > 500) return sampleNormal(lambda, rng);
  let result = 0;
  let remaining = lambda;
  while (remaining > 0) {
    const chunk = Math.min(20, remaining);
    const limit = Math.exp(-chunk);
    let product = 1;
    let count = 0;
    do {
      count += 1;
      product *= Math.max(rng(), 1e-15);
    } while (product > limit);
    result += count - 1;
    remaining -= chunk;
  }
  return result;
}

/** Normal sample */
function sampleNormal(mu: number, rng: () => number): number {
  if (mu <= 0) return 0;
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(0, Math.round(mu + Math.sqrt(mu) * z));
}

/**
 * Trọng số đường cầu theo ngày cho N hạng phòng (1..30 ngày).
 * Hạng rẻ nhất (i = 0) đặt sớm nhất (đỉnh ngày 1-3).
 * Hạng đắt nhất (i = N - 1) đặt muộn nhất (đỉnh ngày 28-30).
 */
function getBookingCurveWeights(classIndex: number, totalClasses: number): number[] {
  const ratio = totalClasses > 1 ? classIndex / (totalClasses - 1) : 0.5;
  const peakDay = 1 + ratio * 29; // 1 đến 30
  const sigma = 7.5; // Độ trải rộng của đường cầu
  const raw = Array.from({ length: 30 }, (_, d) => {
    const day = d + 1;
    const diff = (day - peakDay) / sigma;
    return Math.exp(-0.5 * diff * diff);
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map(w => w / (sum || 1));
}

export const MAX_SAFE_CAPACITY = 5000;
export const MAX_SAFE_CLASS_DEMAND = 5000;
const MAX_DAILY_CUSTOMERS_PER_CLASS = 800;
const MAX_STORED_TRANSACTIONS_PER_DAY = 300;

/**
 * Sinh tập khách hàng 30 ngày tương ứng cho N hạng giá (có giới hạn an toàn bộ nhớ)
 */
export function generateHotelCustomers(config: HotelConfig): HotelCustomer[][] {
  const rng = createRandom(config.seed);
  const sortedClasses = [...config.fareClasses].sort((a, b) => a.price - b.price);
  const n = sortedClasses.length;
  const weights = sortedClasses.map((_, i) => getBookingCurveWeights(i, n));
  const safeIntensity = Math.min(5, Math.max(0, config.intensity || 1));

  let nextId = 0;
  const schedule: HotelCustomer[][] = [];

  for (let d = 0; d < 30; d++) {
    const dayCustomers: HotelCustomer[] = [];

    for (let i = 0; i < n; i++) {
      const cls = sortedClasses[i];
      const safeClassDemand = Math.min(MAX_SAFE_CLASS_DEMAND, Math.max(0, cls.meanDemand || 0));
      const mean = safeClassDemand * safeIntensity * weights[i][d];
      const rawCount = config.distribution === 'poisson'
        ? samplePoisson(mean, rng)
        : sampleNormal(mean, rng);
      const count = Math.min(MAX_DAILY_CUSTOMERS_PER_CLASS, rawCount);

      for (let c = 0; c < count; c++) {
        nextId++;
        // WTP phân phối quanh giá cơ sở (từ 0.7p đến 1.6p)
        const wtpFactor = 0.7 + 0.9 * rng();
        dayCustomers.push({
          id: nextId,
          classIndex: i,
          classId: cls.id,
          className: cls.name,
          basePrice: cls.price,
          wtp: Math.round(cls.price * wtpFactor),
          arrivalDay: d + 1
        });
      }
    }

    // Xáo trộn ngẫu nhiên thứ tự khách đến trong ngày
    for (let k = dayCustomers.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [dayCustomers[k], dayCustomers[j]] = [dayCustomers[j], dayCustomers[k]];
    }

    schedule.push(dayCustomers);
  }

  return schedule;
}

/** Làm tròn tiền đến 10.000 đ */
const round10k = (val: number) => Math.round(val / 10000) * 10000;

/**
 * Mô phỏng 1 ngày cho 1 chiến lược cụ thể
 */
function simulateDayForPolicy(
  policy: 'A' | 'B' | 'C',
  config: HotelConfig,
  day: number,
  previousRecord: HotelDayRecord | undefined,
  customersToday: HotelCustomer[],
  sortedClasses: CustomFareClass[]
): HotelDayRecord {
  const safeCapacity = Math.min(MAX_SAFE_CAPACITY, Math.max(0, config.capacity || 0));
  let remaining = previousRecord ? previousRecord.remainingRooms : safeCapacity;
  let cumulativeSold = previousRecord ? previousRecord.cumulativeSold : 0;
  let cumulativeRevenue = previousRecord ? previousRecord.cumulativeRevenue : 0;
  let dailyRevenue = 0;

  // 1. Tính hệ số giá và bảng giá hôm nay
  let priceMultiplier = 1;
  if (policy === 'C' && safeCapacity > 0) {
    const rawMultiplier = 1 + config.k * (cumulativeSold / safeCapacity - (day - 1) / 30);
    priceMultiplier = Math.max(config.min, Math.min(config.max, rawMultiplier));
  }

  const pricesByClass: Record<string, number> = {};
  sortedClasses.forEach(c => {
    pricesByClass[c.id] = policy === 'C' ? round10k(c.price * priceMultiplier) : c.price;
  });

  // 2. Tính ngưỡng bảo vệ EMSR-b hôm nay
  const protectionByClass: Record<string, number> = {};
  const bookingLimitsByClass: Record<string, number> = {};

  if (policy === 'A') {
    // FCFS: không bảo vệ (mọi hạng bảo vệ = 0, booking limit = capacity)
    sortedClasses.forEach(c => {
      protectionByClass[c.id] = 0;
      bookingLimitsByClass[c.id] = safeCapacity;
    });
  } else {
    // EMSR-b (B và C): tính toán ngưỡng bảo vệ theo EMSR-b
    const classesForEmsr = sortedClasses.map(c => ({
      ...c,
      price: pricesByClass[c.id],
      meanDemand: Math.min(MAX_SAFE_CLASS_DEMAND, Math.max(0, c.meanDemand || 0))
    }));
    const emsr = calculateEmsrN(remaining, classesForEmsr, config.distribution);
    sortedClasses.forEach(c => {
      protectionByClass[c.id] = emsr.protectionLevels[c.id] ?? 0;
      bookingLimitsByClass[c.id] = emsr.bookingLimits[c.id] ?? remaining;
    });
  }

  // 3. Xử lý từng khách đến trong ngày
  const transactions: HotelTransaction[] = [];
  const arrivalsByClass: Record<string, number> = {};
  const acceptedByClass: Record<string, number> = {};
  sortedClasses.forEach(c => {
    arrivalsByClass[c.id] = 0;
    acceptedByClass[c.id] = 0;
  });

  let acceptedCount = 0;
  let rejectedPriceCount = 0;
  let rejectedProtectedCount = 0;
  let rejectedFullCount = 0;

  for (const cust of customersToday) {
    arrivalsByClass[cust.classId] = (arrivalsByClass[cust.classId] || 0) + 1;
    const offeredPrice = pricesByClass[cust.classId];
    const protection = protectionByClass[cust.classId] ?? 0;
    const roomsBefore = remaining;

    let outcome: HotelOutcome = 'accepted';

    if (cust.wtp < offeredPrice) {
      outcome = 'price';
      rejectedPriceCount++;
    } else if (remaining <= 0) {
      outcome = 'full';
      rejectedFullCount++;
    } else if (policy !== 'A' && remaining <= protection) {
      outcome = 'protected';
      rejectedProtectedCount++;
    } else {
      outcome = 'accepted';
      acceptedCount++;
      acceptedByClass[cust.classId] = (acceptedByClass[cust.classId] || 0) + 1;
      remaining--;
      cumulativeSold++;
      dailyRevenue += offeredPrice;
      cumulativeRevenue += offeredPrice;
    }

    if (transactions.length < MAX_STORED_TRANSACTIONS_PER_DAY) {
      transactions.push({
        id: cust.id,
        classIndex: cust.classIndex,
        classId: cust.classId,
        className: cust.className,
        wtp: cust.wtp,
        arrivalDay: day,
        offeredPrice,
        outcome,
        roomsBefore,
        protectionThreshold: protection,
        revenue: outcome === 'accepted' ? offeredPrice : 0
      });
    }
  }

  return {
    day,
    potentialCustomers: customersToday.length,
    arrivalsByClass,
    acceptedByClass,
    acceptedCount,
    rejectedPriceCount,
    rejectedProtectedCount,
    rejectedFullCount,
    dailyRevenue,
    cumulativeRevenue,
    cumulativeSold,
    remainingRooms: remaining,
    pricesByClass,
    protectionByClass,
    bookingLimitsByClass,
    priceMultiplier,
    transactions
  };
}

/** Khởi tạo trạng thái mô phỏng ban đầu */
export function initialHotelState(): HotelSimulationState {
  return {
    day: 0,
    histories: { A: [], B: [], C: [] }
  };
}

/** Tiến 1 bước ngày trong mô phỏng */
export function stepHotelSimulation(
  config: HotelConfig,
  state: HotelSimulationState,
  allCustomers: HotelCustomer[][]
): HotelSimulationState {
  if (state.day >= 30) return state;
  const nextDay = state.day + 1;
  const customersToday = allCustomers[nextDay - 1] ?? [];
  const sortedClasses = [...config.fareClasses].sort((a, b) => a.price - b.price);

  return {
    day: nextDay,
    histories: {
      A: [...state.histories.A, simulateDayForPolicy('A', config, nextDay, state.histories.A.at(-1), customersToday, sortedClasses)],
      B: [...state.histories.B, simulateDayForPolicy('B', config, nextDay, state.histories.B.at(-1), customersToday, sortedClasses)],
      C: [...state.histories.C, simulateDayForPolicy('C', config, nextDay, state.histories.C.at(-1), customersToday, sortedClasses)]
    }
  };
}

/** Chạy toàn bộ 30 ngày */
export function runHotelSimulationFull(
  config: HotelConfig,
  allCustomers?: HotelCustomer[][]
): HotelSimulationState {
  const customers = allCustomers || generateHotelCustomers(config);
  let state = initialHotelState();
  while (state.day < 30) {
    state = stepHotelSimulation(config, state, customers);
  }
  return state;
}

/** Chạy kiểm định Monte Carlo đa kịch bản ghép cặp */
export function evaluateHotelMonteCarlo(
  baseConfig: HotelConfig,
  runsCount: number = 100
): MonteCarloBatchResult {
  const runs: MonteCarloRunResult[] = [];
  const startSeed = baseConfig.seed;

  for (let i = 0; i < runsCount; i++) {
    const seed = (startSeed + i) % 4294967096;
    const runConfig = { ...baseConfig, seed };
    const state = runHotelSimulationFull(runConfig);
    const day30A = state.histories.A[29];
    const day30B = state.histories.B[29];
    const day30C = state.histories.C[29];

    runs.push({
      seed,
      revenue: {
        A: day30A?.cumulativeRevenue ?? 0,
        B: day30B?.cumulativeRevenue ?? 0,
        C: day30C?.cumulativeRevenue ?? 0
      },
      sold: {
        A: day30A?.cumulativeSold ?? 0,
        B: day30B?.cumulativeSold ?? 0,
        C: day30C?.cumulativeSold ?? 0
      }
    });
  }

  const calcStats = (vals: number[]) => {
    const n = vals.length;
    if (!n) return { mean: 0, median: 0, sd: 0, min: 0, max: 0, ciLow: 0, ciHigh: 0 };
    const sorted = [...vals].sort((a, b) => a - b);
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
    const variance = vals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / Math.max(1, n - 1);
    const sd = Math.sqrt(variance);
    const se = sd / Math.sqrt(n);
    return {
      mean,
      median,
      sd,
      min: sorted[0],
      max: sorted[n - 1],
      ciLow: mean - 1.96 * se,
      ciHigh: mean + 1.96 * se
    };
  };

  const policies: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C'];
  const rows: MonteCarloSummaryRow[] = policies.map(p => {
    const revs = runs.map(r => r.revenue[p]);
    const solds = runs.map(r => r.sold[p]);
    const stat = calcStats(revs);
    const avgSold = solds.reduce((a, b) => a + b, 0) / runsCount;
    const wins = runs.filter(r => {
      const maxRev = Math.max(r.revenue.A, r.revenue.B, r.revenue.C);
      return r.revenue[p] === maxRev;
    }).length;

    return {
      policy: p,
      mean: stat.mean,
      median: stat.median,
      sd: stat.sd,
      min: stat.min,
      max: stat.max,
      ci95Low: stat.ciLow,
      ci95High: stat.ciHigh,
      occupancy: (avgSold / baseConfig.capacity) * 100,
      winRate: (wins / runsCount) * 100
    };
  });

  const pairConfigs: Array<{ label: string; p1: 'B' | 'C'; p2: 'A' | 'B' }> = [
    { label: 'B vs A (EMSR-b vs FCFS)', p1: 'B', p2: 'A' },
    { label: 'C vs A (Dynamic vs FCFS)', p1: 'C', p2: 'A' },
    { label: 'C vs B (Dynamic vs EMSR-b)', p1: 'C', p2: 'B' }
  ];

  const pairs: MonteCarloPairRow[] = pairConfigs.map(cfg => {
    const diffs = runs.map(r => r.revenue[cfg.p1] - r.revenue[cfg.p2]);
    const stat = calcStats(diffs);
    const wins = diffs.filter(d => d > 0).length;
    const ties = diffs.filter(d => d === 0).length;
    return {
      label: cfg.label,
      mean: stat.mean,
      median: stat.median,
      sd: stat.sd,
      min: stat.min,
      max: stat.max,
      ci95Low: stat.ciLow,
      ci95High: stat.ciHigh,
      winRate: (wins / runsCount) * 100,
      tieRate: (ties / runsCount) * 100
    };
  });

  return {
    n: runsCount,
    start: startSeed,
    end: (startSeed + runsCount - 1) % 4294967096,
    rows,
    pairs,
    runs
  };
}

/** Xuất CSV kết quả mô phỏng */
export function exportHotelSimulationCsv(config: HotelConfig, state: HotelSimulationState): string {
  const sortedClasses = [...config.fareClasses].sort((a, b) => a.price - b.price);
  const header = [
    'policy',
    'day',
    'price_multiplier',
    ...sortedClasses.map(c => `price_${c.id}`),
    ...sortedClasses.map(c => `protection_${c.id}`),
    ...sortedClasses.map(c => `booking_limit_${c.id}`),
    ...sortedClasses.map(c => `arrived_${c.id}`),
    ...sortedClasses.map(c => `accepted_${c.id}`),
    'daily_accepted',
    'rejected_price',
    'rejected_protected',
    'rejected_full',
    'daily_revenue',
    'cumulative_revenue',
    'cumulative_sold',
    'remaining_rooms',
    'occupancy_pct',
    'adr',
    'revpar'
  ].join(',');

  const rows: string[] = [header];
  const policies: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C'];

  for (const p of policies) {
    for (const d of state.histories[p]) {
      const occ = (d.cumulativeSold / config.capacity) * 100;
      const adr = d.cumulativeSold > 0 ? d.cumulativeRevenue / d.cumulativeSold : 0;
      const revpar = d.cumulativeRevenue / config.capacity;

      const row = [
        p,
        d.day,
        d.priceMultiplier.toFixed(3),
        ...sortedClasses.map(c => d.pricesByClass[c.id] ?? c.price),
        ...sortedClasses.map(c => d.protectionByClass[c.id] ?? 0),
        ...sortedClasses.map(c => d.bookingLimitsByClass[c.id] ?? 0),
        ...sortedClasses.map(c => d.arrivalsByClass[c.id] ?? 0),
        ...sortedClasses.map(c => d.acceptedByClass[c.id] ?? 0),
        d.acceptedCount,
        d.rejectedPriceCount,
        d.rejectedProtectedCount,
        d.rejectedFullCount,
        d.dailyRevenue,
        d.cumulativeRevenue,
        d.cumulativeSold,
        d.remainingRooms,
        occ.toFixed(2),
        Math.round(adr),
        Math.round(revpar)
      ].join(',');
      rows.push(row);
    }
  }

  return rows.join('\r\n');
}

/** Xuất CSV kết quả Monte Carlo */
export function exportHotelMonteCarloCsv(batch: MonteCarloBatchResult): string {
  const header = 'seed,rev_a,rev_b,rev_c,sold_a,sold_b,sold_c,diff_b_minus_a,diff_c_minus_a,diff_c_minus_b';
  const rows = [header];
  for (const r of batch.runs) {
    rows.push([
      r.seed,
      r.revenue.A,
      r.revenue.B,
      r.revenue.C,
      r.sold.A,
      r.sold.B,
      r.sold.C,
      r.revenue.B - r.revenue.A,
      r.revenue.C - r.revenue.A,
      r.revenue.C - r.revenue.B
    ].join(','));
  }
  return rows.join('\r\n');
}
