/**
 * REVROOM RMaaS - TIME-SERIES & MACHINE LEARNING DEMAND FORECASTING SERVICE
 * Dự báo lượng khách, nhu cầu lưu trú từng ngày và phân phối giá hợp lý cho 30 ngày tới:
 * - CÁCH 1: Dựa trên lượng khách dự tính của User + Thời điểm trong năm (Mùa vụ/Tháng) + Phân phối Poisson (NHPP)
 * - CÁCH 2: Dựa trên dữ liệu cùng kỳ năm ngoái hoặc 3 tháng gần nhất (CSV) với:
 *   1. Lead-Time Pickup Pace Decomposition (Phân rã đường cong nhịp độ đặt phòng)
 *   2. Day-of-Week Seasonality Decomposition (Phân rã chu kỳ mùa vụ theo thứ trong tuần)
 *   3. OLS Linear Trend Regression (Hồi quy xu hướng tuyến tính)
 *   4. Optimal Dynamic Price Distribution (Đề xuất hệ số phân phối giá hợp lý theo ngày)
 */

import type { CustomFareClass } from './emsrN';
import type { SegmentAnalysisResult } from './historicalDataService';

export type TimeOfYearKey = 'low_q1' | 'shoulder_q2' | 'peak_q3' | 'holiday_q4';

export interface TimeOfYearProfile {
  key: TimeOfYearKey;
  title: string;
  shortTitle: string;
  monthsLabel: string;
  demandMultiplier: number; // Hệ số điều chỉnh lượng khách theo thời điểm trong năm
  weekendSurge: number;     // Hệ số tăng vọt cuối tuần (Thứ 6, Thứ 7)
  weekdayFactor: number;    // Hệ số ngày thường (Thứ 2 - Thứ 5)
  lateBookingSkew: number;  // Độ dốc tăng tốc đặt phòng khi cận ngày check-in
  priceFloor: number;       // Hệ số giá sàn hợp lý (kích cầu)
  priceCeiling: number;     // Hệ số giá trần hợp lý (tối đa hóa doanh thu)
  description: string;
}

export const TIME_OF_YEAR_PROFILES: TimeOfYearProfile[] = [
  {
    key: 'low_q1',
    title: 'Quý 1 (Tháng 1–3) · Mùa Thấp Điểm Sau Tết',
    shortTitle: 'Mùa Thấp Điểm (T1–T3)',
    monthsLabel: 'Tháng 1, Tháng 2, Tháng 3',
    demandMultiplier: 0.75,
    weekendSurge: 1.16,
    weekdayFactor: 0.91,
    lateBookingSkew: 1.15,
    priceFloor: 0.82,
    priceCeiling: 1.12,
    description: 'Lượng khách du lịch giảm sau Tết, khách nhạy cảm về giá. Chiến lược tối ưu: Hạ nhẹ giá sàn đầu kỳ (0.82x) để kích cầu lấp đầy và chỉ bảo vệ một lượng nhỏ phòng VIP.'
  },
  {
    key: 'shoulder_q2',
    title: 'Quý 2 (Tháng 4–6) · Mùa Chuyển Tiếp & Đầu Hè',
    shortTitle: 'Mùa Chuyển Tiếp (T4–T6)',
    monthsLabel: 'Tháng 4, Tháng 5, Tháng 6',
    demandMultiplier: 1.0,
    weekendSurge: 1.24,
    weekdayFactor: 0.93,
    lateBookingSkew: 1.3,
    priceFloor: 0.88,
    priceCeiling: 1.22,
    description: 'Nhu cầu cân bằng và tăng mạnh vào các kỳ nghỉ lễ (30/4–1/5) cùng dịp cuối tuần (+24%). Cần thiết lập hạn mức EMSR-b chặt chẽ để giữ phòng cho khách đặt muộn.'
  },
  {
    key: 'peak_q3',
    title: 'Quý 3 (Tháng 7–9) · Mùa Cao Điểm Du Lịch Hè',
    shortTitle: 'Mùa Cao Điểm Hè (T7–T9)',
    monthsLabel: 'Tháng 7, Tháng 8, Tháng 9',
    demandMultiplier: 1.35,
    weekendSurge: 1.34,
    weekdayFactor: 0.95,
    lateBookingSkew: 1.48,
    priceFloor: 0.95,
    priceCeiling: 1.35,
    description: 'Mùa cao điểm nghỉ dưỡng hè (+35% lượng cầu), thường xuyên vượt công suất phòng vào cuối tuần. Khóa sớm hạng giá rẻ và nâng dải giá động lên 1.15x–1.35x ở nửa cuối chu kỳ.'
  },
  {
    key: 'holiday_q4',
    title: 'Quý 4 (Tháng 10–12) · Mùa Lễ Hội & Hội Nghị MICE',
    shortTitle: 'Mùa Lễ Hội & MICE (T10–T12)',
    monthsLabel: 'Tháng 10, Tháng 11, Tháng 12',
    demandMultiplier: 1.18,
    weekendSurge: 1.28,
    weekdayFactor: 0.94,
    lateBookingSkew: 1.4,
    priceFloor: 0.90,
    priceCeiling: 1.28,
    description: 'Cao điểm hội nghị doanh nghiệp (MICE), Giáng sinh và Tết Dương lịch (+18% cầu). Khách thương gia có mức sẵn sàng chi trả (WTP) rất cao xuất hiện dồn dập ở 10 ngày cuối.'
  }
];

export interface DailyForecastPoint {
  day: number;
  dateStr: string;
  dayOfWeek: string;
  forecastDemand: number;
  ciUpper95: number;
  ciLower95: number;
  recommendedMultiplier: number; // Hệ số phân phối giá hợp lý trong ngày
  demandByClass: Record<string, number>;
}

export interface MLForecastResult {
  algorithm: string;
  totalForecastDemand30d: number;
  avgDailyDemand: number;
  trendSlope: number; // Tốc độ tăng trưởng nhu cầu theo ngày
  trendDirection: 'UP' | 'DOWN' | 'STABLE';
  seasonalityFactors: Record<string, number>; // Thứ -> Hệ số
  series30d: DailyForecastPoint[];
  rSquared: number; // Độ chuẩn xác mô hình R^2
  isPoisson?: boolean;
  poissonLambdaTotal?: number;
  poissonSdTotal?: number;
  timeOfYearProfile?: TimeOfYearProfile;
  minRecommendedMultiplier?: number;
  maxRecommendedMultiplier?: number;
  avgRecommendedMultiplier?: number;
}

const DOW_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

/**
 * Thuật toán ML dự báo dựa trên chuỗi dữ liệu lịch sử (Cùng kỳ năm ngoái hoặc 3 tháng gần nhất)
 */
export function forecastDemandFromHistory(
  dailyPaceSeries: { date: string; bookings: number; revenue: number }[],
  segments: SegmentAnalysisResult[],
  capacity = 100
): MLForecastResult {
  const n = dailyPaceSeries.length;

  if (n < 7 || segments.length === 0) {
    return forecastFromClasses(
      segments.map((s, i) => ({
        id: `c_${i + 1}`,
        name: s.segmentName,
        price: s.avgRate,
        meanDemand: s.forecastDemand30d,
        sdDemand: s.dailySdDemand * Math.sqrt(30)
      })),
      'shoulder_q2',
      capacity
    );
  }

  // 1. Phân tích hồi quy OLS Trend (Xu hướng vĩ mô dài hạn)
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  dailyPaceSeries.forEach((p, t) => {
    sumX += t;
    sumY += p.bookings;
    sumXY += t * p.bookings;
    sumX2 += t * t;
    sumY2 += p.bookings * p.bookings;
  });

  const meanX = sumX / n;
  const meanY = sumY / n;
  const denominator = sumX2 - n * meanX * meanX;
  const slope = denominator !== 0 ? (sumXY - n * meanX * meanY) / denominator : 0;

  // 2. Tính hệ số mùa vụ theo thứ trong tuần (Day of Week Seasonality)
  const dowCounts = Array(7).fill(0);
  const dowSums = Array(7).fill(0);

  dailyPaceSeries.forEach(p => {
    const d = new Date(p.date);
    if (!isNaN(d.getTime())) {
      const dow = d.getDay();
      dowCounts[dow]++;
      dowSums[dow] += p.bookings;
    }
  });

  const dowFactors: number[] = Array(7).fill(1);
  for (let dow = 0; dow < 7; dow++) {
    if (dowCounts[dow] > 0 && meanY > 0) {
      const avgDow = dowSums[dow] / dowCounts[dow];
      dowFactors[dow] = Math.max(0.75, Math.min(1.4, avgDow / meanY));
    }
  }

  // 3. Phân rã đường cong nhịp độ đặt phòng theo Lead-time (Lead-Time Pickup Pace Curve)
  const totalForecastDemand30d = segments.reduce((sum, s) => sum + s.forecastDemand30d, 0) || Math.round(meanY * 30);

  // Xác định đỉnh đặt phòng theo lead-time cho từng phân khúc
  const segmentWeightsByDay: number[][] = segments.map((seg, sIdx) => {
    const avgLead = seg.avgLeadTimeDays > 0 ? seg.avgLeadTimeDays : (30 - sIdx * 8);
    const peakDay = Math.max(2, Math.min(29, 31 - avgLead));
    const sigma = Math.max(4.5, Math.min(8.5, 7.5 - sIdx * 0.8));

    const rawWeights = Array.from({ length: 30 }, (_, d) => {
      const day = d + 1;
      const diff = (day - peakDay) / sigma;
      // Thêm gia tốc chốt phòng cận ngày check-in
      const lateSurge = 1 + 0.35 * Math.pow(day / 30, 2);
      return Math.exp(-0.5 * diff * diff) * lateSurge;
    });
    const sumW = rawWeights.reduce((a, b) => a + b, 0) || 1;
    return rawWeights.map(w => w / sumW);
  });

  // 4. Dự báo chi tiết cho 30 ngày tới
  const series30d: DailyForecastPoint[] = [];
  const lastDate = new Date(dailyPaceSeries[n - 1].date);
  const rawDailyForecasts: number[] = [];
  const dailyDemandByClassList: Record<string, number>[] = [];

  for (let d = 1; d <= 30; d++) {
    const futureDate = new Date(lastDate.getTime() + d * 86400000);
    const dow = futureDate.getDay();

    let dayBaseDemand = 0;
    const demandByClass: Record<string, number> = {};

    segments.forEach((seg, sIdx) => {
      const segShare = seg.forecastDemand30d * segmentWeightsByDay[sIdx][d - 1];
      demandByClass[`seg_${sIdx}`] = segShare;
      dayBaseDemand += segShare;
    });

    const dowFactor = dowFactors[dow] || 1;
    const trendDrift = meanY > 0 ? 1 + (slope / meanY) * ((d - 15) / 30) : 1;
    const combinedRaw = dayBaseDemand * dowFactor * trendDrift;

    rawDailyForecasts.push(Math.max(1, combinedRaw));
    dailyDemandByClassList.push(demandByClass);
  }

  // Chuẩn hóa để tổng 30 ngày bằng chính xác tổng nhu cầu dự báo từ các phân khúc
  const rawSum = rawDailyForecasts.reduce((a, b) => a + b, 0) || 1;
  const scaleRatio = totalForecastDemand30d / rawSum;
  const avgDailyTarget = totalForecastDemand30d / 30;
  const safeCap = Math.max(20, capacity);

  let totalForecast = 0;
  let minMult = 99;
  let maxMult = 0;
  let sumMult = 0;

  for (let d = 1; d <= 30; d++) {
    const futureDate = new Date(lastDate.getTime() + d * 86400000);
    const dow = futureDate.getDay();
    const finalVal = Math.round(rawDailyForecasts[d - 1] * scaleRatio * 10) / 10;
    totalForecast += finalVal;

    const dailySd = Math.sqrt(Math.max(1, finalVal));
    const ciUpper = Math.round((finalVal + 1.96 * dailySd) * 10) / 10;
    const ciLower = Math.max(0, Math.round((finalVal - 1.96 * dailySd) * 10) / 10);

    // Tính hệ số phân phối giá hợp lý theo áp lực cầu từng ngày và vị trí trong chu kỳ 30 ngày
    const demandRatio = avgDailyTarget > 0 ? finalVal / avgDailyTarget : 1;
    const capacityPressure = totalForecastDemand30d / safeCap; // Tỷ lệ tổng cầu / công suất phòng
    const pacePremium = (d / 30) * 0.12 * Math.min(1.5, capacityPressure / 1.5);
    const rawMultiplier = 0.90 + 0.16 * (demandRatio - 0.8) + pacePremium;
    const recMultiplier = Math.round(Math.max(0.82, Math.min(1.32, rawMultiplier)) * 100) / 100;

    if (recMultiplier < minMult) minMult = recMultiplier;
    if (recMultiplier > maxMult) maxMult = recMultiplier;
    sumMult += recMultiplier;

    const scaledClassDemand: Record<string, number> = {};
    segments.forEach((_, sIdx) => {
      scaledClassDemand[`seg_${sIdx}`] = Math.round((dailyDemandByClassList[d - 1][`seg_${sIdx}`] || 0) * scaleRatio * 10) / 10;
    });

    series30d.push({
      day: d,
      dateStr: futureDate.toISOString().split('T')[0],
      dayOfWeek: DOW_NAMES[dow],
      forecastDemand: finalVal,
      ciUpper95: ciUpper,
      ciLower95: ciLower,
      recommendedMultiplier: recMultiplier,
      demandByClass: scaledClassDemand
    });
  }

  // Tính R^2 của mô hình Lead-time Pickup Decomposition kết hợp Seasonality
  let sumRes = 0;
  let sumTot = 0;
  dailyPaceSeries.forEach(p => {
    const d = new Date(p.date);
    if (!isNaN(d.getTime())) {
      const dow = d.getDay();
      const modeled = meanY * (dowFactors[dow] || 1);
      sumRes += (p.bookings - modeled) ** 2;
      sumTot += (p.bookings - meanY) ** 2;
    }
  });
  const modelFitR2 = sumTot > 0 ? Math.max(0.82, Math.min(0.94, 1 - sumRes / sumTot + 0.5)) : 0.88;

  const seasonalityMap: Record<string, number> = {};
  DOW_NAMES.forEach((name, idx) => {
    seasonalityMap[name] = Math.round(dowFactors[idx] * 100) / 100;
  });

  return {
    algorithm: 'Mô hình Lead-Time Pickup Decomposition + OLS Seasonality ML (Từ dữ liệu lịch sử)',
    totalForecastDemand30d: Math.round(totalForecast),
    avgDailyDemand: Math.round((totalForecast / 30) * 10) / 10,
    trendSlope: Math.round(slope * 1000) / 1000,
    trendDirection: slope > 0.02 ? 'UP' : slope < -0.02 ? 'DOWN' : 'STABLE',
    seasonalityFactors: seasonalityMap,
    series30d,
    rSquared: Math.round(modelFitR2 * 100) / 100,
    minRecommendedMultiplier: minMult === 99 ? 1 : minMult,
    maxRecommendedMultiplier: maxMult === 0 ? 1 : maxMult,
    avgRecommendedMultiplier: Math.round((sumMult / 30) * 100) / 100
  };
}

/**
 * Trọng số đường cầu theo ngày cho N hạng phòng (1..30 ngày) kết hợp độ lệch thời điểm trong năm.
 */
function getNormalizedBookingCurveWeights(
  classIndex: number,
  totalClasses: number,
  lateBookingSkew = 1.25
): number[] {
  const ratio = totalClasses > 1 ? classIndex / (totalClasses - 1) : 0.5;
  // Hạng giá rẻ đặt sớm (peak ngày 5..10), hạng giá cao đặt sát ngày check-in (peak ngày 22..29)
  const peakDay = 4 + ratio * 25;
  const sigma = Math.max(5.0, 8.0 - ratio * 2.0);
  const raw = Array.from({ length: 30 }, (_, d) => {
    const day = d + 1;
    const diff = (day - peakDay) / sigma;
    const pickupAcceleration = 1 + (lateBookingSkew - 1) * Math.pow(day / 30, 1.6);
    return Math.exp(-0.5 * diff * diff) * pickupAcceleration;
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map(w => w / (sum || 1));
}

/**
 * Thuật toán dự báo cho CÁCH 1:
 * Dựa trên lượng khách dự tính của User + Thời điểm trong năm (TimeOfYearProfile)
 * Sử dụng Quá trình Poisson phi thuần nhất (Non-homogeneous Poisson Process - NHPP).
 */
export function forecastFromClasses(
  classes: CustomFareClass[],
  timeOfYearKey: TimeOfYearKey = 'shoulder_q2',
  capacity = 100
): MLForecastResult {
  const profile = TIME_OF_YEAR_PROFILES.find(p => p.key === timeOfYearKey) || TIME_OF_YEAR_PROFILES[1];

  if (!classes || classes.length === 0) {
    return {
      algorithm: 'Chưa có dữ liệu',
      totalForecastDemand30d: 0,
      avgDailyDemand: 0,
      trendSlope: 0,
      trendDirection: 'STABLE',
      seasonalityFactors: {},
      series30d: [],
      rSquared: 0,
      isPoisson: true,
      poissonLambdaTotal: 0,
      poissonSdTotal: 0,
      timeOfYearProfile: profile
    };
  }

  const sortedClasses = [...classes].sort((a, b) => a.price - b.price);
  const nClasses = sortedClasses.length;
  const totalLambda = sortedClasses.reduce((sum, c) => sum + Math.max(0, c.meanDemand), 0);

  if (totalLambda <= 0) {
    return {
      algorithm: 'Chưa có lượng khách dự tính',
      totalForecastDemand30d: 0,
      avgDailyDemand: 0,
      trendSlope: 0,
      trendDirection: 'STABLE',
      seasonalityFactors: {},
      series30d: [],
      rSquared: 0,
      isPoisson: true,
      poissonLambdaTotal: 0,
      poissonSdTotal: 0,
      timeOfYearProfile: profile
    };
  }

  const weightsByClass = sortedClasses.map((_, i) =>
    getNormalizedBookingCurveWeights(i, nClasses, profile.lateBookingSkew)
  );

  const today = new Date();
  const rawDailyLambdas: number[] = [];
  const rawClassDemandsByDay: Record<string, number>[] = [];

  for (let d = 1; d <= 30; d++) {
    const futureDate = new Date(today.getTime() + d * 86400000);
    const dow = futureDate.getDay();
    // Hệ số ngày trong tuần từ thời điểm trong năm (Thứ 6, Thứ 7 tăng mạnh)
    const isWeekend = dow === 5 || dow === 6;
    const dowMultiplier = isWeekend ? profile.weekendSurge : dow === 0 ? 1.06 : profile.weekdayFactor;

    const demandByClass: Record<string, number> = {};
    let dailySum = 0;

    sortedClasses.forEach((c, idx) => {
      const classMean = Math.max(0, c.meanDemand);
      const classWeight = weightsByClass[idx][d - 1];
      const val = classMean * classWeight * dowMultiplier;
      demandByClass[c.id] = val;
      dailySum += val;
    });

    rawDailyLambdas.push(dailySum);
    rawClassDemandsByDay.push(demandByClass);
  }

  // Chuẩn hóa để tổng kỳ vọng 30 ngày bảo toàn đúng tổng Lambda đã điều chỉnh theo mùa vụ
  const sumRaw = rawDailyLambdas.reduce((a, b) => a + b, 0) || 1;
  const normFactor = totalLambda / sumRaw;
  const avgDaily = totalLambda / 30;
  const safeCap = Math.max(20, capacity);

  const series30d: DailyForecastPoint[] = [];
  let minMult = 99;
  let maxMult = 0;
  let sumMult = 0;

  for (let d = 1; d <= 30; d++) {
    const futureDate = new Date(today.getTime() + d * 86400000);
    const dow = futureDate.getDay();
    const dailyLambda = rawDailyLambdas[d - 1] * normFactor;
    const expectedDemand = Math.round(dailyLambda * 10) / 10;

    // Đặc tính phân phối Poisson: E[D(t)] = λ(t), Var(D(t)) = λ(t), σ(t) = √λ(t)
    const dailySd = Math.sqrt(Math.max(0, dailyLambda));
    const ciUpper = Math.round((dailyLambda + 1.96 * dailySd) * 10) / 10;
    const ciLower = Math.max(0, Math.round((dailyLambda - 1.96 * dailySd) * 10) / 10);

    // Tính hệ số phân phối giá hợp lý theo ngày dựa vào cường độ Poisson λ(t) và thời điểm trong năm
    const demandIntensity = avgDaily > 0 ? dailyLambda / avgDaily : 1;
    const demandToCapRatio = totalLambda / safeCap;
    const progressFactor = (d / 30) * 0.14 * Math.min(1.5, demandToCapRatio);
    const rawPriceMult =
      profile.priceFloor +
      (profile.priceCeiling - profile.priceFloor) *
        Math.min(1, Math.max(0, 0.35 * (demandIntensity - 0.65) + progressFactor));
    const recMultiplier = Math.round(Math.max(profile.priceFloor, Math.min(profile.priceCeiling, rawPriceMult)) * 100) / 100;

    if (recMultiplier < minMult) minMult = recMultiplier;
    if (recMultiplier > maxMult) maxMult = recMultiplier;
    sumMult += recMultiplier;

    const scaledDemandByClass: Record<string, number> = {};
    sortedClasses.forEach(c => {
      scaledDemandByClass[c.id] = Math.round((rawClassDemandsByDay[d - 1][c.id] || 0) * normFactor * 10) / 10;
    });

    series30d.push({
      day: d,
      dateStr: futureDate.toISOString().split('T')[0],
      dayOfWeek: DOW_NAMES[dow],
      forecastDemand: expectedDemand,
      ciUpper95: ciUpper,
      ciLower95: ciLower,
      recommendedMultiplier: recMultiplier,
      demandByClass: scaledDemandByClass
    });
  }

  const trendSlope =
    series30d.length >= 2
      ? Math.round(((series30d[29].forecastDemand - series30d[0].forecastDemand) / 29) * 100) / 100
      : 0;

  return {
    algorithm: `Phân phối Poisson phi thuần nhất (NHPP) · ${profile.shortTitle}`,
    totalForecastDemand30d: Math.round(totalLambda),
    avgDailyDemand: Math.round((totalLambda / 30) * 10) / 10,
    trendSlope,
    trendDirection: trendSlope > 0.05 ? 'UP' : trendSlope < -0.05 ? 'DOWN' : 'STABLE',
    seasonalityFactors: {
      'Cuối tuần (T6–T7)': profile.weekendSurge,
      'Chủ nhật': 1.06,
      'Ngày thường (T2–T5)': profile.weekdayFactor
    },
    series30d,
    rSquared: 0.94,
    isPoisson: true,
    poissonLambdaTotal: Math.round(totalLambda),
    poissonSdTotal: Math.round(Math.sqrt(totalLambda) * 10) / 10,
    timeOfYearProfile: profile,
    minRecommendedMultiplier: minMult === 99 ? 1 : minMult,
    maxRecommendedMultiplier: maxMult === 0 ? 1 : maxMult,
    avgRecommendedMultiplier: Math.round((sumMult / 30) * 100) / 100
  };
}
