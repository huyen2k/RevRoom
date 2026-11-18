import React from 'react';
import { TrendingUp, Zap, Sparkles, CheckCircle2, AlertTriangle, Layers, Percent, Sliders, Building2 } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import type { Config, Day } from './model/types';
import type { HotelConfig, HotelDayRecord } from './services/hotelSimulationService';

const MONEY = (n: number) => Math.round(n).toLocaleString('vi-VN') + ' đ';
const NUM = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });

interface StrategyCViewProps {
  // Cấu hình dịch vụ định giá khách sạn đối tác (RMaaS)
  hotelConfig?: HotelConfig;
  hotelHistoriesC?: HotelDayRecord[];
  hotelHistoriesB?: HotelDayRecord[];
  hotelHistoriesA?: HotelDayRecord[];
  currentDay: number;
  // Cấu hình tương thích ngược (fallback)
  config?: Config;
  historiesC?: Day[];
  historiesB?: Day[];
  historiesA?: Day[];
}

export default function StrategyCView({
  hotelConfig,
  hotelHistoriesC,
  hotelHistoriesB,
  hotelHistoriesA,
  config,
  historiesC,
  historiesB,
  historiesA,
  currentDay
}: StrategyCViewProps) {
  const hotelName = hotelConfig?.hotelName || 'Khách sạn đối tác';
  const capacity = hotelConfig?.capacity || config?.capacity || 100;
  const fareClasses = hotelConfig?.fareClasses || [
    { id: 'c1', name: 'Du lịch (Early Bird)', price: config?.prices[0] || 400000, meanDemand: config?.demands[0] || 100 },
    { id: 'c2', name: 'Tiêu chuẩn (Standard)', price: config?.prices[1] || 700000, meanDemand: config?.demands[1] || 70 },
    { id: 'c3', name: 'Thương gia (Business/VIP)', price: config?.prices[2] || 1200000, meanDemand: config?.demands[2] || 40 }
  ];

  let revenueC = 0;
  let revenueB = 0;
  let revenueA = 0;
  let soldC = 0;
  let currentMultiplier = 1;
  let currentPricesByClass: Record<string, number> = {};

  if (hotelHistoriesC && hotelHistoriesC.length > 0) {
    const curC = hotelHistoriesC[currentDay - 1] || hotelHistoriesC[hotelHistoriesC.length - 1];
    const curB = hotelHistoriesB ? (hotelHistoriesB[currentDay - 1] || hotelHistoriesB[hotelHistoriesB.length - 1]) : undefined;
    const curA = hotelHistoriesA ? (hotelHistoriesA[currentDay - 1] || hotelHistoriesA[hotelHistoriesA.length - 1]) : undefined;
    revenueC = curC?.cumulativeRevenue ?? 0;
    revenueB = curB?.cumulativeRevenue ?? 0;
    revenueA = curA?.cumulativeRevenue ?? 0;
    soldC = curC?.cumulativeSold ?? 0;
    currentMultiplier = curC?.priceMultiplier ?? 1;
    currentPricesByClass = curC?.pricesByClass ?? {};
  } else if (historiesC && historiesC.length > 0) {
    const curC = historiesC[currentDay - 1] || historiesC[historiesC.length - 1];
    const curB = historiesB ? (historiesB[currentDay - 1] || historiesB[historiesB.length - 1]) : undefined;
    const curA = historiesA ? (historiesA[currentDay - 1] || historiesA[historiesA.length - 1]) : undefined;
    revenueC = curC?.revenue ?? 0;
    revenueB = curB?.revenue ?? 0;
    revenueA = curA?.revenue ?? 0;
    soldC = curC?.sold ?? 0;
    currentMultiplier = curC?.priceMultiplier ?? 1;
    currentPricesByClass = {
      [fareClasses[0]?.id || 'c1']: curC?.prices[0] ?? fareClasses[0]?.price,
      [fareClasses[1]?.id || 'c2']: curC?.prices[1] ?? fareClasses[1]?.price,
      [fareClasses[2]?.id || 'c3']: curC?.prices[2] ?? fareClasses[2]?.price
    };
  }

  const diffVsA = revenueC - revenueA;
  const diffPercentA = revenueA > 0 ? (diffVsA / revenueA) * 100 : 0;
  const diffVsB = revenueC - revenueB;
  const diffPercentB = revenueB > 0 ? (diffVsB / revenueB) * 100 : 0;
  const occupancyC = capacity > 0 ? (soldC / capacity) * 100 : 0;
  const adrC = soldC > 0 ? revenueC / soldC : 0;
  const revparC = capacity > 0 ? revenueC / capacity : 0;

  // Dữ liệu biểu đồ biến động giá của từng hạng phòng qua 30 ngày
  const priceChartData = (hotelHistoriesC || historiesC || []).slice(0, currentDay).map(d => {
    const row: Record<string, number> = {
      day: d.day,
      multiplier: d.priceMultiplier
    };
    if ('pricesByClass' in d) {
      fareClasses.forEach(fc => {
        row[`p_${fc.id}`] = d.pricesByClass[fc.id] ?? fc.price;
      });
    } else if ('prices' in d) {
      row['p_c1'] = d.prices[0];
      row['p_c2'] = d.prices[1];
      row['p_c3'] = d.prices[2];
    }
    return row;
  });

  return (
    <div className="strategy-detail-container">
      {/* Hero Chiến lược C */}
      <section className="panel" style={{ borderTop: '4px solid #078778' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="policy-letter" style={{ background: '#078778' }}>C</span>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Chiến lược C · Dynamic Pricing + EMSR-b</h2>
              <small style={{ color: '#82949e' }}>Định giá động theo nhịp độ đặt phòng kết hợp bảo vệ hạn mức EMSR-b</small>
            </div>
          </div>
          <span className="outline-tag" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Building2 size={13} /> {hotelName} ({capacity} phòng)
          </span>
        </div>
      </section>

      {/* KPI Cards của C */}
      <div className="kpi-grid">
        <div className="panel kpi" style={{ borderTopColor: '#078778' }}>
          <div className="kpi-label">DOANH THU TỐI ĐA (C)</div>
          <div className="revenue">{NUM(revenueC / 1e6)} <small>triệu đ</small></div>
          <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: '#007b6d' }}>
            ▲ +{MONEY(Math.abs(diffVsA))} (+{NUM(diffPercentA)}% so với FCFS)
          </div>
          <div style={{ fontSize: 10, color: diffVsB >= 0 ? '#007b6d' : '#82949e', marginTop: 2 }}>
            {diffVsB >= 0 ? `▲ +${MONEY(diffVsB)} (+${NUM(diffPercentB)}% so với EMSR-b)` : `So với EMSR-b: ${MONEY(diffVsB)}`}
          </div>
        </div>

        <div className="panel kpi" style={{ borderTopColor: '#078778' }}>
          <div className="kpi-label">HỆ SỐ GIÁ & GIÁ HÔM NAY (NGÀY {currentDay})</div>
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: '#82949e' }}>Hệ số điều chỉnh (Pace Multiplier):</span>
              <strong style={{ color: '#078778', fontSize: 13 }}>
                x{currentMultiplier.toFixed(3)}
              </strong>
            </div>
            {fareClasses.map(fc => (
              <div key={fc.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: '#82949e' }}>{fc.name}:</span>
                <strong>{MONEY(currentPricesByClass[fc.id] ?? fc.price)}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="panel kpi" style={{ borderTopColor: '#078778' }}>
          <div className="kpi-label">CHỈ SỐ HIỆU SUẤT KHÁCH SẠN (C)</div>
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: '#82949e' }}>Giá bình quân (ADR):</span>
              <strong style={{ color: '#14394a' }}>{MONEY(adrC)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: '#82949e' }}>Doanh thu/phòng (RevPAR):</span>
              <strong style={{ color: '#007b6d' }}>{MONEY(revparC)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: '#82949e' }}>Tỷ lệ lấp đầy:</span>
              <strong style={{ color: '#14394a' }}>{NUM(occupancyC)}% ({soldC}/{capacity} phòng)</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: 2 Cột */}
      <div className="grid2" style={{ alignItems: 'start' }}>
        {/* CỘT TRÁI: CƠ CHẾ KÉP & ĐỘ NHẠY CẢM GIÁ */}
        <div style={{ display: 'grid', gap: 14 }}>
          <section className="panel">
            <h3 style={{ fontSize: 13, margin: '0 0 10px', color: '#14394a' }}>Cơ chế Định giá theo Nhịp độ đặt phòng (Booking Pace)</h3>
            <p style={{ fontSize: 11, color: '#617987', lineHeight: 1.7, margin: '0 0 10px' }}>
              Công thức điều chỉnh hệ số giá động theo ngày của khách sạn:
            </p>
            <div style={{ background: '#f5f9f8', padding: 12, borderRadius: 8, fontSize: 11, color: '#007b6d', lineHeight: 1.8 }}>
              <code>
                Multiplier(d) = 1 + k * (Đã bán / Sức chứa - (d - 1) / 30)<br />
                Giới hạn cắt hệ số: [Min Multiplier, Max Multiplier]<br />
                Giá chào hôm nay = Làm tròn đến 10.000 đ (Giá cơ sở * Multiplier)
              </code>
            </div>
            <p style={{ fontSize: 11, color: '#617987', lineHeight: 1.7, marginTop: 10 }}>
              Khi phòng bán chạy, giá tăng tự động để chặn bớt khách giá rẻ và thu thêm thặng dư từ khách trả giá cao.
              Ngược lại khi thị trường vắng, giá giảm nhẹ để kích cầu nhanh chóng.
            </p>
          </section>

          <section className="panel">
            <h3 style={{ fontSize: 13, margin: '0 0 8px', color: '#14394a' }}>Tại sao Chiến lược C tạo doanh thu cao nhất?</h3>
            <ul style={{ fontSize: 11, color: '#617987', paddingLeft: 18, lineHeight: 1.8, margin: 0 }}>
              <li>
                <strong>Tối đa hóa WTP:</strong> Không bỏ phí bất kỳ đồng thặng dư nào khi nhu cầu du lịch bùng nổ.
              </li>
              <li>
                <strong>Hai lớp phòng ngự:</strong> Vừa tăng giá để lọc khách, vừa có rào chắn hạn mức EMSR-b để giữ phòng cho khách VIP đến muộn.
              </li>
              <li>
                <strong>Cân bằng hoàn hảo:</strong> Đạt cả tỷ lệ lấp đầy cao lẫn giá bình quân ADR cao nhất thị trường.
              </li>
            </ul>
          </section>
        </div>

        {/* CỘT PHẢI: BIỂU ĐỒ BIẾN ĐỘNG GIÁ CỦA CÁC HẠNG GIÁ */}
        <div style={{ display: 'grid', gap: 14 }}>
          <section className="panel chart-panel">
            <h3 style={{ fontSize: 13, margin: '0 0 4px', color: '#14394a' }}>
              Biến động giá {fareClasses.length} hạng phòng theo ngày (Chiến lược C)
            </h3>
            <p style={{ fontSize: 11, color: '#82949e', margin: '0 0 12px' }}>
              Mức giá thực tế được điều chỉnh thích ứng theo nhịp độ Booking Pace từng ngày
            </p>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={priceChartData}>
                  <CartesianGrid strokeDasharray="3 4" vertical={false} />
                  <Legend />
                  <XAxis dataKey="day" tickLine={false} />
                  <YAxis tickLine={false} tickFormatter={v => `${Math.round(v / 1e3)}k`} width={50} />
                  <Tooltip labelFormatter={v => `Ngày ${v}`} formatter={(val: number) => [MONEY(val), 'Giá']} />
                  {fareClasses.map((fc, i) => (
                    <Line
                      key={fc.id}
                      dataKey={`p_${fc.id}`}
                      name={fc.name}
                      stroke={i === 0 ? '#64748b' : i === 1 ? '#d18a2e' : '#078778'}
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
              Khuyến nghị cho Giám đốc Khách sạn & Chuyên viên RM
            </h3>
            <div style={{ background: '#edf7f4', border: '1px solid #b2dfd6', borderRadius: 8, padding: 12, fontSize: 11, color: '#134e4a', lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 6px' }}>
                🚀 <strong>Chiến lược chủ lực của RevRoom RMaaS:</strong> Đem lại mức tăng trưởng doanh thu kỷ lục từ 25–38% so với phương pháp bán phòng truyền thống FCFS.
              </p>
              <p style={{ margin: 0 }}>
                📊 Khách sạn chỉ cần cập nhật dữ liệu đặt phòng định kỳ hoặc nạp CSV, hệ thống sẽ tự động cập nhật hệ số giá và hạn mức mở bán mỗi ngày.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
