import React from 'react';
import { ShieldCheck, CheckCircle2, TrendingUp, AlertTriangle, Layers, Percent, BarChart3, HelpCircle, Building2 } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import type { Config, Day } from './model/types';
import type { HotelConfig, HotelDayRecord } from './services/hotelSimulationService';

const MONEY = (n: number) => Math.round(n).toLocaleString('vi-VN') + ' đ';
const NUM = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });

interface StrategyBViewProps {
  // Cấu hình dịch vụ định giá khách sạn đối tác (RMaaS)
  hotelConfig?: HotelConfig;
  hotelHistoriesB?: HotelDayRecord[];
  hotelHistoriesA?: HotelDayRecord[];
  currentDay: number;
  // Cấu hình tương thích ngược (fallback)
  config?: Config;
  historiesB?: Day[];
  historiesA?: Day[];
}

export default function StrategyBView({
  hotelConfig,
  hotelHistoriesB,
  hotelHistoriesA,
  config,
  historiesB,
  historiesA,
  currentDay
}: StrategyBViewProps) {
  const hotelName = hotelConfig?.hotelName || 'Khách sạn đối tác';
  const capacity = hotelConfig?.capacity || config?.capacity || 100;
  const fareClasses = hotelConfig?.fareClasses || [
    { id: 'c1', name: 'Du lịch (Early Bird)', price: config?.prices[0] || 400000, meanDemand: config?.demands[0] || 100 },
    { id: 'c2', name: 'Tiêu chuẩn (Standard)', price: config?.prices[1] || 700000, meanDemand: config?.demands[1] || 70 },
    { id: 'c3', name: 'Thương gia (Business/VIP)', price: config?.prices[2] || 1200000, meanDemand: config?.demands[2] || 40 }
  ];

  let revenueB = 0;
  let revenueA = 0;
  let soldB = 0;
  let remainingB = capacity;
  let protectedRejections = 0;

  let currentProtectionByClass: Record<string, number> = {};
  let currentBookingLimitsByClass: Record<string, number> = {};

  if (hotelHistoriesB && hotelHistoriesB.length > 0) {
    const curB = hotelHistoriesB[currentDay - 1] || hotelHistoriesB[hotelHistoriesB.length - 1];
    const curA = hotelHistoriesA ? (hotelHistoriesA[currentDay - 1] || hotelHistoriesA[hotelHistoriesA.length - 1]) : undefined;
    revenueB = curB?.cumulativeRevenue ?? 0;
    revenueA = curA?.cumulativeRevenue ?? 0;
    soldB = curB?.cumulativeSold ?? 0;
    remainingB = curB?.remainingRooms ?? capacity;
    currentProtectionByClass = curB?.protectionByClass ?? {};
    currentBookingLimitsByClass = curB?.bookingLimitsByClass ?? {};
    protectedRejections = hotelHistoriesB.slice(0, currentDay).reduce((sum, d) => sum + d.rejectedProtectedCount, 0);
  } else if (historiesB && historiesB.length > 0) {
    const curB = historiesB[currentDay - 1] || historiesB[historiesB.length - 1];
    const curA = historiesA ? (historiesA[currentDay - 1] || historiesA[historiesA.length - 1]) : undefined;
    revenueB = curB?.revenue ?? 0;
    revenueA = curA?.revenue ?? 0;
    soldB = curB?.sold ?? 0;
    remainingB = curB?.remaining ?? capacity;
    currentProtectionByClass = {
      [fareClasses[0]?.id || 'c1']: curB?.protection[0] ?? 0,
      [fareClasses[1]?.id || 'c2']: curB?.protection[1] ?? 0
    };
    protectedRejections = historiesB.slice(0, currentDay).reduce((sum, d) => sum + d.protected, 0);
  }

  const diffRevenue = revenueB - revenueA;
  const diffPercent = revenueA > 0 ? (diffRevenue / revenueA) * 100 : 0;
  const occupancyB = capacity > 0 ? (soldB / capacity) * 100 : 0;
  const adrB = soldB > 0 ? revenueB / soldB : 0;
  const revparB = capacity > 0 ? revenueB / capacity : 0;

  // Dữ liệu biểu đồ protection level qua các ngày
  const chartData = (hotelHistoriesB || historiesB || []).slice(0, currentDay).map(d => {
    const sold = 'cumulativeSold' in d ? d.cumulativeSold : d.sold;
    const remaining = 'remainingRooms' in d ? d.remainingRooms : d.remaining;
    const row: Record<string, number> = {
      day: d.day,
      sold,
      remaining
    };

    if ('protectionByClass' in d) {
      fareClasses.forEach(fc => {
        row[`prot_${fc.id}`] = d.protectionByClass[fc.id] ?? 0;
      });
    } else if ('protection' in d) {
      row['prot_y1'] = d.protection[0] ?? 0;
      row['prot_y2'] = d.protection[1] ?? 0;
    }
    return row;
  });

  return (
    <div className="strategy-detail-container">
      {/* Hero Chiến lược B */}
      <section className="panel" style={{ borderTop: '4px solid #d18a2e' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="policy-letter" style={{ background: '#d18a2e' }}>B</span>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Chiến lược B · EMSR-b (Bảo vệ hạn mức tồn kho)</h2>
              <small style={{ color: '#82949e' }}>Giá cố định · Bảo vệ hạn mức phòng cho các hạng phòng giá cao</small>
            </div>
          </div>
          <span className="outline-tag" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Building2 size={13} /> {hotelName} ({capacity} phòng)
          </span>
        </div>
      </section>

      {/* KPI Cards của B */}
      <div className="kpi-grid">
        <div className="panel kpi" style={{ borderTopColor: '#d18a2e' }}>
          <div className="kpi-label">DOANH THU LŨY KẾ (B)</div>
          <div className="revenue">{NUM(revenueB / 1e6)} <small>triệu đ</small></div>
          <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: diffRevenue >= 0 ? '#007b6d' : '#c2410c' }}>
            {diffRevenue >= 0 ? '▲ Tăng ' : '▼ Giảm '}
            {MONEY(Math.abs(diffRevenue))} ({diffRevenue >= 0 ? '+' : ''}{NUM(diffPercent)}% so với FCFS)
          </div>
        </div>

        <div className="panel kpi" style={{ borderTopColor: '#d18a2e' }}>
          <div className="kpi-label">NGƯỠNG BẢO VỆ TỒN KHO HÔM NAY</div>
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            {fareClasses.map((fc, idx) => {
              const prot = currentProtectionByClass[fc.id] ?? 0;
              const bl = currentBookingLimitsByClass[fc.id] ?? remainingB;
              const isTop = idx === fareClasses.length - 1;

              return (
                <div key={fc.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: '#82949e' }}>{fc.name}:</span>
                  <strong style={{ color: isTop ? '#007b6d' : prot > 0 ? '#d18a2e' : '#64748b' }}>
                    {isTop ? 'Mở bán toàn bộ' : `Bảo vệ: ${prot} phòng (Hạn mức: ${bl})`}
                  </strong>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel kpi" style={{ borderTopColor: '#d18a2e' }}>
          <div className="kpi-label">CHỈ SỐ HIỆU SUẤT KHÁCH SẠN (B)</div>
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: '#82949e' }}>Giá bình quân (ADR):</span>
              <strong style={{ color: '#14394a' }}>{MONEY(adrB)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: '#82949e' }}>Doanh thu/phòng (RevPAR):</span>
              <strong style={{ color: '#007b6d' }}>{MONEY(revparB)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: '#82949e' }}>Số lượt bảo vệ phòng thành công:</span>
              <strong style={{ color: '#d18a2e' }}>{protectedRejections} lượt từ chối hạng thấp</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: 2 Cột */}
      <div className="grid2" style={{ alignItems: 'start' }}>
        {/* CỘT TRÁI: NGUYÊN LÝ THUẬT TOÁN & BẢO VỆ LỒNG NHAU */}
        <div style={{ display: 'grid', gap: 14 }}>
          <section className="panel">
            <h3 style={{ fontSize: 13, margin: '0 0 10px', color: '#14394a' }}>Thuật toán EMSR-b hoạt động như thế nào?</h3>
            <p style={{ fontSize: 11, color: '#617987', lineHeight: 1.7, margin: '0 0 10px' }}>
              Khi một khách hàng muốn đặt phòng ở lớp giá thấp $p_i$, khách sạn đối mặt với sự đánh đổi kinh tế:
            </p>
            <div style={{ background: '#f5f9f8', padding: 12, borderRadius: 8, fontSize: 11, color: '#007b6d', lineHeight: 1.8 }}>
              • <strong>Bán ngay:</strong> Chắc chắn thu được $p_i$ hôm nay.<br />
              • <strong>Từ chối để chờ:</strong> Cơ hội bán cho lớp giá cao hơn p̄ với xác suất P(S &gt; y).<br />
              • <strong>Điều kiện tới hạn (Littlewood / Belobaba):</strong> Bán khi và chỉ khi:<br />
              <code>p_i &gt;= p̄ * P(Nhu cầu các lớp cao hơn &gt; y)</code>
            </div>
            <p style={{ fontSize: 11, color: '#617987', lineHeight: 1.7, marginTop: 10 }}>
              Từ đó suy ra phân vị tới hạn: <code>CR = 1 - p_i / p̄</code>. Mức bảo vệ y là lượng phòng sao cho xác suất nhu cầu các hạng cao vượt quá y đúng bằng p_i / p̄.
            </p>
          </section>

          <section className="panel">
            <h3 style={{ fontSize: 13, margin: '0 0 10px', color: '#14394a' }}>
              Bảo vệ hạn mức lồng nhau (Nested Protection Levels)
            </h3>
            <p style={{ fontSize: 11, color: '#617987', lineHeight: 1.7, margin: '0 0 8px' }}>
              Trong cấu hình {fareClasses.length} hạng giá của khách sạn:
            </p>
            <ul style={{ fontSize: 11, color: '#617987', paddingLeft: 18, lineHeight: 1.8, margin: 0 }}>
              <li>
                Hạng cao nhất được mở bán toàn bộ số phòng trống còn lại mà không có rào cản.
              </li>
              <li>
                Các hạng trung gian và thấp hơn lần lượt bị khóa khi số phòng trống chạm mức bảo vệ tương ứng.
              </li>
              <li>
                Cơ chế này loại bỏ hoàn toàn hiện tượng "cháy phòng non" của FCFS và giúp ADR của khách sạn tăng vọt.
              </li>
            </ul>
          </section>
        </div>

        {/* CỘT PHẢI: BIỂU ĐỒ BẢO VỆ QUA CÁC NGÀY */}
        <div style={{ display: 'grid', gap: 14 }}>
          <section className="panel chart-panel">
            <h3 style={{ fontSize: 13, margin: '0 0 4px', color: '#14394a' }}>
              Diễn biến ngưỡng bảo vệ và số phòng đã bán qua các ngày (B)
            </h3>
            <p style={{ fontSize: 11, color: '#82949e', margin: '0 0 12px' }}>
              Khi phòng bán tăng dần (sold), các ngưỡng bảo vệ điều chỉnh tương ứng với tồn kho còn lại
            </p>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 4" vertical={false} />
                  <Legend />
                  <XAxis dataKey="day" tickLine={false} />
                  <YAxis domain={[0, capacity]} tickLine={false} width={40} />
                  <Tooltip labelFormatter={v => `Ngày ${v}`} />
                  <Line dataKey="sold" name="Phòng đã bán" stroke="#14394a" strokeWidth={2.5} dot={false} />
                  <Line dataKey="remaining" name="Phòng còn trống" stroke="#64748b" strokeDasharray="3 3" dot={false} />
                  {fareClasses.slice(0, -1).map((fc, i) => (
                    <Line
                      key={fc.id}
                      dataKey={`prot_${fc.id}`}
                      name={`Ngưỡng bảo vệ (${fc.name})`}
                      stroke={i === 0 ? '#d18a2e' : '#078778'}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel">
            <h3 style={{ fontSize: 13, margin: '0 0 10px', color: '#14394a' }}>
              Đánh giá thực tế cho Giám đốc Quản trị doanh thu
            </h3>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, fontSize: 11, color: '#475569', lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 6px' }}>
                ✅ <strong>Ưu điểm vượt trội:</strong> Giữ nguyên bảng giá niêm yết quen thuộc với khách hàng nhưng tăng doanh thu từ 15–25% nhờ phân bổ thông minh.
              </p>
              <p style={{ margin: 0 }}>
                💡 <strong>Lưu ý vận hành:</strong> Cần kết hợp theo dõi nhịp độ bán hàng ngày. Nếu thị trường có biến động nhu cầu đột ngột, việc chuyển sang <strong>Chiến lược C (Dynamic Pricing)</strong> sẽ giúp tối đa hóa doanh thu thêm một nấc nữa.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
