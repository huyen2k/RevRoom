import React, { useState, useMemo, useEffect } from 'react';
import {
  Building2,
  Plus,
  Trash2,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  Download,
  ArrowRight,
  Sparkles,
  FileSpreadsheet,
  Edit3,
  ChevronDown,
  ChevronUp,
  BrainCircuit,
  BarChart2,
  AlertTriangle,
  RotateCcw,
  Calendar,
  FlaskConical,
  Play,
  Users
} from 'lucide-react';
import {
  ResponsiveContainer,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Area,
  ComposedChart
} from 'recharts';
import type { Distribution } from './model/types';
import { calculateEmsrN, type CustomFareClass, type EmsrNResult } from './services/emsrN';
import {
  type HotelConfig,
  generateHotelCustomers,
  runHotelSimulationFull
} from './services/hotelSimulationService';
import HistoricalDataView from './HistoricalDataView';
import {
  forecastDemandFromHistory,
  forecastFromClasses,
  TIME_OF_YEAR_PROFILES,
  type TimeOfYearKey,
  type MLForecastResult
} from './services/demandForecastML';
import type { HistoricalDatasetSummary } from './services/historicalDataService';

const MONEY = (n: number) => Math.round(n).toLocaleString('vi-VN') + ' đ';
const NUM = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });

interface PricingServiceProps {
  hotelConfig: HotelConfig;
  onUpdateHotelConfig: (newCfg: HotelConfig) => void;
  onNavigateToSimulation?: () => void;
  onNavigateToMonteCarlo?: () => void;
}

export default function PricingServiceView({
  hotelConfig,
  onUpdateHotelConfig,
  onNavigateToSimulation,
  onNavigateToMonteCarlo
}: PricingServiceProps) {
  const [hotelName, setHotelName] = useState(hotelConfig.hotelName || '');
  const [capacity, setCapacity] = useState(hotelConfig.capacity || 0);
  const [roomsSold, setRoomsSold] = useState(0);
  const [daysRemaining, setDaysRemaining] = useState(15);

  const [fareClasses, setFareClasses] = useState<Array<{ id: string; name: string; price: number }>>(() => {
    if (hotelConfig.fareClasses && hotelConfig.fareClasses.length > 0) {
      return hotelConfig.fareClasses.map(c => ({ id: c.id, name: c.name, price: c.price }));
    }
    return [];
  });

  const initialHasDemand = hotelConfig.fareClasses?.some(c => (c.meanDemand ?? 0) > 0) ?? false;
  const [isOpenMethod1, setIsOpenMethod1] = useState(initialHasDemand && hotelConfig.distribution === 'poisson');
  const [isOpenMethod2, setIsOpenMethod2] = useState(false);

  const [selectedTimeOfYear, setSelectedTimeOfYear] = useState<TimeOfYearKey>('shoulder_q2');
  const currentTimeProfile = useMemo(
    () => TIME_OF_YEAR_PROFILES.find(p => p.key === selectedTimeOfYear) || TIME_OF_YEAR_PROFILES[1],
    [selectedTimeOfYear]
  );

  const [baseUserDemands, setBaseUserDemands] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    if (hotelConfig.fareClasses && hotelConfig.fareClasses.length > 0) {
      hotelConfig.fareClasses.forEach((c, idx) => {
        map[c.id] = c.meanDemand > 0 ? c.meanDemand : [75, 45, 25, 15][idx % 4] || 30;
      });
    }
    return map;
  });

  const totalBaseUserDemand = useMemo(() => {
    return fareClasses.reduce((sum, c) => sum + (baseUserDemands[c.id] ?? 40), 0);
  }, [fareClasses, baseUserDemands]);

  const [historyDemands, setHistoryDemands] = useState<Record<string, number>>({});
  const [uploadedHistorySummary, setUploadedHistorySummary] = useState<HistoricalDatasetSummary | null>(null);

  useEffect(() => {
    if (hotelConfig && hotelConfig.capacity > 0 && hotelConfig.fareClasses.length > 0) {
      const currentIds = fareClasses.map(c => c.id).join(',');
      const incomingIds = hotelConfig.fareClasses.map(c => c.id).join(',');
      if (currentIds !== incomingIds) {
        setHotelName(hotelConfig.hotelName || '');
        setCapacity(Math.min(5000, Math.max(0, hotelConfig.capacity || 0)));
        setFareClasses(hotelConfig.fareClasses.map(c => ({ id: c.id, name: c.name, price: c.price })));
      }
    }
  }, [hotelConfig]);

  const activeFareClasses: CustomFareClass[] = useMemo(() => {
    return fareClasses.map(fc => {
      let demand = 0;
      if (isOpenMethod1) {
        const userEst = Math.min(5000, Math.max(0, baseUserDemands[fc.id] ?? 40));
        demand = Math.min(5000, Math.round(userEst * currentTimeProfile.demandMultiplier));
      } else if (isOpenMethod2) {
        demand = Math.min(5000, Math.max(0, historyDemands[fc.id] ?? 0));
      } else {
        demand = 0;
      }
      return {
        id: fc.id,
        name: fc.name,
        price: Math.min(500000000, Math.max(0, fc.price || 0)),
        meanDemand: demand,
        sdDemand: Math.sqrt(demand)
      };
    });
  }, [fareClasses, isOpenMethod1, isOpenMethod2, baseUserDemands, currentTimeProfile, historyDemands]);

  const totalActiveDemand = useMemo(() => {
    if (!isOpenMethod1 && !isOpenMethod2) return 0;
    return activeFareClasses.reduce((sum, c) => sum + c.meanDemand, 0);
  }, [activeFareClasses, isOpenMethod1, isOpenMethod2]);

  const triggerSync = (
    name: string,
    cap: number,
    classes: CustomFareClass[],
    dist: Distribution = 'poisson',
    minMult = hotelConfig.min,
    maxMult = hotelConfig.max
  ) => {
    const sorted = [...classes].sort((a, b) => a.price - b.price);
    onUpdateHotelConfig({
      ...hotelConfig,
      hotelName: name,
      capacity: cap,
      fareClasses: sorted,
      distribution: dist,
      min: minMult,
      max: maxMult
    });
  };

  const currentDay = Math.max(1, Math.min(30, 31 - daysRemaining));

  const actualOccupancyRate = useMemo(() => {
    if (capacity <= 0) return 0;
    return (roomsSold / capacity) * 100;
  }, [roomsSold, capacity]);

  const paceMultiplier = useMemo(() => {
    if (capacity <= 0) return 1;
    const rawMultiplier = 1 + hotelConfig.k * (roomsSold / capacity - (currentDay - 1) / 30);
    return Math.max(hotelConfig.min, Math.min(hotelConfig.max, rawMultiplier));
  }, [hotelConfig.k, roomsSold, capacity, currentDay, hotelConfig.min, hotelConfig.max]);

  const mlForecast: MLForecastResult = useMemo(() => {
    if (!isOpenMethod1 && !isOpenMethod2) {
      return {
        algorithm: 'Chưa kích hoạt',
        totalForecastDemand30d: 0,
        avgDailyDemand: 0,
        trendSlope: 0,
        trendDirection: 'STABLE',
        seasonalityFactors: {},
        series30d: [],
        rSquared: 0,
        isPoisson: true,
        poissonLambdaTotal: 0,
        poissonSdTotal: 0
      };
    }

    if (isOpenMethod2 && uploadedHistorySummary && uploadedHistorySummary.dailyPaceSeries.length > 0) {
      return forecastDemandFromHistory(
        uploadedHistorySummary.dailyPaceSeries,
        uploadedHistorySummary.segments,
        capacity || 100
      );
    }

    return forecastFromClasses(activeFareClasses, selectedTimeOfYear, capacity || 100);
  }, [isOpenMethod1, isOpenMethod2, uploadedHistorySummary, activeFareClasses, selectedTimeOfYear, capacity]);

  const recommendedFareClasses = useMemo(() => {
    const minM = mlForecast.minRecommendedMultiplier ?? 0.85;
    const maxM = mlForecast.maxRecommendedMultiplier ?? 1.25;
    const avgM = mlForecast.avgRecommendedMultiplier ?? paceMultiplier;
    const effectiveMult = Math.round(((paceMultiplier + avgM) / 2) * 100) / 100;

    return activeFareClasses
      .map(fc => {
        const scaledPrice = fc.price * effectiveMult;
        const roundedPrice = Math.round(scaledPrice / 10000) * 10000;
        const minOptimalPrice = Math.round((fc.price * minM) / 10000) * 10000;
        const maxOptimalPrice = Math.round((fc.price * maxM) / 10000) * 10000;
        return {
          ...fc,
          recommendedPrice: roundedPrice,
          minOptimalPrice,
          maxOptimalPrice,
          priceDiff: roundedPrice - fc.price,
          percentDiff: fc.price > 0 ? ((roundedPrice - fc.price) / fc.price) * 100 : 0
        };
      })
      .sort((a, b) => a.recommendedPrice - b.recommendedPrice);
  }, [activeFareClasses, paceMultiplier, mlForecast]);

  const emsrResult: EmsrNResult = useMemo(() => {
    if (capacity <= 0 || recommendedFareClasses.length === 0 || totalActiveDemand === 0) {
      return {
        classes: [],
        capacity: 0,
        steps: [],
        protectionLevels: {},
        bookingLimits: {},
        totalExpectedRevenue: 0
      };
    }
    const classesForEmsr: CustomFareClass[] = recommendedFareClasses.map(fc => ({
      id: fc.id,
      name: fc.name,
      price: fc.recommendedPrice,
      meanDemand: fc.meanDemand
    }));
    const remainingRooms = Math.max(0, capacity - roomsSold);
    return calculateEmsrN(remainingRooms, classesForEmsr, hotelConfig.distribution);
  }, [recommendedFareClasses, capacity, roomsSold, totalActiveDemand, hotelConfig.distribution]);

  const strategyComparisonPreview = useMemo(() => {
    if (capacity <= 0 || activeFareClasses.length === 0 || totalActiveDemand <= 0) {
      return null;
    }
    const simCfg: HotelConfig = {
      ...hotelConfig,
      hotelName: hotelName || 'Khách sạn đối tác',
      capacity,
      fareClasses: [...activeFareClasses].sort((a, b) => a.price - b.price),
      min: mlForecast.minRecommendedMultiplier ?? 0.85,
      max: mlForecast.maxRecommendedMultiplier ?? 1.25
    };
    const customers = generateHotelCustomers(simCfg);
    const fullState = runHotelSimulationFull(simCfg, customers);
    const day30A = fullState.histories.A[29];
    const day30B = fullState.histories.B[29];
    const day30C = fullState.histories.C[29];

    if (!day30A || !day30B || !day30C) return null;

    const revA = day30A.cumulativeRevenue;
    const revB = day30B.cumulativeRevenue;
    const revC = day30C.cumulativeRevenue;

    return {
      A: {
        revenue: revA,
        sold: day30A.cumulativeSold,
        occ: (day30A.cumulativeSold / capacity) * 100,
        adr: day30A.cumulativeSold > 0 ? revA / day30A.cumulativeSold : 0,
        revpar: revA / capacity
      },
      B: {
        revenue: revB,
        sold: day30B.cumulativeSold,
        occ: (day30B.cumulativeSold / capacity) * 100,
        adr: day30B.cumulativeSold > 0 ? revB / day30B.cumulativeSold : 0,
        revpar: revB / capacity,
        gainVsA: revB - revA,
        gainPctVsA: revA > 0 ? ((revB - revA) / revA) * 100 : 0
      },
      C: {
        revenue: revC,
        sold: day30C.cumulativeSold,
        occ: (day30C.cumulativeSold / capacity) * 100,
        adr: day30C.cumulativeSold > 0 ? revC / day30C.cumulativeSold : 0,
        revpar: revC / capacity,
        gainVsA: revC - revA,
        gainPctVsA: revA > 0 ? ((revC - revA) / revA) * 100 : 0,
        gainVsB: revC - revB,
        gainPctVsB: revB > 0 ? ((revC - revB) / revB) * 100 : 0
      }
    };
  }, [
    capacity,
    activeFareClasses,
    totalActiveDemand,
    hotelConfig.seed,
    hotelConfig.k,
    hotelConfig.distribution,
    mlForecast.minRecommendedMultiplier,
    mlForecast.maxRecommendedMultiplier
  ]);

  const buildActiveList = (
    classesList: Array<{ id: string; name: string; price: number }>,
    open1: boolean,
    open2: boolean,
    userDemandsMap: Record<string, number>,
    histDemandsMap: Record<string, number>,
    seasonMult: number
  ): CustomFareClass[] => {
    return classesList.map(c => {
      const rawDemand = open1
        ? Math.round((userDemandsMap[c.id] ?? 40) * seasonMult)
        : open2
        ? (histDemandsMap[c.id] ?? 0)
        : 0;
      const demand = Math.min(5000, Math.max(0, rawDemand));
      return {
        ...c,
        price: Math.min(500000000, Math.max(0, c.price || 0)),
        meanDemand: demand,
        sdDemand: Math.sqrt(demand)
      };
    });
  };

  const handleHotelNameChange = (val: string) => {
    setHotelName(val);
    triggerSync(val, capacity, activeFareClasses, 'poisson');
  };

  const handleCapacityChange = (val: number) => {
    const c = Math.min(5000, Math.max(0, Math.round(val || 0)));
    setCapacity(c);
    if (roomsSold > c) setRoomsSold(c);
    triggerSync(hotelName, c, activeFareClasses, 'poisson');
  };

  const handleAddFareClass = () => {
    const newIdx = fareClasses.length + 1;
    const highestPrice = fareClasses.reduce((max, c) => Math.max(max, c.price), 300000);
    const newId = `class_${Date.now()}`;
    const newClass = {
      id: newId,
      name: `Hạng Phòng #${newIdx}`,
      price: highestPrice + 300000
    };
    const updated = [...fareClasses, newClass];
    const updatedUserMap = { ...baseUserDemands, [newId]: 35 };
    const updatedHistMap = { ...historyDemands, [newId]: 35 };

    setFareClasses(updated);
    setBaseUserDemands(updatedUserMap);
    setHistoryDemands(updatedHistMap);

    const updatedActive = buildActiveList(
      updated,
      isOpenMethod1,
      isOpenMethod2,
      updatedUserMap,
      updatedHistMap,
      currentTimeProfile.demandMultiplier
    );
    triggerSync(hotelName, capacity, updatedActive, 'poisson');
  };

  const handleRemoveFareClass = (id: string) => {
    const updated = fareClasses.filter(c => c.id !== id);
    setFareClasses(updated);
    const updatedActive = buildActiveList(
      updated,
      isOpenMethod1,
      isOpenMethod2,
      baseUserDemands,
      historyDemands,
      currentTimeProfile.demandMultiplier
    );
    triggerSync(hotelName, capacity, updatedActive, 'poisson');
  };

  const handleUpdateFareClass = (id: string, field: 'name' | 'price', val: string | number) => {
    const updated = fareClasses.map(c => (c.id === id ? { ...c, [field]: val } : c));
    setFareClasses(updated);
    const updatedActive = buildActiveList(
      updated,
      isOpenMethod1,
      isOpenMethod2,
      baseUserDemands,
      historyDemands,
      currentTimeProfile.demandMultiplier
    );
    triggerSync(hotelName, capacity, updatedActive, 'poisson');
  };

  const handleLoadStandardHotelTemplate = () => {
    const standardName = 'Khách sạn Biển Sunrise Boutique';
    const standardCap = 100;
    const standardClasses = [
      { id: 'c1', name: 'Tiêu Chuẩn (Standard)', price: 600000 },
      { id: 'c2', name: 'Cao Cấp (Deluxe Ocean)', price: 1100000 },
      { id: 'c3', name: 'Thương Gia (Suite VIP)', price: 1800000 }
    ];
    const newBaseMap: Record<string, number> = { c1: 75, c2: 45, c3: 25 };

    setHotelName(standardName);
    setCapacity(standardCap);
    setFareClasses(standardClasses);
    setBaseUserDemands(newBaseMap);

    const active = buildActiveList(
      standardClasses,
      isOpenMethod1,
      isOpenMethod2,
      newBaseMap,
      historyDemands,
      currentTimeProfile.demandMultiplier
    );
    triggerSync(standardName, standardCap, active, 'poisson');
  };

  const handleClearAll = () => {
    setHotelName('');
    setCapacity(0);
    setRoomsSold(0);
    setFareClasses([]);
    setIsOpenMethod1(false);
    setIsOpenMethod2(false);
    setUploadedHistorySummary(null);
    triggerSync('', 0, [], 'poisson');
  };

  const handleToggleMethod1 = () => {
    if (!isOpenMethod1) {
      setIsOpenMethod1(true);
      setIsOpenMethod2(false);
      setUploadedHistorySummary(null);

      const newBaseMap = { ...baseUserDemands };
      fareClasses.forEach((c, idx) => {
        if (newBaseMap[c.id] === undefined) {
          newBaseMap[c.id] = [75, 45, 25, 15][idx % 4] || 30;
        }
      });
      setBaseUserDemands(newBaseMap);

      const active = buildActiveList(
        fareClasses,
        true,
        false,
        newBaseMap,
        historyDemands,
        currentTimeProfile.demandMultiplier
      );
      triggerSync(
        hotelName,
        capacity,
        active,
        'poisson',
        currentTimeProfile.priceFloor,
        currentTimeProfile.priceCeiling
      );
    } else {
      setIsOpenMethod1(false);
      const active = fareClasses.map(c => ({ ...c, meanDemand: 0, sdDemand: 0 }));
      triggerSync(hotelName, capacity, active, 'poisson');
    }
  };

  const handleSelectTimeOfYear = (key: TimeOfYearKey) => {
    setSelectedTimeOfYear(key);
    const prof = TIME_OF_YEAR_PROFILES.find(p => p.key === key) || TIME_OF_YEAR_PROFILES[1];
    if (isOpenMethod1) {
      const active = buildActiveList(
        fareClasses,
        true,
        false,
        baseUserDemands,
        historyDemands,
        prof.demandMultiplier
      );
      triggerSync(hotelName, capacity, active, 'poisson', prof.priceFloor, prof.priceCeiling);
    }
  };

  const handleUpdateUserBaseDemand = (classId: string, val: number) => {
    const cleanVal = Math.min(5000, Math.max(0, Math.round(val || 0)));
    const updatedMap = { ...baseUserDemands, [classId]: cleanVal };
    setBaseUserDemands(updatedMap);

    if (isOpenMethod1) {
      const active = buildActiveList(
        fareClasses,
        true,
        false,
        updatedMap,
        historyDemands,
        currentTimeProfile.demandMultiplier
      );
      triggerSync(
        hotelName,
        capacity,
        active,
        'poisson',
        currentTimeProfile.priceFloor,
        currentTimeProfile.priceCeiling
      );
    }
  };

  const handleUpdateTotalEstimatedCustomers = (totalVal: number) => {
    if (fareClasses.length === 0) return;
    const cleanTotal = Math.min(15000, Math.max(0, Math.round(totalVal || 0)));
    const currentSum = fareClasses.reduce((s, c) => s + (baseUserDemands[c.id] ?? 40), 0);
    const updatedMap: Record<string, number> = {};

    fareClasses.forEach((c, idx) => {
      if (currentSum > 0) {
        const share = (baseUserDemands[c.id] ?? 40) / currentSum;
        updatedMap[c.id] = Math.min(5000, Math.round(cleanTotal * share));
      } else {
        const defaultWeights = fareClasses.map((_, i) => Math.pow(0.65, i));
        const wSum = defaultWeights.reduce((a, b) => a + b, 0) || 1;
        updatedMap[c.id] = Math.min(5000, Math.round((cleanTotal * defaultWeights[idx]) / wSum));
      }
    });

    setBaseUserDemands(updatedMap);
    if (isOpenMethod1) {
      const active = buildActiveList(
        fareClasses,
        true,
        false,
        updatedMap,
        historyDemands,
        currentTimeProfile.demandMultiplier
      );
      triggerSync(
        hotelName,
        capacity,
        active,
        'poisson',
        currentTimeProfile.priceFloor,
        currentTimeProfile.priceCeiling
      );
    }
  };

  const handleToggleMethod2 = () => {
    if (!isOpenMethod2) {
      setIsOpenMethod2(true);
      setIsOpenMethod1(false);

      if (uploadedHistorySummary) {
        const active = fareClasses.map(c => ({
          ...c,
          meanDemand: historyDemands[c.id] ?? 0,
          sdDemand: Math.sqrt(historyDemands[c.id] ?? 0)
        }));
        triggerSync(hotelName, capacity, active, 'poisson');
      } else {
        const active = fareClasses.map(c => ({ ...c, meanDemand: 0, sdDemand: 0 }));
        triggerSync(hotelName, capacity, active, 'poisson');
      }
    } else {
      setIsOpenMethod2(false);
      const active = fareClasses.map(c => ({ ...c, meanDemand: 0, sdDemand: 0 }));
      triggerSync(hotelName, capacity, active, 'poisson');
    }
  };

  const handleApplyFromHistory = (extractedClasses: CustomFareClass[], summary?: HistoricalDatasetSummary) => {
    if (summary) {
      setUploadedHistorySummary(summary);
    }

    let targetClasses = fareClasses;
    if (targetClasses.length === 0) {
      targetClasses = extractedClasses.map(c => ({ id: c.id, name: c.name, price: c.price }));
      setFareClasses(targetClasses);
      if (capacity === 0) setCapacity(100);
    }

    const newHistoryMap: Record<string, number> = {};
    targetClasses.forEach((c, idx) => {
      const segMatch = summary?.segments[idx % (summary.segments.length || 1)];
      newHistoryMap[c.id] = segMatch ? segMatch.forecastDemand30d : (extractedClasses[idx]?.meanDemand || 40);
    });
    setHistoryDemands(newHistoryMap);

    setIsOpenMethod2(true);
    setIsOpenMethod1(false);

    const active = targetClasses.map(c => ({
      ...c,
      meanDemand: newHistoryMap[c.id] || 0,
      sdDemand: Math.sqrt(newHistoryMap[c.id] || 0)
    }));
    triggerSync(hotelName || 'Khách sạn Biển Sunrise', capacity || 100, active, 'poisson');
  };

  const handleExportConsultation = () => {
    if (capacity <= 0 || fareClasses.length === 0) return;

    const lines = [
      `REVROOM RMaaS — BÁO CÁO ĐỊNH GIÁ & TỐI ĐA HÓA DOANH THU`,
      `=============================================================`,
      `Khách sạn   : ${hotelName || 'Khách sạn'}`,
      `Quy mô      : ${capacity} phòng | Đã bán: ${roomsSold} phòng (${NUM(actualOccupancyRate)}%)`,
      `Dự báo 30d  : ${mlForecast.totalForecastDemand30d} phòng`,
      `Dải hệ số   : x${(mlForecast.minRecommendedMultiplier ?? 0.85).toFixed(2)} - x${(mlForecast.maxRecommendedMultiplier ?? 1.25).toFixed(2)}`,
      ``,
      `--- BẢNG PHÂN PHỐI GIÁ & HẠN MỨC MỞ BÁN ---`,
      ...recommendedFareClasses.map((fc, i) => {
        const bl = emsrResult.bookingLimits[fc.id] ?? 0;
        const pl = emsrResult.protectionLevels[fc.id] ?? 0;
        return `${i + 1}. ${fc.name.padEnd(26)}: Giá gốc ${MONEY(fc.price)} | Đề xuất ${MONEY(fc.recommendedPrice)} | Mở bán: ${bl}p (Bảo vệ: ${pl}p)`;
      })
    ].join('\n');

    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RevRoom_BaoCaoDinhGia_${(hotelName || 'Hotel').replace(/\s+/g, '_')}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const hasConfig = capacity > 0 && fareClasses.length > 0;
  const hasDemand = (isOpenMethod1 || isOpenMethod2) && totalActiveDemand > 0;

  return (
    <div className="pricing-service-container">
      {/* 1. THIẾT LẬP KHÁCH SẠN & HẠNG PHÒNG */}
      <section className="panel" style={{ marginBottom: 16, borderTop: '3px solid #007f72' }}>
        <div className="section-heading" style={{ margin: '0 0 12px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#007f72', margin: 0, fontSize: 14 }}>
            <Building2 size={17} /> 1. Thông Tin Khách Sạn & Hạng Phòng
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleLoadStandardHotelTemplate}
              style={{ padding: '5px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <RotateCcw size={12} /> Nạp mẫu (100 phòng)
            </button>
            {hasConfig && (
              <button
                onClick={handleClearAll}
                style={{ padding: '5px 10px', fontSize: 11, color: '#c2410c', borderColor: '#fca5a5' }}
              >
                <Trash2 size={12} /> Xóa trắng
              </button>
            )}
          </div>
        </div>

        <div className="grid2" style={{ alignItems: 'start', gap: 20 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="field">
              <label style={{ fontSize: 11, fontWeight: 700, color: '#14394a' }}>Tên khách sạn</label>
              <input
                type="text"
                placeholder="Nhập tên khách sạn..."
                value={hotelName}
                onChange={e => handleHotelNameChange(e.target.value)}
              />
            </div>

            <div className="fields" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#14394a' }}>Số lượng phòng (Capacity)</label>
                <input
                  type="number"
                  min="0"
                  max="5000"
                  placeholder="0"
                  value={capacity || ''}
                  onChange={e => handleCapacityChange(Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#14394a' }}>Số phòng đã bán</label>
                <input
                  type="number"
                  min="0"
                  max={capacity || 100}
                  value={roomsSold}
                  onChange={e => setRoomsSold(Math.min(capacity, Math.max(0, Number(e.target.value))))}
                />
              </div>
            </div>

            <div className="field">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#14394a' }}>Thời điểm mở bán</label>
                <strong style={{ color: '#007f72', fontSize: 11 }}>Ngày {currentDay}/30 (Còn {daysRemaining} ngày)</strong>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                value={daysRemaining}
                onChange={e => setDaysRemaining(Number(e.target.value))}
              />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#14394a' }}>
                Danh mục hạng phòng ({fareClasses.length})
              </span>
              <button className="primary" onClick={handleAddFareClass} style={{ padding: '4px 10px', fontSize: 11 }}>
                <Plus size={12} /> Thêm hạng phòng
              </button>
            </div>

            {fareClasses.length === 0 ? (
              <div style={{ padding: 18, border: '1px dashed #cbd5e1', borderRadius: 8, textAlign: 'center', color: '#64748b', fontSize: 11 }}>
                Chưa có hạng phòng. Bấm <strong>"+ Thêm hạng phòng"</strong> hoặc <strong>"Nạp mẫu"</strong>.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 140px 28px', gap: 8, padding: '0 8px', fontSize: 10, fontWeight: 700, color: '#64748b' }}>
                  <span>#</span>
                  <span>Tên hạng phòng</span>
                  <span>Giá niêm yết (VNĐ)</span>
                  <span></span>
                </div>

                {fareClasses.map((fc, index) => (
                  <div
                    key={fc.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '24px 1fr 140px 28px',
                      gap: 8,
                      alignItems: 'center',
                      padding: '4px 8px',
                      border: '1px solid #e2e9ed',
                      borderRadius: 6,
                      background: '#fff'
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#82949e' }}>#{index + 1}</span>
                    <input
                      type="text"
                      value={fc.name}
                      placeholder="Tên hạng phòng..."
                      onChange={e => handleUpdateFareClass(fc.id, 'name', e.target.value)}
                      style={{ fontSize: 11, padding: '4px 6px' }}
                    />
                    <input
                      type="number"
                      step="10000"
                      value={fc.price}
                      onChange={e => handleUpdateFareClass(fc.id, 'price', Number(e.target.value))}
                      style={{ fontSize: 11, padding: '4px 6px', fontWeight: 600, width: '100%' }}
                    />
                    <button
                      onClick={() => handleRemoveFareClass(fc.id)}
                      title="Xóa"
                      style={{ border: 'none', background: 'transparent', color: '#c2410c', padding: 2, cursor: 'pointer' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 2. CHỌN PHƯƠNG PHÁP DỰ ĐOÁN LƯỢNG KHÁCH */}
      <div style={{ marginBottom: 16 }}>
        {/* CÁCH 1: POISSON */}
        <section className="panel" style={{ marginBottom: 12, border: isOpenMethod1 ? '1.5px solid #007f72' : '1px solid #dfe8eb' }}>
          <div
            onClick={handleToggleMethod1}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 8, background: isOpenMethod1 ? '#007f72' : '#e6f4f1', color: isOpenMethod1 ? '#fff' : '#007f72' }}>
                <Edit3 size={16} />
              </div>
              <div>
                <b style={{ fontSize: 13, color: '#0f3844', display: 'block' }}>
                  CÁCH 1: Phân phối lượng khách theo Phân phối Poisson (Nhập khách dự tính & Thời điểm trong năm)
                </b>
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: isOpenMethod1 ? '#007f72' : '#64748b', background: isOpenMethod1 ? '#edf7f4' : '#f1f5f9', padding: '5px 12px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              {isOpenMethod1 ? <>Đang dùng <ChevronUp size={13} /></> : <>Mở <ChevronDown size={13} /></>}
            </span>
          </div>

          {isOpenMethod1 && (
            <div style={{ marginTop: 14, borderTop: '1px solid #e5ecef', paddingTop: 14 }}>
              {/* Chọn Thời điểm trong năm */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#14394a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={14} color="#007f72" /> Thời điểm trong năm:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                  {TIME_OF_YEAR_PROFILES.map(prof => {
                    const active = selectedTimeOfYear === prof.key;
                    return (
                      <div
                        key={prof.key}
                        onClick={() => handleSelectTimeOfYear(prof.key)}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          border: `1.5px solid ${active ? '#007f72' : '#e2e8f0'}`,
                          background: active ? '#edf8f5' : '#fff',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <strong style={{ fontSize: 11, color: active ? '#007f72' : '#1e293b' }}>{prof.shortTitle}</strong>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: active ? '#007f72' : '#f1f5f9', color: active ? '#fff' : '#475569' }}>
                          ×{prof.demandMultiplier}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {fareClasses.length === 0 ? (
                <div style={{ padding: 14, textAlign: 'center', color: '#64748b', fontSize: 11, background: '#f8fafc', borderRadius: 6 }}>
                  Vui lòng thêm hạng phòng ở mục 1 trước.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: '8px 12px', background: '#f0fdf4', borderRadius: 6, marginBottom: 10, fontSize: 11 }}>
                    <span style={{ color: '#166534', fontWeight: 600 }}>
                      Tổng lượng khách dự tính cơ sở:
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="number"
                        min="0"
                        max="15000"
                        value={totalBaseUserDemand}
                        onChange={e => handleUpdateTotalEstimatedCustomers(Number(e.target.value))}
                        style={{ width: 90, padding: '4px 8px', fontSize: 12, fontWeight: 700, color: '#007f72', border: '1px solid #16a34a', borderRadius: 4, background: '#fff' }}
                      />
                      <span style={{ color: '#166534' }}>
                        → Sau nhân mùa vụ (×{currentTimeProfile.demandMultiplier}): <strong>Λ = {totalActiveDemand} khách</strong>
                      </span>
                    </div>
                  </div>

                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 36 }}>#</th>
                          <th>Hạng phòng</th>
                          <th>Giá niêm yết</th>
                          <th style={{ width: 150 }}>Khách dự tính</th>
                          <th>Hệ số mùa</th>
                          <th>Nhu cầu Poisson (λ)</th>
                          <th>Khoảng 95%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fareClasses.map((fc, index) => {
                          const baseVal = baseUserDemands[fc.id] ?? 40;
                          const effectiveLambda = Math.round(baseVal * currentTimeProfile.demandMultiplier);
                          const sdVal = Math.sqrt(effectiveLambda);
                          const ciLow = Math.max(0, Math.round(effectiveLambda - 1.96 * sdVal));
                          const ciHigh = Math.round(effectiveLambda + 1.96 * sdVal);

                          return (
                            <tr key={fc.id}>
                              <td>#{index + 1}</td>
                              <td><strong>{fc.name}</strong></td>
                              <td>{MONEY(fc.price)}</td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  max="5000"
                                  value={baseVal}
                                  onChange={e => handleUpdateUserBaseDemand(fc.id, Number(e.target.value))}
                                  style={{ fontSize: 12, fontWeight: 700, color: '#007f72', padding: '4px 8px', width: '100%' }}
                                />
                              </td>
                              <td>×{currentTimeProfile.demandMultiplier}</td>
                              <td><strong style={{ color: '#007f72' }}>{effectiveLambda} khách</strong></td>
                              <td>{ciLow} – {ciHigh}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* CÁCH 2: CSV LỊCH SỬ */}
        <section className="panel" style={{ border: isOpenMethod2 ? '1.5px solid #007f72' : '1px solid #dfe8eb' }}>
          <div
            onClick={handleToggleMethod2}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 8, background: isOpenMethod2 ? '#007f72' : '#e6f4f1', color: isOpenMethod2 ? '#fff' : '#007f72' }}>
                <FileSpreadsheet size={16} />
              </div>
              <div>
                <b style={{ fontSize: 13, color: '#0f3844', display: 'block' }}>
                  CÁCH 2: Gửi dữ liệu Cùng kỳ năm ngoái hoặc 3 tháng gần nhất (CSV)
                </b>
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: isOpenMethod2 ? '#007f72' : '#64748b', background: isOpenMethod2 ? '#edf7f4' : '#f1f5f9', padding: '5px 12px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              {isOpenMethod2 ? <>Đang dùng <ChevronUp size={13} /></> : <>Mở <ChevronDown size={13} /></>}
            </span>
          </div>

          {isOpenMethod2 && (
            <div style={{ marginTop: 14, borderTop: '1px solid #e5ecef', paddingTop: 14 }}>
              <HistoricalDataView
                onApplyForecastToService={(classes, summary) => {
                  handleApplyFromHistory(classes, summary);
                }}
              />
            </div>
          )}
        </section>
      </div>

      {/* 3. BIỂU ĐỒ DỰ BÁO NHU CẦU & HỆ SỐ GIÁ 30 NGÀY */}
      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="section-heading" style={{ margin: '0 0 10px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#007f72', margin: 0, fontSize: 14 }}>
            <BrainCircuit size={17} /> 2. Dự Đoán Nhu Cầu Từng Ngày & Hệ Số Giá Hợp Lý (30 Ngày)
          </h3>
          {hasDemand && (
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="outline-tag">Tổng cầu: <strong>{mlForecast.totalForecastDemand30d} phòng</strong></span>
              <span className="outline-tag">Hệ số giá: <strong>x{mlForecast.minRecommendedMultiplier?.toFixed(2)} – x{mlForecast.maxRecommendedMultiplier?.toFixed(2)}</strong></span>
            </div>
          )}
        </div>

        {!hasDemand ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12, background: '#f8fafc', borderRadius: 8 }}>
            Mở <strong>CÁCH 1</strong> hoặc <strong>CÁCH 2</strong> ở trên để xem dự báo nhu cầu từng ngày.
          </div>
        ) : (
          <div style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={mlForecast.series30d}>
                <CartesianGrid strokeDasharray="3 4" vertical={false} />
                <Legend />
                <XAxis dataKey="day" tickLine={false} tickFormatter={v => `N${v}`} />
                <YAxis yAxisId="left" tickLine={false} width={36} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0.7, 1.45]}
                  tickLine={false}
                  width={42}
                  tickFormatter={v => `x${Number(v).toFixed(2)}`}
                />
                <Tooltip
                  labelFormatter={v => `Ngày ${v} (${mlForecast.series30d[Number(v) - 1]?.dayOfWeek || ''})`}
                  formatter={(val: number, name: string) =>
                    name.includes('Hệ số') ? [`x${Number(val).toFixed(2)}`, name] : [`${val} phòng`, name]
                  }
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="ciUpper95"
                  name="Cận trên 95%"
                  fill="#b2dfd6"
                  stroke="none"
                  fillOpacity={0.35}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="ciLower95"
                  name="Cận dưới 95%"
                  fill="#ffffff"
                  stroke="none"
                  fillOpacity={1}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="forecastDemand"
                  name="Nhu cầu dự đoán (phòng)"
                  stroke="#007f72"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="recommendedMultiplier"
                  name="Hệ số giá hợp lý"
                  stroke="#d97706"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* 4. BẢNG ĐỀ XUẤT PHÂN PHỐI GIÁ & HẠN MỨC EMSR-b */}
      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="section-heading" style={{ margin: '0 0 10px' }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>3. Phân Phối Giá Hợp Lý & Hạn Mức Mở Bán (EMSR-b)</h3>
          {hasDemand && capacity > 0 && (
            <button onClick={handleExportConsultation} style={{ padding: '5px 12px', fontSize: 11 }}>
              <Download size={12} /> Xuất báo cáo (.txt)
            </button>
          )}
        </div>

        {!hasDemand || capacity <= 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12, background: '#f8fafc', borderRadius: 8 }}>
            Nhập số lượng phòng và mở Cách 1 hoặc Cách 2 để nhận bảng phân phối giá và hạn mức bảo vệ phòng.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hạng phòng</th>
                  <th>Nhu cầu</th>
                  <th>Giá cơ sở</th>
                  <th>Dải giá hợp lý (30 ngày)</th>
                  <th>Giá đề xuất</th>
                  <th>Bảo vệ phòng (Protection)</th>
                  <th>Mở bán tối đa (Booking Limit)</th>
                </tr>
              </thead>
              <tbody>
                {recommendedFareClasses.map((fc, index) => {
                  const pl = emsrResult.protectionLevels[fc.id] ?? 0;
                  const bl = emsrResult.bookingLimits[fc.id] ?? 0;
                  const isTopClass = index === recommendedFareClasses.length - 1;

                  return (
                    <tr key={fc.id}>
                      <td><strong>{fc.name}</strong></td>
                      <td>{fc.meanDemand} khách</td>
                      <td>{MONEY(fc.price)}</td>
                      <td>{MONEY(fc.minOptimalPrice)} → {MONEY(fc.maxOptimalPrice)}</td>
                      <td>
                        <strong style={{ color: '#007f72' }}>{MONEY(fc.recommendedPrice)}</strong>{' '}
                        <small style={{ color: fc.priceDiff >= 0 ? '#007b6d' : '#c2410c' }}>
                          ({fc.priceDiff >= 0 ? '+' : ''}{NUM(fc.percentDiff)}%)
                        </small>
                      </td>
                      <td style={{ color: pl > 0 ? '#d18a2e' : '#82949e', fontWeight: pl > 0 ? 700 : 400 }}>
                        {pl} phòng
                      </td>
                      <td>
                        <strong>{isTopClass ? `Toàn bộ (${bl} phòng)` : `${bl} phòng`}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 5. DỰ PHÓNG DOANH THU 3 CHIẾN LƯỢC */}
      {strategyComparisonPreview && (
        <section className="panel" style={{ borderTop: '3px solid #078778' }}>
          <div className="section-heading" style={{ margin: '0 0 12px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#078778', margin: 0, fontSize: 14 }}>
              <TrendingUp size={17} /> 4. Dự Phóng Doanh Thu 3 Chiến Lược (30 Ngày)
            </h3>
            <div style={{ display: 'flex', gap: 8 }}>
              {onNavigateToSimulation && (
                <button
                  className="primary"
                  onClick={onNavigateToSimulation}
                  style={{ padding: '6px 12px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Play size={12} /> Mô phỏng chi tiết <ArrowRight size={12} />
                </button>
              )}
              {onNavigateToMonteCarlo && (
                <button
                  onClick={onNavigateToMonteCarlo}
                  style={{ padding: '6px 12px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <FlaskConical size={12} /> Monte Carlo
                </button>
              )}
            </div>
          </div>

          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div className="panel kpi" style={{ borderTopColor: '#64748b', background: '#f8fafc' }}>
              <div className="kpi-label">A · FCFS (GIÁ CỐ ĐỊNH)</div>
              <div className="revenue" style={{ fontSize: 19 }}>{MONEY(strategyComparisonPreview.A.revenue)}</div>
              <small style={{ color: '#475569', fontSize: 11 }}>
                Bán {strategyComparisonPreview.A.sold}/{capacity} phòng ({NUM(strategyComparisonPreview.A.occ)}%) · RevPAR: {MONEY(strategyComparisonPreview.A.revpar)}
              </small>
            </div>

            <div className="panel kpi" style={{ borderTopColor: '#d18a2e', background: '#fffbeb' }}>
              <div className="kpi-label">B · EMSR-b (BẢO VỆ HẠN MỨC)</div>
              <div className="revenue" style={{ fontSize: 19, color: '#b45309' }}>{MONEY(strategyComparisonPreview.B.revenue)}</div>
              <small style={{ color: '#92400e', fontSize: 11 }}>
                {strategyComparisonPreview.B.gainVsA >= 0 ? '+' : ''}{MONEY(strategyComparisonPreview.B.gainVsA)} ({strategyComparisonPreview.B.gainPctVsA >= 0 ? '+' : ''}{NUM(strategyComparisonPreview.B.gainPctVsA)}% so với A) · RevPAR: {MONEY(strategyComparisonPreview.B.revpar)}
              </small>
            </div>

            <div className="panel kpi" style={{ borderTopColor: '#078778', background: '#edf8f5', border: '1.5px solid #078778' }}>
              <div className="kpi-label" style={{ color: '#007f72', fontWeight: 700 }}>C · DYNAMIC PRICING + EMSR-b (TỐI ƯU)</div>
              <div className="revenue" style={{ fontSize: 19, color: '#007f72' }}>{MONEY(strategyComparisonPreview.C.revenue)}</div>
              <small style={{ color: '#065f46', fontSize: 11, fontWeight: 600 }}>
                {strategyComparisonPreview.C.gainVsA >= 0 ? '+' : ''}{MONEY(strategyComparisonPreview.C.gainVsA)} ({strategyComparisonPreview.C.gainPctVsA >= 0 ? '+' : ''}{NUM(strategyComparisonPreview.C.gainPctVsA)}% so với A) · RevPAR: {MONEY(strategyComparisonPreview.C.revpar)}
              </small>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
