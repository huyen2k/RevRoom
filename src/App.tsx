import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Play,
  Pause,
  StepForward,
  RotateCcw,
  Download,
  SlidersHorizontal,
  ChartNoAxesCombined,
  BookOpen,
  FlaskConical,
  Users,
  Hotel,
  Activity,
  Shuffle,
  Calculator,
  Clock,
  ShieldCheck,
  TrendingUp,
  Sparkles,
  BarChart3,
  Layers,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import PricingServiceView from './PricingServiceView';
import StrategyAView from './StrategyAView';
import StrategyBView from './StrategyBView';
import StrategyCView from './StrategyCView';
import type { CustomFareClass } from './services/emsrN';
import {
  type HotelConfig,
  type HotelCustomer,
  type HotelSimulationState,
  type MonteCarloBatchResult,
  generateHotelCustomers,
  initialHotelState,
  stepHotelSimulation,
  runHotelSimulationFull,
  evaluateHotelMonteCarlo,
  exportHotelSimulationCsv,
  exportHotelMonteCarloCsv
} from './services/hotelSimulationService';

const COLORS = { A: '#64748b', B: '#d18a2e', C: '#078778' };
const LABELS = { A: 'FCFS · Giá cố định', B: 'EMSR-b · Bảo vệ hạn mức', C: 'Dynamic Pricing + EMSR-b' };
const MONEY = (n: number) => Math.round(n).toLocaleString('vi-VN') + ' đ';
const NUM = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const REASONS = {
  accepted: 'Đã đặt phòng',
  price: 'Từ chối · Giá quá cao',
  full: 'Từ chối · Hết phòng',
  protected: 'Từ chối · Đang bảo vệ phòng'
};

type TabType = 'service' | 'strategy-a' | 'strategy-b' | 'strategy-c' | 'simulation' | 'evaluation';

const TAB_TITLES: Record<TabType, string> = {
  service: 'Dịch vụ định giá khách sạn (RMaaS)',
  'strategy-a': 'Chiến lược A · FCFS (First-Come, First-Served)',
  'strategy-b': 'Chiến lược B · EMSR-b (Bảo vệ hạn mức phòng)',
  'strategy-c': 'Chiến lược C · Dynamic Pricing (Định giá động)',
  simulation: 'Mô phỏng bán phòng & Đối soát 3 chiến lược',
  evaluation: 'Kiểm định Monte Carlo · Đánh giá độ tin cậy'
};

const TAB_SUBTITLES: Record<TabType, string> = {
  service: 'Thiết lập khách sạn, dự báo lượng khách và nhận đề xuất phân phối giá & hạn mức EMSR-b.',
  'strategy-a': 'Bán phòng tự do theo thứ tự đến · Giá cố định · Không bảo vệ phòng.',
  'strategy-b': 'Giá cố định · Bảo vệ hạn mức tồn kho EMSR-b cho các hạng phòng giá cao.',
  'strategy-c': 'Định giá động theo nhịp độ đặt phòng kết hợp bảo vệ hạn mức EMSR-b.',
  simulation: 'Mô phỏng 30 ngày mở bán và đối soát kết quả giữa 3 chiến lược A, B, C.',
  evaluation: 'Sinh nhiều kịch bản thị trường ngẫu nhiên để so sánh và kiểm định độ tin cậy.'
};

const DEFAULT_HOTEL_CONFIG: HotelConfig = {
  hotelName: '',
  capacity: 0,
  fareClasses: [],
  seed: 42,
  intensity: 1,
  distribution: 'poisson',
  k: 0.6,
  min: 0.8,
  max: 1.25
};

function loadStoredHotelConfig(): HotelConfig {
  try {
    const raw = sessionStorage.getItem('revroom-hotel-config');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.capacity === 'number') {
        parsed.capacity = Math.min(5000, Math.max(0, parsed.capacity));
        if (Array.isArray(parsed.fareClasses)) {
          parsed.fareClasses = parsed.fareClasses.slice(0, 20).map((fc: CustomFareClass) => ({
            ...fc,
            meanDemand: Math.min(5000, Math.max(0, Number(fc.meanDemand) || 0))
          }));
        }
        return parsed;
      }
    }
  } catch {}
  return structuredClone(DEFAULT_HOTEL_CONFIG);
}

function DynamicRoomGrid({
  capacity,
  sold,
  protectedCount
}: {
  capacity: number;
  sold: number;
  protectedCount: number;
}) {
  const safeProtected = Math.min(Math.max(0, capacity - sold), protectedCount);
  const freeCount = Math.max(0, capacity - sold - safeProtected);

  // Giới hạn tối đa 200 ô hiển thị trên DOM để tránh tràn bộ nhớ khi quy mô khách sạn rất lớn (> 200 phòng)
  const MAX_RENDER_CELLS = 200;
  const isScaled = capacity > MAX_RENDER_CELLS;
  const displayCells = isScaled ? MAX_RENDER_CELLS : Math.max(0, capacity);
  const soldCells = isScaled && capacity > 0 ? Math.round((sold / capacity) * displayCells) : sold;
  const protectedCells = isScaled && capacity > 0
    ? Math.min(displayCells - soldCells, Math.round((safeProtected / capacity) * displayCells))
    : safeProtected;
  const roomsPerCell = isScaled && displayCells > 0 ? Math.ceil(capacity / displayCells) : 1;

  return (
    <div className="room-wrap">
      <div className="room-legend">
        <span><i className="sold" />Đã bán ({sold})</span>
        <span><i className="protected" />Bảo vệ cho hạng cao ({safeProtected})</span>
        <span><i className="free" />Mở cho mọi hạng ({freeCount})</span>
      </div>
      {isScaled && (
        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>
          Hiển thị {displayCells} khối đại diện theo tỷ lệ cho tổng quy mô {capacity.toLocaleString('vi-VN')} phòng (~{roomsPerCell} phòng/khối)
        </div>
      )}
      <div
        className="room-grid"
        style={{
          gridTemplateColumns: `repeat(${Math.min(10, Math.max(5, Math.ceil(Math.sqrt(displayCells * 1.6))))}, minmax(0, 1fr))`
        }}
      >
        {Array.from({ length: displayCells }, (_, i) => {
          const status = i < soldCells ? 'sold' : i < soldCells + protectedCells ? 'protected' : 'free';
          return (
            <span
              key={i}
              className={`room ${status}`}
              title={
                isScaled
                  ? `Khối #${i + 1} (~${roomsPerCell} phòng) · ${status === 'sold' ? 'Đã bán' : status === 'protected' ? 'Được bảo vệ' : 'Có thể bán'}`
                  : `Phòng ${i + 1} · ${status === 'sold' ? 'Đã bán' : status === 'protected' ? 'Được bảo vệ' : 'Có thể bán'}`
              }
            >
              {i + 1}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [hotelConfig, setHotelConfig] = useState<HotelConfig>(loadStoredHotelConfig);
  const [draftConfig, setDraftConfig] = useState<HotelConfig>(loadStoredHotelConfig);
  const [hotelState, setHotelState] = useState<HotelSimulationState>(initialHotelState);

  const [tab, setTab] = useState<TabType>('service');
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(700);
  const [dayView, setDayView] = useState(1);
  const [selectedPolicy, setSelectedPolicy] = useState<'A' | 'B' | 'C'>('C');
  const [batch, setBatch] = useState<MonteCarloBatchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [runCount, setRunCount] = useState(100);
  const [notice, setNotice] = useState('');

  // Sinh tập khách hàng 30 ngày bám sát đúng cấu hình khách sạn
  const hotelCustomers = useMemo(() => generateHotelCustomers(hotelConfig), [hotelConfig]);
  const dirty = JSON.stringify(hotelConfig) !== JSON.stringify(draftConfig);
  const hasHotelData = hotelConfig.capacity > 0 && hotelConfig.fareClasses.length > 0;
  const totalConfigDemand = useMemo(() => {
    return hotelConfig.fareClasses.reduce((sum, c) => sum + (c.meanDemand ?? 0), 0);
  }, [hotelConfig.fareClasses]);

  // Vòng lặp mô phỏng tự động khi nhấn Play
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setHotelState(s => {
        if (s.day >= 30) {
          setRunning(false);
          return s;
        }
        const next = stepHotelSimulation(hotelConfig, s, hotelCustomers);
        setDayView(next.day);
        return next;
      });
    }, speed);
    return () => window.clearInterval(timer);
  }, [running, speed, hotelConfig, hotelCustomers]);

  // Áp dụng cấu hình mới
  const applyHotelConfig = (nextConfig: HotelConfig, switchToSimulation = false) => {
    setRunning(false);
    setHotelConfig(nextConfig);
    setDraftConfig(structuredClone(nextConfig));
    setHotelState(initialHotelState());
    setDayView(1);
    setBatch(null);

    try {
      sessionStorage.setItem('revroom-hotel-config', JSON.stringify(nextConfig));
      localStorage.removeItem('revroom-hotel-config');
      localStorage.removeItem('revroom-config');
    } catch {}

    setNotice(`Đã áp dụng cấu hình "${nextConfig.hotelName}" (${nextConfig.capacity} phòng, ${nextConfig.fareClasses.length} hạng giá) sang mô phỏng.`);
    if (switchToSimulation) {
      setTab('simulation');
    }
  };

  // Điều khiển mô phỏng
  const resetSimulation = () => {
    setRunning(false);
    setHotelState(initialHotelState());
    setDayView(1);
    setNotice('Đã đặt lại mô phỏng.');
  };

  const runAllSimulation = () => {
    setRunning(false);
    const completed = runHotelSimulationFull(hotelConfig, hotelCustomers);
    setHotelState(completed);
    setDayView(30);
    setNotice(`Đã hoàn tất toàn bộ 30 ngày mô phỏng cho ${hotelConfig.hotelName}!`);
  };

  const stepOneDay = () => {
    setRunning(false);
    const next = stepHotelSimulation(hotelConfig, hotelState, hotelCustomers);
    setHotelState(next);
    setDayView(Math.max(1, next.day));
  };

  const ensureSimulationDay = (targetDay: number) => {
    setHotelState(s => {
      let cur = s;
      while (cur.day < targetDay) {
        cur = stepHotelSimulation(hotelConfig, cur, hotelCustomers);
      }
      return cur;
    });
  };

  // Tải CSV mô phỏng
  const handleDownloadSimulationCsv = () => {
    const csvContent = exportHotelSimulationCsv(hotelConfig, hotelState);
    const url = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `RevRoom_${hotelConfig.hotelName.replace(/\s+/g, '_')}_30Ngay_Seed_${hotelConfig.seed}.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Chạy kiểm định Monte Carlo
  const handleRunMonteCarlo = async () => {
    setBusy(true);
    setRunning(false);
    setNotice(`Đang chạy kiểm định ${runCount} seed ngẫu nhiên ghép cặp cho ${hotelConfig.hotelName}…`);
    await new Promise(r => setTimeout(r, 20));
    try {
      const res = evaluateHotelMonteCarlo(hotelConfig, runCount);
      setBatch(res);
      setNotice(`Đã hoàn tất ${runCount} lượt kiểm định Monte Carlo ghép cặp.`);
    } catch (err) {
      setNotice('Lỗi khi chạy Monte Carlo: ' + String(err));
    } finally {
      setBusy(false);
    }
  };

  // Tải CSV Monte Carlo
  const handleDownloadMonteCarloCsv = () => {
    if (!batch) return;
    const csvContent = exportHotelMonteCarloCsv(batch);
    const url = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `RevRoom_MonteCarlo_${batch.n}_Seeds_${hotelConfig.hotelName.replace(/\s+/g, '_')}.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Dữ liệu biểu đồ so sánh doanh thu và số phòng đã bán
  const revenueChartPoints = Array.from({ length: hotelState.day + 1 }, (_, d) => {
    if (d === 0) return { day: 0, A: 0, B: 0, C: 0 };
    return {
      day: d,
      A: (hotelState.histories.A[d - 1]?.cumulativeRevenue ?? 0) / 1e6,
      B: (hotelState.histories.B[d - 1]?.cumulativeRevenue ?? 0) / 1e6,
      C: (hotelState.histories.C[d - 1]?.cumulativeRevenue ?? 0) / 1e6
    };
  });

  const soldChartPoints = Array.from({ length: hotelState.day + 1 }, (_, d) => {
    if (d === 0) return { day: 0, A: 0, B: 0, C: 0 };
    return {
      day: d,
      A: hotelState.histories.A[d - 1]?.cumulativeSold ?? 0,
      B: hotelState.histories.B[d - 1]?.cumulativeSold ?? 0,
      C: hotelState.histories.C[d - 1]?.cumulativeSold ?? 0
    };
  });

  // Hạng phòng đã sắp xếp
  const sortedClasses = useMemo(() => {
    return [...hotelConfig.fareClasses].sort((a, b) => a.price - b.price);
  }, [hotelConfig.fareClasses]);

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-icon">
            <Building2 size={21} />
          </span>
          rev<span>Room</span> <em>RMaaS · NỀN TẢNG ĐỊNH GIÁ & QUẢN TRỊ DOANH THU KHÁCH SẠN</em>
        </a>
        <span className="data-badge">
          {hotelConfig.capacity > 0 ? (
            <>
              <i /> {hotelConfig.hotelName || 'Khách sạn'} · {hotelConfig.capacity} phòng · {sortedClasses.length} hạng giá
            </>
          ) : (
            <>
              <i style={{ background: '#94a3b8' }} /> Trạng thái trống (0 phòng · 0 hạng giá)
            </>
          )}
        </span>
      </header>

      <div className="layout">
        <aside>
          {/* 1. DỊCH VỤ RMaaS */}
          <div className="aside-label">DỊCH VỤ RMaaS</div>
          <nav>
            <button
              className={`nav ${tab === 'service' ? 'active' : ''}`}
              onClick={() => {
                setRunning(false);
                setTab('service');
              }}
            >
              <Calculator size={18} />
              <span>Dịch vụ định giá</span>
            </button>
          </nav>

          {/* 2. 3 CHIẾN LƯỢC QUẢN TRỊ */}
          <div className="aside-label" style={{ marginTop: 14 }}>3 CHIẾN LƯỢC QUẢN TRỊ</div>
          <nav>
            <button
              className={`nav ${tab === 'strategy-a' ? 'active' : ''}`}
              onClick={() => {
                setRunning(false);
                setTab('strategy-a');
              }}
            >
              <Clock size={18} />
              <span>Chiến lược A · FCFS</span>
            </button>
            <button
              className={`nav ${tab === 'strategy-b' ? 'active' : ''}`}
              onClick={() => {
                setRunning(false);
                setTab('strategy-b');
              }}
            >
              <ShieldCheck size={18} />
              <span>Chiến lược B · EMSR-b</span>
            </button>
            <button
              className={`nav ${tab === 'strategy-c' ? 'active' : ''}`}
              onClick={() => {
                setRunning(false);
                setTab('strategy-c');
              }}
            >
              <TrendingUp size={18} />
              <span>Chiến lược C · Giá động</span>
            </button>
          </nav>

          {/* 3. MÔ PHỎNG & ĐỐI SOÁT */}
          <div className="aside-label" style={{ marginTop: 14 }}>MÔ PHỎNG & SO SÁNH</div>
          <nav>
            <button
              className={`nav ${tab === 'simulation' ? 'active' : ''}`}
              onClick={() => {
                setRunning(false);
                setTab('simulation');
              }}
            >
              <Play size={18} />
              <span>Mô phỏng & So sánh</span>
            </button>
            <button
              className={`nav ${tab === 'evaluation' ? 'active' : ''}`}
              onClick={() => {
                setRunning(false);
                setTab('evaluation');
              }}
            >
              <FlaskConical size={18} />
              <span>Kiểm định Monte Carlo</span>
            </button>
          </nav>

          <div className="aside-foot">
            revRoom RMaaS<br />
            <span>FCFS / EMSR-b / Dynamic Pricing</span>
          </div>
        </aside>

        <main>
          {/* Header Tiêu đề Trang */}
          <div className="page-heading">
            <div>
              <div className="eyebrow">REVROOM / {tab.toUpperCase()}</div>
              <h1>{TAB_TITLES[tab]}</h1>
              <p>{TAB_SUBTITLES[tab]}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="outline-tag">
                {hasHotelData ? `${hotelConfig.hotelName || 'Khách sạn'} (${hotelConfig.capacity} phòng)` : 'Chưa có cấu hình'}
              </span>
            </div>
          </div>

          {notice && (
            <div className="sr-status" role="status" style={{ marginBottom: 16 }}>
              {notice}
            </div>
          )}

          {totalConfigDemand === 0 && tab !== 'service' && hasHotelData && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 8,
              marginBottom: 16,
              color: '#92400e',
              fontSize: 12
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={16} color="#d97706" />
                <span>
                  <strong>LƯỢNG KHÁCH DỰ ĐOÁN ĐANG BẰNG 0:</strong> Do cả CÁCH 1 và CÁCH 2 đang thu gọn tại tab Dịch vụ định giá. Hãy mở CÁCH 1 (Poisson) hoặc CÁCH 2 (Lịch sử đặt phòng) để kích hoạt lượng khách mô phỏng.
                </span>
              </div>
              <button
                onClick={() => setTab('service')}
                style={{ padding: '4px 10px', fontSize: 11, borderColor: '#d97706', color: '#92400e' }}
              >
                Đến tab Dịch vụ định giá
              </button>
            </div>
          )}

          {/* RENDER NỘI DUNG TỪNG TAB */}
          {tab === 'service' ? (
            <PricingServiceView
              hotelConfig={hotelConfig}
              onUpdateHotelConfig={newCfg => {
                applyHotelConfig(newCfg, false);
              }}
              onNavigateToSimulation={() => {
                setTab('simulation');
              }}
              onNavigateToMonteCarlo={() => {
                setTab('evaluation');
              }}
            />
          ) : !hasHotelData ? (
            <section className="panel" style={{ textAlign: 'center', padding: '60px 24px', margin: '20px 0' }}>
              <Building2 size={48} style={{ color: '#007f72', margin: '0 auto 16px', opacity: 0.8 }} />
              <h2 style={{ fontSize: 20, color: '#14394a', marginBottom: 10 }}>Hệ thống đang ở trạng thái trống (0 phòng / 0 hạng giá)</h2>
              <p style={{ color: '#64748b', fontSize: 13, maxWidth: 560, margin: '0 auto 24px', lineHeight: 1.6 }}>
                Để mô phỏng bán phòng và đối soát 3 chiến lược, bạn cần cung cấp thông số khách sạn. Hãy vào tab <strong>Dịch vụ định giá</strong> để điền tay trực tiếp (Cách 1) hoặc tải file lịch sử CSV 90 ngày (Cách 2).
              </p>
              <button
                className="primary"
                onClick={() => setTab('service')}
                style={{ padding: '10px 22px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <Calculator size={16} /> Đến tab Dịch vụ định giá ngay
              </button>
            </section>
          ) : tab === 'strategy-a' ? (
            <StrategyAView
              hotelConfig={hotelConfig}
              hotelHistoriesA={hotelState.histories.A}
              currentDay={hotelState.day || 1}
            />
          ) : tab === 'strategy-b' ? (
            <StrategyBView
              hotelConfig={hotelConfig}
              hotelHistoriesB={hotelState.histories.B}
              hotelHistoriesA={hotelState.histories.A}
              currentDay={hotelState.day || 1}
            />
          ) : tab === 'strategy-c' ? (
            <StrategyCView
              hotelConfig={hotelConfig}
              hotelHistoriesC={hotelState.histories.C}
              hotelHistoriesB={hotelState.histories.B}
              hotelHistoriesA={hotelState.histories.A}
              currentDay={hotelState.day || 1}
            />
          ) : tab === 'simulation' ? (
            /* TAB: MÔ PHỎNG CHIẾN LƯỢC & ĐỐI SOÁT */
            <>
              {/* THANH ĐIỀU KHIỂN TIẾN ĐỘ */}
              <section className="panel controls">
                <div className="control-top">
                  <div className="day">
                    <span>TIẾN ĐỘ MỞ BÁN ({hotelConfig.hotelName})</span>
                    <strong>
                      {String(hotelState.day).padStart(2, '0')}
                      <small> / 30 ngày</small>
                    </strong>
                  </div>
                  <div className="actions">
                    <button className="primary" onClick={runAllSimulation} disabled={hotelState.day === 30}>
                      <Play size={16} />
                      Chạy đủ 30 ngày
                    </button>
                    <button onClick={stepOneDay} disabled={hotelState.day === 30}>
                      <StepForward size={16} />
                      Step ngày
                    </button>
                    <button onClick={() => setRunning(!running)} disabled={hotelState.day === 30}>
                      {running ? <Pause size={16} /> : <Play size={16} />}
                      {running ? 'Pause' : 'Play'}
                    </button>
                    <button onClick={resetSimulation}>
                      <RotateCcw size={16} />
                      Reset
                    </button>
                    <button onClick={handleDownloadSimulationCsv} disabled={!hotelState.day}>
                      <Download size={16} />
                      CSV
                    </button>
                  </div>
                  <label className="speed">
                    Tốc độ
                    <select value={speed} onChange={e => setSpeed(Number(e.target.value))}>
                      <option value={1400}>0.5×</option>
                      <option value={700}>1×</option>
                      <option value={250}>2.8×</option>
                    </select>
                  </label>
                </div>
                <progress max={30} value={hotelState.day} />
                <div className="timeline-label">
                  <span>Ngày 0</span>
                  <span>
                    {running ? '● Đang mô phỏng' : 'Sẵn sàng'} · {hotelConfig.capacity} phòng · {sortedClasses.length} hạng giá
                  </span>
                  <span>Ngày 30 (Check-in)</span>
                </div>
              </section>

              {/* TỔNG KẾT KHÁCH ĐẾN HÔM NAY THEO N HẠNG GIÁ CỦA KHÁCH SẠN */}
              <div className="segment-summary" style={{ gridTemplateColumns: `repeat(${sortedClasses.length + 1}, minmax(0, 1fr))` }}>
                {sortedClasses.map((cls, i) => {
                  const todayArrivals = hotelState.day
                    ? hotelState.histories.A[hotelState.day - 1]?.arrivalsByClass[cls.id] ?? 0
                    : '—';
                  return (
                    <div className="panel" key={cls.id}>
                      <span>
                        <Users size={16} /> {cls.name} hôm nay
                      </span>
                      <b style={{ fontSize: 18 }}>{todayArrivals}</b>
                      <small>Giá cơ sở: {MONEY(cls.price)}</small>
                    </div>
                  );
                })}
                <div className="panel">
                  <span>
                    <Hotel size={16} /> Tổng sức chứa
                  </span>
                  <b style={{ fontSize: 18 }}>{hotelConfig.capacity} phòng</b>
                  <small>{hotelConfig.hotelName}</small>
                </div>
              </div>

              {/* 3 THẺ KPI TỔNG KẾT DOANH THU & HIỆU QUẢ */}
              <div className="section-heading" style={{ marginTop: 0 }}>
                <h2>Hiệu quả doanh thu 3 chiến lược cho {hotelConfig.hotelName}</h2>
                <span>Đến hết ngày {hotelState.day} của chu kỳ mở bán</span>
              </div>
              <div className="kpi-grid">
                {(['A', 'B', 'C'] as const).map(p => {
                  const dayData = hotelState.histories[p][hotelState.day - 1];
                  const rev = dayData?.cumulativeRevenue ?? 0;
                  const sold = dayData?.cumulativeSold ?? 0;
                  const remaining = dayData?.remainingRooms ?? hotelConfig.capacity;
                  const occ = hotelConfig.capacity > 0 ? (sold / hotelConfig.capacity) * 100 : 0;
                  const adr = sold > 0 ? rev / sold : 0;
                  const revpar = hotelConfig.capacity > 0 ? rev / hotelConfig.capacity : 0;

                  const baseRev = hotelState.histories.A[hotelState.day - 1]?.cumulativeRevenue ?? 0;
                  const uplift = baseRev > 0 ? ((rev - baseRev) / baseRev) * 100 : 0;

                  return (
                    <article className="panel kpi" key={p} style={{ borderTopColor: COLORS[p] }}>
                      <div className="policy-title">
                        <b className="policy-letter" style={{ background: COLORS[p] }}>
                          {p}
                        </b>
                        {LABELS[p]}
                        {p !== 'A' && hotelState.day > 0 && (
                          <span style={{ marginLeft: 'auto', fontSize: 10, color: uplift >= 0 ? '#078778' : '#dc2626', fontWeight: 700 }}>
                            {uplift >= 0 ? `+${NUM(uplift)}%` : `${NUM(uplift)}%`}
                          </span>
                        )}
                      </div>
                      <div className="kpi-label">DOANH THU LŨY KẾ</div>
                      <div className="revenue">
                        {NUM(rev / 1e6)} <small>triệu đồng</small>
                      </div>
                      <div className="occupancy">
                        <span>
                          Đã bán <b>{sold}/{hotelConfig.capacity} phòng</b>
                        </span>
                        <strong>{NUM(occ)}%</strong>
                      </div>
                      <div className="meter">
                        <i style={{ width: Math.min(100, occ) + '%', background: COLORS[p] }} />
                      </div>
                      <div className="mini-metrics">
                        <div>
                          <span>Còn trống</span>
                          <b>{remaining}</b>
                        </div>
                        <div>
                          <span>ADR</span>
                          <b>{MONEY(adr)}</b>
                        </div>
                        <div>
                          <span>RevPAR</span>
                          <b>{MONEY(revpar)}</b>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* BẢNG ĐỐI SOÁT CHỈ SỐ VÀNG QUẢN TRỊ DOANH THU (EXECUTIVE RM BENCHMARK) */}
              <section className="panel" style={{ marginBottom: 18 }}>
                <div className="section-heading" style={{ marginTop: 0 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f3844' }}>
                      Bảng Đối Soát Chỉ Số Vàng Quản Trị Doanh Thu ({hotelConfig.hotelName})
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: '#68828f' }}>
                      Đối soát toàn diện giữa 3 chiến lược: RevPAR, ADR, Tỷ lệ lấp đầy, Thất thoát do bán non (Displacement Loss) và Hiệu suất Yield trên quy mô {hotelConfig.capacity} phòng.
                    </p>
                  </div>
                  <span className="outline-tag" style={{ background: '#edf7f4', color: '#007f72', borderColor: '#b2dfd6' }}>
                    <Sparkles size={12} style={{ display: 'inline', marginRight: 4 }} /> RM Intelligence
                  </span>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Chiến lược</th>
                        <th>Doanh thu</th>
                        <th>RevPAR</th>
                        <th>ADR</th>
                        <th>Công suất (Occ)</th>
                        <th>Tăng trưởng vs FCFS (A)</th>
                        <th>Thất thoát do bán rẻ (Displacement)</th>
                        <th>Hiệu suất Yield</th>
                        <th style={{ textAlign: 'left' }}>Đánh giá vị thế thị trường</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(['A', 'B', 'C'] as const).map(p => {
                        const dayData = hotelState.histories[p][hotelState.day - 1];
                        const rev = dayData?.cumulativeRevenue ?? 0;
                        const sold = dayData?.cumulativeSold ?? 0;
                        const occ = hotelConfig.capacity > 0 ? (sold / hotelConfig.capacity) * 100 : 0;
                        const adr = sold > 0 ? rev / sold : 0;
                        const revpar = hotelConfig.capacity > 0 ? rev / hotelConfig.capacity : 0;

                        const baseRev = hotelState.histories.A[hotelState.day - 1]?.cumulativeRevenue ?? 0;
                        const maxRev = Math.max(
                          hotelState.histories.A[hotelState.day - 1]?.cumulativeRevenue ?? 0,
                          hotelState.histories.B[hotelState.day - 1]?.cumulativeRevenue ?? 0,
                          hotelState.histories.C[hotelState.day - 1]?.cumulativeRevenue ?? 0
                        );
                        const uplift = baseRev > 0 ? ((rev - baseRev) / baseRev) * 100 : 0;
                        const displacementLoss = Math.max(0, maxRev - rev);
                        const highestPrice = sortedClasses.length > 0 ? sortedClasses[sortedClasses.length - 1].price : 1000000;
                        const maxPossibleRev = hotelConfig.capacity * highestPrice;
                        const yieldRate = maxPossibleRev > 0 ? (rev / maxPossibleRev) * 100 : 0;

                        return (
                          <tr key={p}>
                            <td style={{ textAlign: 'left' }}>
                              <b style={{ color: COLORS[p] }}>{p}</b> · {LABELS[p]}
                            </td>
                            <td><b>{MONEY(rev)}</b></td>
                            <td><b>{MONEY(revpar)}</b></td>
                            <td>{MONEY(adr)}</td>
                            <td>{NUM(occ)}%</td>
                            <td>
                              {p === 'A' ? (
                                <span style={{ color: '#8898a3' }}>Cơ sở (0%)</span>
                              ) : uplift >= 0 ? (
                                <span style={{ color: '#078778', fontWeight: 600 }}>+{NUM(uplift)}%</span>
                              ) : (
                                <span style={{ color: '#dc2626' }}>{NUM(uplift)}%</span>
                              )}
                            </td>
                            <td>
                              {displacementLoss === 0 ? (
                                <span style={{ color: '#078778', fontWeight: 600 }}>0 đ (Tối ưu)</span>
                              ) : (
                                <span style={{ color: '#d97706', fontWeight: 600 }}>-{MONEY(displacementLoss)}</span>
                              )}
                            </td>
                            <td>{NUM(yieldRate)}%</td>
                            <td style={{ textAlign: 'left', fontSize: 10, color: '#566e7c', whiteSpace: 'normal', minWidth: 220 }}>
                              {p === 'A' && 'Bị động: Cạn phòng sớm ở giá thấp, thất thoát cơ hội đón khách VIP hạng cao.'}
                              {p === 'B' && 'Phòng thủ: EMSR-b khóa phòng chọn lọc, bảo vệ doanh thu cho các hạng phòng cao hiệu quả.'}
                              {p === 'C' && 'Chủ động toàn diện: Kết hợp Dynamic Pricing đón nhịp Booking Pace + EMSR-b tối đa hóa RevPAR.'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* BIỂU ĐỒ SO SÁNH */}
              <div className="grid2">
                <section className="panel chart-panel">
                  <h3>So sánh doanh thu lũy kế qua các ngày (Triệu đồng)</h3>
                  <div className="chart-area" style={{ height: 250 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={revenueChartPoints}>
                        <CartesianGrid strokeDasharray="3 4" vertical={false} />
                        <Legend />
                        <XAxis dataKey="day" tickLine={false} />
                        <YAxis tickLine={false} width={45} />
                        <Tooltip labelFormatter={v => `Ngày ${v}`} formatter={(v: number, n: string) => [NUM(v) + ' triệu đ', n]} />
                        {(['A', 'B', 'C'] as const).map(p => (
                          <Line key={p} dataKey={p} name={`${p} · ${LABELS[p]}`} stroke={COLORS[p]} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <section className="panel chart-panel">
                  <h3>So sánh số phòng đã bán qua các ngày</h3>
                  <div className="chart-area" style={{ height: 250 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={soldChartPoints}>
                        <CartesianGrid strokeDasharray="3 4" vertical={false} />
                        <Legend />
                        <XAxis dataKey="day" tickLine={false} />
                        <YAxis domain={[0, hotelConfig.capacity]} tickLine={false} width={40} />
                        <Tooltip labelFormatter={v => `Ngày ${v}`} formatter={(v: number, n: string) => [v + ' phòng', n]} />
                        {(['A', 'B', 'C'] as const).map(p => (
                          <Line key={p} dataKey={p} name={`${p} · ${LABELS[p]}`} stroke={COLORS[p]} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              </div>

              {/* TRỰC QUAN HÓA PHÂN BỔ TỒN KHO PHÒNG */}
              <div className="section-heading">
                <h2>Phân bổ tồn kho {hotelConfig.capacity} phòng · Ngày {hotelState.day || 1}</h2>
              </div>
              <div className="strategy-grid room-cards">
                {(['A', 'B', 'C'] as const).map(p => {
                  const dayData = hotelState.histories[p][(hotelState.day || 1) - 1];
                  const sold = dayData?.cumulativeSold ?? 0;
                  const remaining = dayData?.remainingRooms ?? hotelConfig.capacity;
                  const protFirst = sortedClasses[0]?.id ? dayData?.protectionByClass[sortedClasses[0].id] ?? 0 : 0;

                  return (
                    <section className="panel room-card" key={p}>
                      <div className="strategy-head">
                        <b className="policy-letter" style={{ background: COLORS[p] }}>
                          {p}
                        </b>
                        <div>
                          <h3>{LABELS[p]}</h3>
                          <small>
                            Đã bán {sold} · Còn trống {remaining}/{hotelConfig.capacity} phòng
                          </small>
                        </div>
                      </div>
                      <DynamicRoomGrid
                        capacity={hotelConfig.capacity}
                        sold={sold}
                        protectedCount={p === 'A' ? 0 : protFirst}
                      />
                    </section>
                  );
                })}
              </div>

              {/* BẢNG GIÁ THAY ĐỔI THEO TỪNG NGÀY */}
              <section className="panel log">
                <div className="section-heading">
                  <h2>Bảng giá thay đổi theo từng ngày ({sortedClasses.length} hạng phòng)</h2>
                  <select value={selectedPolicy} onChange={e => setSelectedPolicy(e.target.value as 'A' | 'B' | 'C')}>
                    {(['A', 'B', 'C'] as const).map(p => (
                      <option key={p} value={p}>
                        {p} · {LABELS[p]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Ngày</th>
                        <th>Hệ số giá</th>
                        {sortedClasses.map(c => (
                          <th key={c.id}>{c.name}</th>
                        ))}
                        <th>Đã bán đầu ngày</th>
                        {sortedClasses.slice(0, -1).map(c => (
                          <th key={`prot_th_${c.id}`}>Bảo vệ ({c.name})</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {hotelState.histories[selectedPolicy].map(d => (
                        <tr key={d.day}>
                          <td>Ngày {d.day}</td>
                          <td>x{d.priceMultiplier.toFixed(3)}</td>
                          {sortedClasses.map(c => (
                            <td key={c.id}>
                              <b>{MONEY(d.pricesByClass[c.id] ?? c.price)}</b>
                            </td>
                          ))}
                          <td>{d.cumulativeSold - d.acceptedCount}</td>
                          {sortedClasses.slice(0, -1).map(c => (
                            <td key={`prot_td_${c.id}`}>
                              {d.protectionByClass[c.id] ?? 0} phòng
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* THỐNG KÊ CHI TIẾT TỪNG NGÀY */}
              <section className="panel log">
                <div className="section-heading">
                  <h2>Thống kê chi tiết từng ngày</h2>
                  <label>
                    Chính sách{' '}
                    <select value={selectedPolicy} onChange={e => setSelectedPolicy(e.target.value as 'A' | 'B' | 'C')}>
                      {(['A', 'B', 'C'] as const).map(p => (
                        <option key={p} value={p}>
                          {p} · {LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Ngày</th>
                        {sortedClasses.map(c => (
                          <th key={c.id}>{c.name}</th>
                        ))}
                        <th>Tiềm năng</th>
                        <th>Đã bán</th>
                        <th>Từ chối giá</th>
                        <th>Bảo vệ</th>
                        <th>Hết phòng</th>
                        <th>DT ngày</th>
                        <th>DT lũy kế</th>
                        <th>Còn trống</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hotelState.histories[selectedPolicy].map(d => (
                        <tr key={d.day}>
                          <td>Ngày {d.day}</td>
                          {sortedClasses.map(c => (
                            <td key={c.id}>{d.arrivalsByClass[c.id] ?? 0}</td>
                          ))}
                          <td>{d.potentialCustomers}</td>
                          <td><b>{d.acceptedCount}</b></td>
                          <td>{d.rejectedPriceCount}</td>
                          <td style={{ color: d.rejectedProtectedCount > 0 ? '#d18a2e' : 'inherit', fontWeight: d.rejectedProtectedCount > 0 ? 700 : 400 }}>
                            {d.rejectedProtectedCount}
                          </td>
                          <td style={{ color: d.rejectedFullCount > 0 ? '#c2410c' : 'inherit', fontWeight: d.rejectedFullCount > 0 ? 700 : 400 }}>
                            {d.rejectedFullCount}
                          </td>
                          <td>{MONEY(d.dailyRevenue)}</td>
                          <td><b>{MONEY(d.cumulativeRevenue)}</b></td>
                          <td>{d.remainingRooms}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* NHẬT KÝ GIAO DỊCH CHI TIẾT */}
              <section className="panel log">
                <div className="section-heading">
                  <h2>Nhật ký giao dịch chi tiết · Ngày {dayView}</h2>
                  <label>
                    Ngày{' '}
                    <select
                      value={dayView}
                      onChange={e => {
                        const n = Number(e.target.value);
                        setDayView(n);
                        ensureSimulationDay(n);
                      }}
                    >
                      {Array.from({ length: 30 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          Ngày {i + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Mã khách</th>
                        <th>Hạng phòng</th>
                        <th>Mức sẵn sàng chi trả (WTP)</th>
                        <th>Giá chào</th>
                        <th>Kết quả xử lý</th>
                        <th>Tồn kho trước đó</th>
                        <th>Ngưỡng bảo vệ</th>
                        <th>Doanh thu thu được</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(hotelState.histories[selectedPolicy][dayView - 1]?.transactions ?? []).slice(0, 200).map(t => (
                        <tr key={t.id}>
                          <td>#{t.id}</td>
                          <td><strong>{t.className}</strong></td>
                          <td>{MONEY(t.wtp)}</td>
                          <td>{MONEY(t.offeredPrice)}</td>
                          <td className={t.outcome === 'accepted' ? 'text-good' : 'text-muted'}>
                            {REASONS[t.outcome]}
                          </td>
                          <td>{t.roomsBefore} phòng</td>
                          <td>{t.protectionThreshold} phòng</td>
                          <td><b>{MONEY(t.revenue)}</b></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            /* TAB: KIỂM ĐỊNH MONTE CARLO */
            <section className="panel batch-hero">
              <div className="round-icon">
                <FlaskConical />
              </div>
              <h2>Kiểm định Monte Carlo & So sánh đa kịch bản ({hotelConfig.hotelName || 'Khách sạn'})</h2>
              <p>
                Đối soát ghép cặp 3 chiến lược A, B, C trên nhiều kịch bản thị trường ngẫu nhiên ({hotelConfig.capacity} phòng · {sortedClasses.length} hạng giá).
              </p>
              <div className="fields">
                <label className="field">
                  Số kịch bản mô phỏng
                  <select value={runCount} onChange={e => setRunCount(Number(e.target.value))}>
                    <option value={100}>100 kịch bản</option>
                    <option value={250}>250 kịch bản</option>
                    <option value={500}>500 kịch bản</option>
                    <option value={1000}>1.000 kịch bản</option>
                  </select>
                </label>
                <div>
                  <small>
                    Phân phối sinh khách: {hotelConfig.distribution.toUpperCase()} · Đối soát ghép cặp 3 chiến lược.
                  </small>
                  <br />
                  <button className="primary" onClick={handleRunMonteCarlo} disabled={busy}>
                    {busy ? 'Đang tính…' : `Chạy ${runCount.toLocaleString('vi-VN')} kịch bản Monte Carlo`}
                  </button>
                </div>
              </div>

              {batch && (() => {
                // Phân loại các kịch bản theo phân vị doanh thu thị trường (Thấp P10, Trung bình P50, Cao P90, Đỉnh Max)
                const sortedByMarket = [...batch.runs].sort((a, b) => (a.revenue.A + a.revenue.B + a.revenue.C) - (b.revenue.A + b.revenue.B + b.revenue.C));
                const pickRun = (pct: number) => sortedByMarket[Math.min(sortedByMarket.length - 1, Math.max(0, Math.floor(sortedByMarket.length * pct)))];
                const scenarioTiers = [
                  { name: 'Kịch bản Thấp điểm / Cầu yếu (P10)', desc: 'Lượng khách đến thấp hơn dự báo', run: pickRun(0.1) },
                  { name: 'Kịch bản Cơ sở / Kỳ vọng (P50 - Median)', desc: 'Lượng khách bám sát mức dự báo trung bình', run: pickRun(0.5) },
                  { name: 'Kịch bản Cao điểm / Cầu tăng mạnh (P90)', desc: 'Nhu cầu thị trường tăng cao, cháy phòng sớm', run: pickRun(0.9) },
                  { name: 'Kịch bản Đỉnh đột biến (Max Peak)', desc: 'Kịch bản nhu cầu bùng nổ mạnh nhất', run: pickRun(0.99) }
                ];
                const sampleRunsChart = batch.runs.slice(0, 40).map((r, idx) => ({
                  scenario: `#${idx + 1}`,
                  A: Math.round(r.revenue.A / 1e6 * 10) / 10,
                  B: Math.round(r.revenue.B / 1e6 * 10) / 10,
                  C: Math.round(r.revenue.C / 1e6 * 10) / 10
                }));

                return (
                  <>
                    <div className="section-heading">
                      <h3>1. Phân phối doanh thu tổng hợp trên {batch.n} kịch bản</h3>
                      <button onClick={handleDownloadMonteCarloCsv}>Tải CSV từng kịch bản</button>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Chiến lược</th>
                            <th>Doanh thu TB</th>
                            <th>Trung vị (P50)</th>
                            <th>Độ lệch chuẩn</th>
                            <th>Kịch bản Min – Max</th>
                            <th>Khoảng tin cậy 95% CI</th>
                            <th>Lấp đầy TB</th>
                            <th>Tỷ lệ thắng</th>
                          </tr>
                        </thead>
                        <tbody>
                          {batch.rows.map(r => (
                            <tr key={r.policy}>
                              <td>
                                <b>{r.policy}</b> · {LABELS[r.policy]}
                              </td>
                              <td><b>{MONEY(r.mean)}</b></td>
                              <td>{MONEY(r.median)}</td>
                              <td>{MONEY(r.sd)}</td>
                              <td>
                                {MONEY(r.min)} – {MONEY(r.max)}
                              </td>
                              <td>
                                {MONEY(r.ci95Low)} – {MONEY(r.ci95High)}
                              </td>
                              <td>{NUM(r.occupancy)}%</td>
                              <td><strong>{NUM(r.winRate)}%</strong></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <h3 style={{ marginTop: 20 }}>2. So sánh chi tiết giữa các Kịch bản thị trường (Thấp điểm · Cơ sở · Cao điểm)</h3>
                    <p>Đối chiếu kết quả 3 chiến lược trong từng kịch bản đại diện để đánh giá sức chống chịu rủi ro và khả năng tối đa hóa doanh thu.</p>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Phân loại kịch bản</th>
                            <th>Seed</th>
                            <th>Chiến lược A (FCFS)</th>
                            <th>Chiến lược B (EMSR-b)</th>
                            <th>Chiến lược C (Dynamic + EMSR-b)</th>
                            <th>Lợi ích tăng thêm (C so với A)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scenarioTiers.map((sc, i) => {
                            if (!sc.run) return null;
                            const diffCA = sc.run.revenue.C - sc.run.revenue.A;
                            const pctCA = sc.run.revenue.A > 0 ? (diffCA / sc.run.revenue.A) * 100 : 0;
                            return (
                              <tr key={i}>
                                <td>
                                  <strong>{sc.name}</strong>
                                  <br />
                                  <small style={{ color: '#64748b' }}>{sc.desc}</small>
                                </td>
                                <td>Seed #{sc.run.seed}</td>
                                <td>{MONEY(sc.run.revenue.A)} ({sc.run.sold.A}p)</td>
                                <td><b>{MONEY(sc.run.revenue.B)}</b> ({sc.run.sold.B}p)</td>
                                <td><b style={{ color: '#007f72' }}>{MONEY(sc.run.revenue.C)}</b> ({sc.run.sold.C}p)</td>
                                <td>
                                  <strong style={{ color: diffCA >= 0 ? '#078778' : '#c2410c' }}>
                                    {diffCA >= 0 ? '+' : ''}{MONEY(diffCA)} ({diffCA >= 0 ? '+' : ''}{NUM(pctCA)}%)
                                  </strong>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <h3 style={{ marginTop: 20 }}>3. Biểu đồ đối chiếu doanh thu qua các kịch bản ngẫu nhiên (Triệu đồng)</h3>
                    <p>Trực quan hóa sự vượt trội của Chiến lược C (màu xanh ngọc) và Chiến lược B (màu vàng cam) so với Chiến lược A (màu xám) qua các kịch bản.</p>
                    <div style={{ height: 250, marginBottom: 18 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sampleRunsChart}>
                          <CartesianGrid strokeDasharray="3 4" vertical={false} />
                          <Legend />
                          <XAxis dataKey="scenario" tickLine={false} />
                          <YAxis tickLine={false} width={45} unit=" tr" />
                          <Tooltip formatter={(v: number, n: string) => [`${NUM(v)} triệu đ`, n]} />
                          {(['A', 'B', 'C'] as const).map(p => (
                            <Line key={p} dataKey={p} name={`${p} · ${LABELS[p]}`} stroke={COLORS[p]} strokeWidth={2} dot={false} isAnimationActive={false} />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <h3>4. So sánh ghép cặp chênh lệch doanh thu (Paired Differences)</h3>
                    <p>Hiệu số dương chứng minh chiến lược bên trái tạo ra doanh thu cao hơn trong cùng một kịch bản thị trường.</p>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Cặp đối sánh</th>
                            <th>Chênh lệch TB</th>
                            <th>Trung vị</th>
                            <th>Độ lệch chuẩn</th>
                            <th>Min – Max</th>
                            <th>Khoảng tin cậy 95% CI</th>
                            <th>Tỷ lệ thắng</th>
                            <th>Tỷ lệ hòa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {batch.pairs.map(x => (
                            <tr key={x.label}>
                              <td><strong>{x.label}</strong></td>
                              <td>
                                <b style={{ color: '#007f72' }}>{MONEY(x.mean)}</b>
                              </td>
                              <td>{MONEY(x.median)}</td>
                              <td>{MONEY(x.sd)}</td>
                              <td>
                                {MONEY(x.min)} – {MONEY(x.max)}
                              </td>
                              <td>
                                {MONEY(x.ci95Low)} – {MONEY(x.ci95High)}
                              </td>
                              <td><strong>{NUM(x.winRate)}%</strong></td>
                              <td>{NUM(x.tieRate)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <small>
                      {batch.n.toLocaleString('vi-VN')} kịch bản · Seed {batch.start}–{batch.end} · Kiểm định ghép cặp Monte Carlo · CI 95% là khoảng tin cậy cho kỳ vọng trung bình.
                    </small>
                  </>
                );
              })()}
            </section>
          )}

          <footer>
            <span>revRoom RMaaS · NỀN TẢNG TỐI ƯU HÓA DOANH THU & ĐỊNH GIÁ PHÒNG KHÁCH SẠN</span>
            <span>Peter Belobaba (MIT) EMSR-b · Dynamic Pricing Pace Heuristic</span>
          </footer>
        </main>
      </div>
    </>
  );
}
