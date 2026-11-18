/**
 * REVROOM RMaaS - THUẬT TOÁN EMSR-b MỞ RỘNG CHO N PHÂN KHÚC TÙY BIẾN
 * Hỗ trợ khách sạn tự do thêm, bớt, chỉnh sửa các loại giá / hạng phòng.
 * Triển khai thuật toán Peter Belobaba (MIT) cho mảng N lớp giá.
 */

import type { Distribution } from '../model/types';
import { demandQuantile } from '../model/strategy-b/emsrB';

export interface CustomFareClass {
  id: string;
  name: string;
  price: number;
  meanDemand: number;
  sdDemand?: number;
}

export interface EmsrNStep {
  classIndex: number;
  className: string;
  price: number;
  higherClasses: string[];
  aggregatedMean: number;
  weightedFare: number;
  criticalFractile: number;
  protectionLevel: number;
  bookingLimit: number;
}

export interface EmsrNResult {
  classes: CustomFareClass[];
  capacity: number;
  steps: EmsrNStep[];
  protectionLevels: Record<string, number>; // classId -> Protection Level
  bookingLimits: Record<string, number>;    // classId -> Booking Limit
  totalExpectedRevenue: number;
}

/**
 * Tính toán mức bảo vệ và hạn mức mở bán EMSR-b cho N hạng phòng bất kỳ
 */
export function calculateEmsrN(
  capacity: number,
  classesInput: CustomFareClass[],
  distribution: Distribution = 'poisson'
): EmsrNResult {
  if (!classesInput || classesInput.length === 0 || capacity <= 0) {
    return {
      classes: [],
      capacity,
      steps: [],
      protectionLevels: {},
      bookingLimits: {},
      totalExpectedRevenue: 0
    };
  }

  // 1. Sắp xếp các lớp giá tăng dần theo giá: p_1 < p_2 < ... < p_n
  const sortedClasses = [...classesInput].sort((a, b) => a.price - b.price);
  const n = sortedClasses.length;

  if (n === 1) {
    const single = sortedClasses[0];
    return {
      classes: sortedClasses,
      capacity,
      steps: [],
      protectionLevels: { [single.id]: 0 },
      bookingLimits: { [single.id]: capacity },
      totalExpectedRevenue: single.price * Math.min(capacity, single.meanDemand)
    };
  }

  const rawSteps: EmsrNStep[] = [];

  // 2. Tính mức bảo vệ cho từng lớp giá thấp i từ 0 đến n - 2
  for (let i = 0; i < n - 1; i++) {
    const currentClass = sortedClasses[i];
    const higherClasses = sortedClasses.slice(i + 1);

    // Nhu cầu gộp kỳ vọng của tất cả các lớp cao hơn
    const aggregatedMean = higherClasses.reduce((sum, c) => sum + Math.max(0, c.meanDemand), 0);

    // Giá bình quân gia quyền theo nhu cầu: sum(p_j * mu_j) / sum(mu_j)
    const totalWeightedFare = higherClasses.reduce((sum, c) => sum + c.price * Math.max(0, c.meanDemand), 0);
    const weightedFare = aggregatedMean > 0 ? totalWeightedFare / aggregatedMean : currentClass.price;

    // Phân vị tới hạn (Critical Fractile): 1 - p_i / p_bar
    let criticalFractile = 0;
    if (weightedFare > currentClass.price) {
      criticalFractile = Math.max(0, Math.min(1, 1 - currentClass.price / weightedFare));
    }

    // Mức bảo vệ thô: F^-1(Aggregated Demand, CR)
    let protectionLevel = 0;
    if (criticalFractile > 0 && aggregatedMean > 0) {
      protectionLevel = demandQuantile(aggregatedMean, criticalFractile, capacity, distribution);
    }

    rawSteps.push({
      classIndex: i,
      className: currentClass.name,
      price: currentClass.price,
      higherClasses: higherClasses.map(c => c.name),
      aggregatedMean: Math.round(aggregatedMean * 10) / 10,
      weightedFare: Math.round(weightedFare),
      criticalFractile: Math.round(criticalFractile * 1000) / 1000,
      protectionLevel: Math.min(capacity, protectionLevel),
      bookingLimit: 0
    });
  }

  // 3. Áp dụng tính chất lồng ghép (Nested Protection Levels): y_1 >= y_2 >= ... >= y_{n-1} >= 0
  let currentMax = 0;
  for (let i = rawSteps.length - 1; i >= 0; i--) {
    currentMax = Math.max(currentMax, rawSteps[i].protectionLevel);
    rawSteps[i].protectionLevel = Math.min(capacity, currentMax);
  }
  for (let i = 1; i < rawSteps.length; i++) {
    if (rawSteps[i].protectionLevel > rawSteps[i - 1].protectionLevel) {
      rawSteps[i].protectionLevel = rawSteps[i - 1].protectionLevel;
    }
  }

  // 4. Tính hạn mức mở bán (Booking Limits)
  const protectionLevels: Record<string, number> = {};
  const bookingLimits: Record<string, number> = {};

  for (let i = 0; i < rawSteps.length; i++) {
    const step = rawSteps[i];
    step.bookingLimit = Math.max(0, capacity - step.protectionLevel);
    protectionLevels[sortedClasses[i].id] = step.protectionLevel;
    bookingLimits[sortedClasses[i].id] = step.bookingLimit;
  }

  // Lớp cao nhất (n - 1) mở bán toàn bộ số phòng
  const topClass = sortedClasses[n - 1];
  protectionLevels[topClass.id] = 0;
  bookingLimits[topClass.id] = capacity;

  // 5. Ước tính doanh thu kỳ vọng (bán từ lớp cao nhất trước)
  let remainingCap = capacity;
  let totalExpectedRevenue = 0;
  for (let i = n - 1; i >= 0; i--) {
    const c = sortedClasses[i];
    const sold = Math.min(remainingCap, Math.max(0, c.meanDemand));
    totalExpectedRevenue += sold * c.price;
    remainingCap -= sold;
    if (remainingCap <= 0) break;
  }

  return {
    classes: sortedClasses,
    capacity,
    steps: rawSteps,
    protectionLevels,
    bookingLimits,
    totalExpectedRevenue
  };
}
