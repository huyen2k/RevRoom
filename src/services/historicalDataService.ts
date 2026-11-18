/**
 * REVROOM RMaaS - DỊCH VỤ XỬ LÝ DỮ LIỆU LỊCH SỬ THUÊ PHÒNG & DỰ BÁO NHU CẦU
 * Hỗ trợ tải lên file CSV lịch sử đặt phòng các tháng trước, tự động tính toán:
 * - Nhu cầu kỳ vọng (μ) & Độ lệch chuẩn (σ) cho từng phân khúc
 * - Tỷ lệ hủy phòng & No-show
 * - Giá bình quân thực thu (ADR)
 * - Tốc độ đặt phòng (Booking Pace & Lead Time)
 */

export interface HistoricalBookingRecord {
  bookingId: string;
  bookingDate: string;
  stayDate: string;
  segmentName: string;
  ratePaid: number;
  status: 'CHECKED_IN' | 'CANCELLED' | 'NO_SHOW';
  leadTimeDays: number;
}

export interface SegmentAnalysisResult {
  segmentName: string;
  totalBookings: number;
  checkedInCount: number;
  cancelledCount: number;
  cancellationRate: number; // Tỷ lệ hủy (%)
  avgRate: number;          // Giá bình quân thực thu (VNĐ)
  dailyMeanDemand: number;  // Nhu cầu kỳ vọng theo ngày (μ)
  dailySdDemand: number;    // Độ lệch chuẩn theo ngày (σ)
  forecastDemand30d: number;// Nhu cầu dự báo cho chu kỳ 30 ngày tới
  avgLeadTimeDays: number;  // Thời gian đặt trước trung bình (ngày)
}

export interface HistoricalDatasetSummary {
  totalRecords: number;
  validRecords: number;
  dateRange: { start: string; end: string };
  overallCancellationRate: number;
  overallAdr: number;
  avgLeadTime: number;
  segments: SegmentAnalysisResult[];
  dailyPaceSeries: { date: string; bookings: number; revenue: number }[];
}

/**
 * Trình phân tích file CSV lịch sử đặt phòng
 */
export function parseHistoricalBookingCsv(fileContent: string): HistoricalDatasetSummary {
  const lines = fileContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('File CSV không hợp lệ hoặc không có dữ liệu.');
  }

  // Tách dòng header
  const headerLine = lines[0];
  const delimiter = headerLine.includes(';') ? ';' : headerLine.includes('\t') ? '\t' : ',';
  const headers = headerLine.split(delimiter).map(h => h.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/"/g, ''));

  // Tìm vị trí các cột
  const colIndex = {
    bookingId: headers.findIndex(h => h.includes('id') || h.includes('ma')),
    bookingDate: headers.findIndex(h => h.includes('booking_date') || h.includes('ngay_dat')),
    stayDate: headers.findIndex(h => h.includes('stay_date') || h.includes('checkin') || h.includes('ngay_den') || (h.includes('date') && !h.includes('booking'))),
    segment: headers.findIndex(h => h.includes('segment') || h.includes('phan_khuc') || h.includes('hang') || h.includes('type')),
    rate: headers.findIndex(h => h.includes('rate') || h.includes('price') || h.includes('gia') || h.includes('revenue')),
    status: headers.findIndex(h => h.includes('status') || h.includes('trang_thai'))
  };

  const records: HistoricalBookingRecord[] = [];
  const segmentStayMap: Record<string, Record<string, number>> = {};
  const segmentRatesMap: Record<string, number[]> = {};
  const segmentStatusMap: Record<string, { checkedIn: number; cancelled: number }> = {};
  const segmentLeadTimesMap: Record<string, number[]> = {};
  const dailyPaceMap: Record<string, { bookings: number; revenue: number }> = {};

  let minDate = '9999-99-99';
  let maxDate = '0000-00-00';
  let totalRevenueAll = 0;
  let totalCheckedInAll = 0;
  let totalLeadTimeAll = 0;

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    // Tách dòng có xử lý dấu ngoặc kép
    const parts = splitCsvLine(rawLine, delimiter);
    if (parts.length < 2) continue;

    const bookingId = colIndex.bookingId >= 0 ? parts[colIndex.bookingId] : `BK_${i}`;
    const bookingDate = colIndex.bookingDate >= 0 ? parts[colIndex.bookingDate] : '';
    const stayDate = colIndex.stayDate >= 0 ? parts[colIndex.stayDate] : (colIndex.bookingDate >= 0 ? parts[colIndex.bookingDate] : '');
    const segmentName = (colIndex.segment >= 0 && parts[colIndex.segment]) ? parts[colIndex.segment].trim() : 'Tiêu Chuẩn';
    const ratePaid = colIndex.rate >= 0 ? Math.max(0, parseFloat(parts[colIndex.rate].replace(/[^0-9.-]/g, '')) || 0) : 600000;
    const rawStatus = (colIndex.status >= 0 && parts[colIndex.status]) ? parts[colIndex.status].trim().toUpperCase() : 'CHECKED_IN';

    if (!stayDate) continue;

    if (stayDate < minDate) minDate = stayDate;
    if (stayDate > maxDate) maxDate = stayDate;

    // Phân loại trạng thái
    const isCancelled = rawStatus.includes('CANCEL') || rawStatus.includes('HUY') || rawStatus.includes('NO_SHOW');
    const status: 'CHECKED_IN' | 'CANCELLED' | 'NO_SHOW' = rawStatus.includes('NO_SHOW') ? 'NO_SHOW' : isCancelled ? 'CANCELLED' : 'CHECKED_IN';

    // Tính lead time (số ngày đặt trước)
    let leadTime = 7;
    if (bookingDate && stayDate) {
      try {
        const dBook = new Date(bookingDate).getTime();
        const dStay = new Date(stayDate).getTime();
        if (!isNaN(dBook) && !isNaN(dStay)) {
          leadTime = Math.max(0, Math.round((dStay - dBook) / (1000 * 3600 * 24)));
        }
      } catch {}
    }

    records.push({
      bookingId,
      bookingDate,
      stayDate,
      segmentName,
      ratePaid,
      status,
      leadTimeDays: leadTime
    });

    // Gom nhóm
    if (!segmentStayMap[segmentName]) {
      segmentStayMap[segmentName] = {};
      segmentRatesMap[segmentName] = [];
      segmentStatusMap[segmentName] = { checkedIn: 0, cancelled: 0 };
      segmentLeadTimesMap[segmentName] = [];
    }

    if (!isCancelled) {
      segmentStayMap[segmentName][stayDate] = (segmentStayMap[segmentName][stayDate] || 0) + 1;
      segmentRatesMap[segmentName].push(ratePaid);
      totalRevenueAll += ratePaid;
      totalCheckedInAll++;
    }

    if (isCancelled) {
      segmentStatusMap[segmentName].cancelled++;
    } else {
      segmentStatusMap[segmentName].checkedIn++;
    }

    segmentLeadTimesMap[segmentName].push(leadTime);
    totalLeadTimeAll += leadTime;

    // Daily pace
    if (!dailyPaceMap[stayDate]) {
      dailyPaceMap[stayDate] = { bookings: 0, revenue: 0 };
    }
    dailyPaceMap[stayDate].bookings++;
    if (!isCancelled) {
      dailyPaceMap[stayDate].revenue += ratePaid;
    }
  }

  if (records.length === 0) {
    throw new Error('Không trích xuất được bản ghi đặt phòng hợp lệ nào từ file CSV.');
  }

  // Tổng hợp thống kê theo từng phân khúc
  const segments: SegmentAnalysisResult[] = Object.keys(segmentStayMap).map(segName => {
    const datesMap = segmentStayMap[segName];
    const dailyCounts = Object.values(datesMap);
    const rates = segmentRatesMap[segName];
    const statusData = segmentStatusMap[segName];
    const leadTimes = segmentLeadTimesMap[segName];

    const totalSegBookings = statusData.checkedIn + statusData.cancelled;
    const cancellationRate = totalSegBookings > 0 ? (statusData.cancelled / totalSegBookings) * 100 : 0;
    const avgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 600000;

    // Tính mean μ và standard deviation σ nhu cầu theo ngày
    const meanD = dailyCounts.length > 0 ? dailyCounts.reduce((a, b) => a + b, 0) / dailyCounts.length : 3;
    const variance = dailyCounts.length > 1
      ? dailyCounts.reduce((acc, v) => acc + Math.pow(v - meanD, 2), 0) / (dailyCounts.length - 1)
      : Math.pow(Math.max(1, meanD * 0.3), 2);
    const sdD = Math.sqrt(variance);

    const avgLeadTime = leadTimes.length > 0 ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : 7;

    return {
      segmentName: segName,
      totalBookings: totalSegBookings,
      checkedInCount: statusData.checkedIn,
      cancelledCount: statusData.cancelled,
      cancellationRate: Math.round(cancellationRate * 10) / 10,
      avgRate: Math.round(avgRate / 10000) * 10000,
      dailyMeanDemand: Math.round(meanD * 10) / 10,
      dailySdDemand: Math.round(sdD * 10) / 10,
      forecastDemand30d: Math.round(meanD * 30),
      avgLeadTimeDays: Math.round(avgLeadTime * 10) / 10
    };
  });

  // Sắp xếp phân khúc tăng dần theo giá
  segments.sort((a, b) => a.avgRate - b.avgRate);

  const totalCancelledAll = records.filter(r => r.status !== 'CHECKED_IN').length;
  const overallCancellationRate = records.length > 0 ? (totalCancelledAll / records.length) * 100 : 0;
  const overallAdr = totalCheckedInAll > 0 ? totalRevenueAll / totalCheckedInAll : 0;
  const avgLeadTime = records.length > 0 ? totalLeadTimeAll / records.length : 7;

  // Sắp xếp chuỗi thời gian daily pace theo ngày
  const dailyPaceSeries = Object.keys(dailyPaceMap).sort().map(date => ({
    date,
    bookings: dailyPaceMap[date].bookings,
    revenue: dailyPaceMap[date].revenue
  }));

  return {
    totalRecords: records.length,
    validRecords: records.length,
    dateRange: {
      start: minDate === '9999-99-99' ? 'N/A' : minDate,
      end: maxDate === '0000-00-00' ? 'N/A' : maxDate
    },
    overallCancellationRate: Math.round(overallCancellationRate * 10) / 10,
    overallAdr: Math.round(overallAdr),
    avgLeadTime: Math.round(avgLeadTime * 10) / 10,
    segments,
    dailyPaceSeries
  };
}

/**
 * Tách từng dòng CSV chuẩn RFC 4180
 */
function splitCsvLine(text: string, delimiter: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delimiter && !inQuotes) {
      result.push(cur.trim().replace(/^"|"$/g, ''));
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim().replace(/^"|"$/g, ''));
  return result;
}

export type SeasonType = 'q1_low' | 'q2_shoulder' | 'q3_peak' | 'q4_holiday';

export interface SeasonInfo {
  key: SeasonType;
  title: string;
  quarterName: string;
  timeRange: string;
  badge: string;
  description: string;
  occupancyTarget: string;
  adrExpected: string;
  filename: string;
}

export const HOTEL_SEASONS: SeasonInfo[] = [
  {
    key: 'q1_low',
    title: 'Tháng 1 – Tháng 3: Mùa Thấp Điểm (Low Season)',
    quarterName: 'Quý 1 (Tháng 1–3)',
    timeRange: '01/01/2026 – 31/03/2026 (90 ngày)',
    badge: '🌧️ Mùa thấp điểm',
    description: 'Sau Tết, lượng khách du lịch giảm, khách sạn chủ động giảm giá để kích thích nhu cầu.',
    occupancyTarget: '45% – 55%',
    adrExpected: '650.000 – 720.000 đ',
    filename: 'sample_hotel_Q1_thang1_3_mua_thap_diem.csv'
  },
  {
    key: 'q2_shoulder',
    title: 'Tháng 4 – Tháng 6: Mùa Chuyển Tiếp (Shoulder Season)',
    quarterName: 'Quý 2 (Tháng 4–6)',
    timeRange: '01/04/2026 – 30/06/2026 (91 ngày)',
    badge: '⛅ Mùa chuyển tiếp',
    description: 'Nhu cầu phục hồi đều, cân bằng giữa khách công vụ MICE và tour nghỉ dưỡng đầu hè.',
    occupancyTarget: '68% – 76%',
    adrExpected: '820.000 – 910.000 đ',
    filename: 'sample_hotel_Q2_thang4_6_mua_chuyen_tiep.csv'
  },
  {
    key: 'q3_peak',
    title: 'Tháng 7 – Tháng 9: Mùa Cao Điểm Hè (Peak Season)',
    quarterName: 'Quý 3 (Tháng 7–9)',
    timeRange: '01/07/2026 – 30/09/2026 (92 ngày)',
    badge: '☀️ Mùa cao điểm hè',
    description: 'Bùng nổ du lịch hè, cuối tuần liên tục cháy phòng, giá tăng vọt +35% (Surge Pricing).',
    occupancyTarget: '86% – 95%',
    adrExpected: '1.200.000 – 1.380.000 đ',
    filename: 'sample_hotel_Q3_thang7_9_mua_cao_diem_he.csv'
  },
  {
    key: 'q4_holiday',
    title: 'Tháng 10 – Tháng 12: Mùa Lễ Hội & Sự Kiện (Holiday Season)',
    quarterName: 'Quý 4 (Tháng 10–12)',
    timeRange: '01/10/2026 – 31/12/2026 (92 ngày)',
    badge: '🎉 Mùa lễ hội & MICE',
    description: 'Khách quốc tế Inbound, hội nghị tổng kết cuối năm, tiệc tất niên, biến động giá mạnh.',
    occupancyTarget: '74% – 84%',
    adrExpected: '960.000 – 1.080.000 đ',
    filename: 'sample_hotel_Q4_thang10_12_mua_le_hoi.csv'
  }
];

function createSeededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Sinh file CSV 3 tháng thực tế theo mùa vụ thị trường khách sạn
 */
export function generateSeasonHotelHistoryCsv(seasonKey: SeasonType = 'q3_peak'): string {
  const headers = ['booking_id', 'booking_date', 'stay_date', 'segment_name', 'rate_paid', 'status'];
  const rows: string[] = [headers.join(',')];

  type SeasonCfg = {
    seed: number;
    startDateStr: string;
    numDays: number;
    weekendSurge: number;
    segments: Array<{
      name: string;
      basePrice: number;
      dailyMean: number;
      cancelProb: number;
      leadMin: number;
      leadMax: number;
    }>;
  };

  const configs: Record<SeasonType, SeasonCfg> = {
    q1_low: {
      seed: 1001,
      startDateStr: '2026-01-01',
      numDays: 90,
      weekendSurge: 1.15,
      segments: [
        { name: 'Ưu Đãi Sớm (Early Bird)', basePrice: 380000, dailyMean: 3.8, cancelProb: 0.20, leadMin: 15, leadMax: 40 },
        { name: 'Tiêu Chuẩn (Standard)', basePrice: 650000, dailyMean: 4.5, cancelProb: 0.15, leadMin: 6, leadMax: 22 },
        { name: 'Hạng Sang (Deluxe Garden)', basePrice: 1050000, dailyMean: 2.2, cancelProb: 0.10, leadMin: 3, leadMax: 14 },
        { name: 'Thương Gia (Suite VIP)', basePrice: 1750000, dailyMean: 1.0, cancelProb: 0.08, leadMin: 1, leadMax: 6 }
      ]
    },
    q2_shoulder: {
      seed: 2002,
      startDateStr: '2026-04-01',
      numDays: 91,
      weekendSurge: 1.22,
      segments: [
        { name: 'Ưu Đãi Sớm (Early Bird)', basePrice: 460000, dailyMean: 4.6, cancelProb: 0.14, leadMin: 18, leadMax: 45 },
        { name: 'Tiêu Chuẩn (Standard)', basePrice: 780000, dailyMean: 6.2, cancelProb: 0.10, leadMin: 7, leadMax: 25 },
        { name: 'Hạng Sang (Deluxe City)', basePrice: 1280000, dailyMean: 3.5, cancelProb: 0.08, leadMin: 4, leadMax: 16 },
        { name: 'Thương Gia (Suite VIP)', basePrice: 2150000, dailyMean: 1.8, cancelProb: 0.05, leadMin: 2, leadMax: 8 }
      ]
    },
    q3_peak: {
      seed: 3003,
      startDateStr: '2026-07-01',
      numDays: 92,
      weekendSurge: 1.38,
      segments: [
        { name: 'Ưu Đãi Sớm (Early Bird)', basePrice: 620000, dailyMean: 3.6, cancelProb: 0.07, leadMin: 20, leadMax: 50 },
        { name: 'Tiêu Chuẩn (Standard)', basePrice: 1100000, dailyMean: 9.2, cancelProb: 0.05, leadMin: 10, leadMax: 30 },
        { name: 'Hạng Sang (Deluxe Ocean View)', basePrice: 1850000, dailyMean: 5.8, cancelProb: 0.04, leadMin: 5, leadMax: 20 },
        { name: 'Thương Gia (Suite VIP Ocean)', basePrice: 2950000, dailyMean: 3.0, cancelProb: 0.03, leadMin: 2, leadMax: 10 }
      ]
    },
    q4_holiday: {
      seed: 4004,
      startDateStr: '2026-10-01',
      numDays: 92,
      weekendSurge: 1.28,
      segments: [
        { name: 'Ưu Đãi Sớm (Early Bird)', basePrice: 490000, dailyMean: 4.2, cancelProb: 0.11, leadMin: 16, leadMax: 42 },
        { name: 'Tiêu Chuẩn (Standard)', basePrice: 880000, dailyMean: 7.0, cancelProb: 0.08, leadMin: 7, leadMax: 25 },
        { name: 'Hạng Sang (Deluxe City)', basePrice: 1480000, dailyMean: 4.5, cancelProb: 0.06, leadMin: 4, leadMax: 16 },
        { name: 'Thương Gia (Suite VIP)', basePrice: 2500000, dailyMean: 2.4, cancelProb: 0.04, leadMin: 2, leadMax: 8 }
      ]
    }
  };

  const cfg = configs[seasonKey] || configs.q3_peak;
  const rng = createSeededRandom(cfg.seed);
  let idCounter = 10001;
  const startDate = new Date(cfg.startDateStr);

  for (let dayOffset = 0; dayOffset < cfg.numDays; dayOffset++) {
    const stayDateObj = new Date(startDate.getTime() + dayOffset * 86400000);
    const stayDateStr = stayDateObj.toISOString().split('T')[0];
    const dow = stayDateObj.getDay();
    // Cuối tuần (thứ 6, thứ 7) tăng mạnh nhu cầu
    const isWeekend = (dow === 5 || dow === 6);
    const dayFactor = isWeekend ? cfg.weekendSurge : (dow === 0 ? 1.05 : 0.95);

    for (const seg of cfg.segments) {
      const targetCount = seg.dailyMean * dayFactor;
      // Sinh số lượng khách ngẫu nhiên quanh targetCount
      const variance = (rng() - 0.5) * 2;
      const count = Math.max(0, Math.round(targetCount + variance));

      for (let c = 0; c < count; c++) {
        const leadDays = Math.floor(seg.leadMin + rng() * (seg.leadMax - seg.leadMin));
        const bookingDateObj = new Date(stayDateObj.getTime() - leadDays * 86400000);
        const bookingDateStr = bookingDateObj.toISOString().split('T')[0];

        // Biến động giá thực tế (cuối tuần giá nhích lên 5-10%)
        const weekendPriceBoost = isWeekend ? 1.08 : 1.0;
        const randomNoise = 0.94 + rng() * 0.12;
        const finalRate = Math.round((seg.basePrice * weekendPriceBoost * randomNoise) / 10000) * 10000;

        // Trạng thái hủy/No-show
        const isCancel = rng() < seg.cancelProb;
        const status = isCancel ? (rng() < 0.25 ? 'NO_SHOW' : 'CANCELLED') : 'CHECKED_IN';

        rows.push([
          `BK_${idCounter++}`,
          bookingDateStr,
          stayDateStr,
          `"${seg.name}"`,
          finalRate,
          status
        ].join(','));
      }
    }
  }

  return rows.join('\n');
}

/**
 * Tạo tập dữ liệu CSV lịch sử mẫu (tương thích ngược mặc định)
 */
export function generateSampleHotelHistoryCsv(): string {
  return generateSeasonHotelHistoryCsv('q3_peak');
}
