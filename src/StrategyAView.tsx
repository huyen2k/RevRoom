import React from 'react';
import { Clock, AlertCircle, CheckCircle, HelpCircle, Layers, Users, Hotel, TrendingUp, Building2 } from 'lucide-react';
import type { Config, Day, Segment } from './model/types';
import { SEGMENT_LABELS, SEGMENTS } from './model/types';
import type { HotelConfig, HotelDayRecord } from './services/hotelSimulationService';

const MONEY = (n: number) => Math.round(n).toLocaleString('vi-VN') + ' đ';
const NUM = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });

interface StrategyAViewProps {
  // Cấu hình dịch vụ định giá khách sạn đối tác (RMaaS)
  hotelConfig?: HotelConfig;
  hotelHistoriesA?: HotelDayRecord[];
  currentDay: number;
  onNavigateToTab?: (tab: string) => void;
  // Cấu hình tương thích ngược (fallback)
  config?: Config;
  historiesA?: Day[];
}

export default function StrategyAView({
  hotelConfig,
  hotelHistoriesA,
  config,
  historiesA,
  currentDay
}: StrategyAViewProps) {
  // Lấy dữ liệu theo hotelConfig nếu có, ngược lại fallback về config
  const hotelName = hotelConfig?.hotelName || 'Khách sạn đối tác';
  const capacity = hotelConfig?.capacity || config?.capacity || 100;
  const fareClasses = hotelConfig?.fareClasses || [
    { id: 'c1', name: 'Du lịch (Early Bird)', price: config?.prices[0] || 400000, meanDemand: config?.demands[0] || 100 },
    { id: 'c2', name: 'Tiêu chuẩn (Standard)', price: config?.prices[1] || 700000, meanDemand: config?.demands[1] || 70 },
    { id: 'c3', name: 'Thương gia (Business/VIP)', price: config?.prices[2] || 1200000, meanDemand: config?.demands[2] || 40 }
  ];

  // Lấy lịch sử ngày hiện tại
  let totalRevenue = 0;
  let totalSold = 0;

  if (hotelHistoriesA && hotelHistoriesA.length > 0) {
    const cur = hotelHistoriesA[currentDay - 1] || hotelHistoriesA[hotelHistoriesA.length - 1];
    totalRevenue = cur?.cumulativeRevenue ?? 0;
    totalSold = cur?.cumulativeSold ?? 0;
  } else if (historiesA && historiesA.length > 0) {
    const cur = historiesA[currentDay - 1] || historiesA[historiesA.length - 1];
    totalRevenue = cur?.revenue ?? 0;
    totalSold = cur?.sold ?? 0;
  }

  const occupancy = capacity > 0 ? (totalSold / capacity) * 100 : 0;
  const adr = totalSold > 0 ? totalRevenue / totalSold : 0;
  const revpar = capacity > 0 ? totalRevenue / capacity : 0;

  // Thống kê số phòng bán theo từng hạng phòng trong A
  const soldByClass: Record<string, number> = {};
  const fullRejectionsByClass: Record<string, number> = {};
  fareClasses.forEach(c => {
    soldByClass[c.id] = 0;
    fullRejectionsByClass[c.id] = 0;
  });

  if (hotelHistoriesA && hotelHistoriesA.length > 0) {
    hotelHistoriesA.slice(0, currentDay).forEach(d => {
      fareClasses.forEach(c => {
        soldByClass[c.id] = (soldByClass[c.id] || 0) + (d.acceptedByClass?.[c.id] || 0);
      });
      d.transactions.forEach(t => {
        if (t.outcome === 'full') {
          fullRejectionsByClass[t.classId] = (fullRejectionsByClass[t.classId] || 0) + 1;
        }
      });
    });
  } else if (historiesA && historiesA.length > 0) {
    historiesA.slice(0, currentDay).forEach(d => {
      d.transactions.forEach(t => {
        const classId = t.segment === 'tourist' ? fareClasses[0]?.id : t.segment === 'standard' ? fareClasses[1]?.id : fareClasses[2]?.id;
        if (classId) {
          if (t.outcome === 'accepted') soldByClass[classId] = (soldByClass[classId] || 0) + 1;
          if (t.outcome === 'full') fullRejectionsByClass[classId] = (fullRejectionsByClass[classId] || 0) + 1;
        }
      });
    });
  }

  // Tổng thiệt hại thất thoát do hết phòng ở các hạng cao (Displacement loss)
  const totalDisplacementLoss = fareClasses.slice(1).reduce((sum, c) => {
    return sum + (fullRejectionsByClass[c.id] || 0) * c.price;
  }, 0);

  return (
    <div className="strategy-detail-container">
      {/* Hero Chiến lược A */}
      <section className="panel" style={{ borderTop: '4px solid #64748b' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="policy-letter" style={{ background: '#64748b' }}>A</span>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Chiến lược A · FCFS (First-Come, First-Served)</h2>
              <small style={{ color: '#82949e' }}>Bán phòng tự do theo thứ tự đến · Giá cố định · Không bảo vệ tồn kho</small>
            </div>
          </div>
          <span className="outline-tag" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Building2 size={13} /> {hotelName} ({capacity} phòng)
          </span>
        </div>
      </section>

      {/* KPI Cards của A */}
      <div className="kpi-grid">
        <div className="panel kpi" style={{ borderTopColor: '#64748b' }}>
          <div className="kpi-label">DOANH THU LŨY KẾ (A)</div>
          <div className="revenue">{NUM(totalRevenue / 1e6)} <small>triệu đ</small></div>
          <small style={{ color: '#82949e', fontSize: 10 }}>Đến hết ngày {currentDay}/30</small>
        </div>
        <div className="panel kpi" style={{ borderTopColor: '#64748b' }}>
          <div className="kpi-label">TỶ LỆ LẤP ĐẦY & PHÒNG ĐÃ BÁN</div>
          <div className="revenue">{totalSold} <small>/ {capacity} phòng</small></div>
          <div className="occupancy">
            <span>Công suất</span>
            <strong>{NUM(occupancy)}%</strong>
          </div>
          <div className="meter"><i style={{ width: `${Math.min(100, occupancy)}%`, background: '#64748b' }} /></div>
        </div>
        <div className="panel kpi" style={{ borderTopColor: '#64748b' }}>
          <div className="kpi-label">CHỈ SỐ HIỆU SUẤT KHÁCH SẠN</div>
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: '#82949e' }}>Giá bình quân (ADR):</span>
              <strong>{MONEY(adr)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: '#82949e' }}>Doanh thu/phòng sẵn có (RevPAR):</span>
              <strong>{MONEY(revpar)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: '#82949e' }}>Ngưỡng bảo vệ tồn kho:</span>
              <strong style={{ color: '#64748b' }}>0 phòng (Không bảo vệ)</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: 2 Cột */}
      <div className="grid2" style={{ alignItems: 'start' }}>
        {/* CỘT TRÁI: MIÊU TẢ CHI TIẾT */}
        <div style={{ display: 'grid', gap: 14 }}>
          <section className="panel">
            <h3 style={{ fontSize: 13, margin: '0 0 10px', color: '#14394a' }}>Nguyên lý hoạt động của FCFS</h3>
            <div style={{ background: '#f5f8f9', padding: 12, borderRadius: 8, fontSize: 11, color: '#14796d', lineHeight: 1.8 }}>
              <code>
                p_1, p_2, ..., p_n = Giá niêm yết cơ sở cố định ({fareClasses.length} hạng giá)<br />
                y_1 = y_2 = ... = 0 (Mức bảo vệ bằng 0)<br />
                Quy tắc nhận phòng: Chấp nhận nếu (WTP ≥ Giá niêm yết) VÀ (Số phòng còn lại &gt; 0)
              </code>
            </div>
            <p style={{ fontSize: 11, color: '#617987', lineHeight: 1.7, marginTop: 10 }}>
              Ở mỗi ngày trong 30 ngày mở bán, hệ thống chào giá cố định theo {fareClasses.length} hạng giá đã thiết lập trong Dịch vụ định giá.
              Khách hàng thuộc phân khúc nào sẽ được đối chiếu WTP với giá của phân khúc đó.
            </p>
          </section>

          <section className="panel">
            <h3 style={{ fontSize: 13, margin: '0 0 10px', color: '#14394a' }}>
              Cạm bẫy doanh thu: "Cháy phòng giá rẻ" (The Spoilage Trap)
            </h3>
            <div style={{ borderLeft: '3px solid #c2410c', paddingLeft: 12, fontSize: 11, color: '#617987', lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 8px' }}>
                Đặc thù thị trường khách sạn là <strong>khách mua hạng giá rẻ luôn đặt phòng từ rất sớm</strong> (đường cầu sớm).
                Trong khi đó, <strong>khách thương nhân/VIP sẵn sàng trả giá cao thường chỉ đặt phòng sát ngày nhận phòng</strong> (đường cầu muộn).
              </p>
              <p style={{ margin: 0 }}>
                Do FCFS không dành chỗ bảo vệ, khách hạng giá rẻ sẽ <strong>mua hết sạch toàn bộ {capacity} phòng trống</strong> ngay trong những ngày đầu.
                Đến những ngày cận check-in, khi khách cao cấp muốn đặt phòng với giá cao gấp 2-3 lần, khách sạn buộc phải từ chối vì đã hết phòng.
                Đây là nguyên nhân chính khiến doanh thu của FCFS luôn thấp hơn đáng kể so với EMSR-b và Dynamic Pricing.
              </p>
            </div>
          </section>

          <section className="panel">
            <h3 style={{ fontSize: 13, margin: '0 0 8px', color: '#14394a' }}>Khi nào khách sạn nên áp dụng FCFS?</h3>
            <ul style={{ fontSize: 11, color: '#617987', paddingLeft: 18, lineHeight: 1.8, margin: 0 }}>
              <li>Khách sạn quy mô nhỏ (dưới 15 phòng), homestay gia đình không có nhân sự quản trị doanh thu.</li>
              <li>Mùa cực kỳ thấp điểm khi tổng nhu cầu thị trường quá yếu, mục tiêu duy nhất là lấp đầy bất kể giá.</li>
              <li>Khi khách sạn chỉ phục vụ một phân khúc khách hàng duy nhất với một mức giá đồng nhất.</li>
            </ul>
          </section>
        </div>

        {/* CỘT PHẢI: PHÂN TÍCH CƠ CẤU KHÁCH HÀNG & THẤT THOÁT */}
        <div style={{ display: 'grid', gap: 14 }}>
          {/* Cơ cấu khách đã mua phòng ở FCFS theo toàn bộ N hạng phòng */}
          <section className="panel">
            <h3 style={{ fontSize: 13, margin: '0 0 12px', color: '#14394a' }}>
              Cơ cấu phòng đã bán theo {fareClasses.length} hạng giá (Chiến lược A)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(130px, 1fr))`, gap: 10 }}>
              {fareClasses.map((fc, idx) => {
                const sold = soldByClass[fc.id] || 0;
                const pct = totalSold > 0 ? (sold / totalSold) * 100 : 0;
                const isCheap = idx === 0;
                const isExpensive = idx === fareClasses.length - 1;

                return (
                  <div
                    key={fc.id}
                    style={{
                      padding: 10,
                      border: '1px solid #e2e9ed',
                      borderRadius: 8,
                      textAlign: 'center',
                      background: isCheap ? '#f8fafc' : isExpensive ? '#f0fdf4' : '#fff'
                    }}
                  >
                    <span className="eyebrow" style={{ color: isCheap ? '#64748b' : isExpensive ? '#078778' : '#d18a2e', fontSize: 10 }}>
                      {fc.name}
                    </span>
                    <strong style={{ fontSize: 17, color: '#14394a', display: 'block', margin: '4px 0' }}>
                      {sold} phòng
                    </strong>
                    <small style={{ color: '#82949e', fontSize: 10 }}>
                      {MONEY(fc.price)} ({NUM(pct)}%)
                    </small>
                  </div>
                );
              })}
            </div>

            {/* Thiệt hại do từ chối khách trả giá cao (Displacement Loss) */}
            <div style={{ marginTop: 14, padding: 12, background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#c53030', fontWeight: 700, fontSize: 11, marginBottom: 4 }}>
                <AlertCircle size={15} /> Thất thoát do từ chối khách giá cao vì hết phòng sớm:
              </div>
              <p style={{ margin: '0 0 8px', fontSize: 11, color: '#4a5568', lineHeight: 1.6 }}>
                Tổng thiệt hại ước tính: <strong>{MONEY(totalDisplacementLoss)}</strong> vì cháy phòng sớm!
              </p>
              <div style={{ display: 'grid', gap: 4, fontSize: 10, color: '#64748b' }}>
                {fareClasses.slice(1).map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Từ chối {c.name} ({MONEY(c.price)}):</span>
                    <strong style={{ color: '#c2410c' }}>{fullRejectionsByClass[c.id] || 0} khách</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Bảng tiến độ theo ngày của A */}
          <section className="panel">
            <h3 style={{ fontSize: 13, margin: '0 0 10px', color: '#14394a' }}>Nhật ký 10 ngày gần nhất (Chiến lược A)</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th>Khách đến</th>
                    <th>Đã bán ngày</th>
                    <th>Từ chối hết phòng</th>
                    <th>Doanh thu ngày</th>
                    <th>Còn lại</th>
                  </tr>
                </thead>
                <tbody>
                  {((hotelHistoriesA && hotelHistoriesA.length > 0
                    ? hotelHistoriesA.slice(Math.max(0, currentDay - 10), currentDay)
                    : (historiesA || []).slice(Math.max(0, currentDay - 10), currentDay)
                  ) as Array<HotelDayRecord | Day>).map(d => {
                    const dailyAccepted = 'acceptedCount' in d ? d.acceptedCount : d.accepted;
                    const dailyFull = 'rejectedFullCount' in d ? d.rejectedFullCount : d.full;
                    const dailyRev = d.dailyRevenue;
                    const remaining = 'remainingRooms' in d ? d.remainingRooms : d.remaining;
                    const potential = 'potentialCustomers' in d ? d.potentialCustomers : d.potential;

                    return (
                      <tr key={d.day}>
                        <td>Ngày {d.day}</td>
                        <td>{potential}</td>
                        <td><strong>{dailyAccepted}</strong></td>
                        <td style={{ color: dailyFull > 0 ? '#c2410c' : '#82949e', fontWeight: dailyFull > 0 ? 700 : 400 }}>
                          {dailyFull}
                        </td>
                        <td>{MONEY(dailyRev)}</td>
                        <td>{remaining}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
