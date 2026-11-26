import { poisson, random, weights, type SegmentIndex } from './shared/customerGenerator';
import { SEGMENTS, type DemandProfile, type SegmentValues } from './types';

export const DAYS = 30;
const SEGMENT_INDEXES: SegmentIndex[] = [0, 1, 2];
const MS_PER_DAY = 86_400_000;
export const DAY_FACTORS = {
  'Ngày thường': [1, 1, 1],
  'Cuối tuần': [1.2, 1, 1],
  'Ngày lễ': [1.3, 1.1, 1],
  'Sự kiện': [1, 1, 1],
} satisfies Record<string, SegmentValues>;

export type DayKind = keyof typeof DAY_FACTORS;
export type DaySettings = { kind: DayKind; name: string; factors: SegmentValues };
export type DayOverrides = Partial<Record<string, DaySettings>>;
export type CalendarDay = DaySettings & { date: string };
type HistoricalDay = CalendarDay & { counts: SegmentValues[] };
export type History = { start: string; seed: number; days: HistoricalDay[]; total: number };

function bySegment(callback: (index: SegmentIndex) => number): SegmentValues {
  return [callback(0), callback(1), callback(2)];
}

export function localDate(date = new Date()): string {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(value => String(value).padStart(2, '0')).join('-');
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function calendarDays(start: string, overrides: DayOverrides = {}): CalendarDay[] {
  return Array.from({ length: DAYS }, (_, index) => {
    const date = addDays(start, index);
    const weekday = new Date(date).getUTCDay();
    const kind = weekday === 0 || weekday === 6 ? 'Cuối tuần' : 'Ngày thường';
    const settings = overrides[date] ?? { kind, name: '', factors: DAY_FACTORS[kind] };
    return { date, ...settings };
  });
}

function defaultDailyMeans(demands: SegmentValues): SegmentValues[] {
  const bookingWeights = SEGMENT_INDEXES.map(weights);
  return Array.from({ length: DAYS }, (_, day) => bySegment(index => demands[index] * bookingWeights[index][day]));
}

export function generateHistory(start: string, seed: number, demands: SegmentValues, overrides: DayOverrides = {}): History {
  const rng = random(seed);
  const base = defaultDailyMeans(demands);
  let total = 0;
  const days = calendarDays(start, overrides).map(stay => {
    const counts = base.map(day => bySegment(index => {
      const count = poisson(day[index] * stay.factors[index], rng);
      total += count;
      return count;
    }));
    return { ...stay, counts };
  });
  return { start, seed, days, total };
}

export function historicalCsv(history: History): string {
  const rows = ['ma_luot_hoi,ngay_hoi,ngay_luu_tru,phan_khuc,loai_ngay,ten_dip,he_so_nhu_cau'];
  // Prefix cells that spreadsheets can interpret as formulas.
  const quote = (value: string) => {
    const safe = /^[\s]*[=+\-@]/.test(value) ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  let id = 0;
  for (const stay of history.days) {
    const kind = quote(stay.kind);
    const name = quote(stay.name);
    stay.counts.forEach((counts, day) => {
      const requestDate = addDays(stay.date, day - DAYS);
      for (const index of SEGMENT_INDEXES) {
        const suffix = [requestDate, stay.date, SEGMENTS[index], kind, name, stay.factors[index]].join(',');
        for (let i = 0; i < counts[index]; i += 1) rows.push(`R${++id},${suffix}`);
      }
    });
  }
  return '\uFEFF' + rows.join('\r\n');
}

/** Estimate the baseline from the same counts exported as CSV. Include complete windows with zero requests. */
function historicalDailyMeans(history: History): SegmentValues[] {
  const bucketSize = 10;
  const buckets = [0, 1, 2].map(bucket => bySegment(index => {
    let requests = 0;
    for (const stay of history.days) {
      for (let day = bucket * bucketSize; day < (bucket + 1) * bucketSize; day += 1) {
        requests += stay.counts[day][index] / stay.factors[index];
      }
    }
    return requests / (history.days.length * bucketSize);
  }));
  return Array.from({ length: DAYS }, (_, day) => buckets[Math.floor(day / bucketSize)]);
}

export function buildDemandProfile(demands: SegmentValues, history?: History, calendar?: CalendarDay[]): DemandProfile | undefined {
  if (!history && !calendar) return undefined;
  const baseline = history ? historicalDailyMeans(history) : defaultDailyMeans(demands);
  const dailyMeans = baseline.map((day, i) => calendar ? bySegment(index => day[index] * calendar[i].factors[index]) : day);
  return { dailyMeans, historyStart: history?.start, calendarStart: calendar?.[0].date, calendarFactors: calendar?.map(day => day.factors) };
}

export function updateDefaultBaseline(demands: SegmentValues, profile?: DemandProfile): DemandProfile | undefined {
  if (!profile || profile.historyStart || !profile.calendarFactors) return profile;
  const factors = profile.calendarFactors;
  const dailyMeans = defaultDailyMeans(demands).map((means, day) => bySegment(index => means[index] * factors[day][index]));
  return { ...profile, dailyMeans };
}

export function demandSourceLabel(profile?: DemandProfile): string {
  if (profile?.historyStart && profile.calendarStart) return 'Lịch sử + lịch sắp tới';
  if (profile?.historyStart) return 'Dữ liệu 30 ngày trước';
  if (profile?.calendarStart) return 'Lịch 30 ngày tiếp theo';
  return 'Mặc định';
}
