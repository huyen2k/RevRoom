import React, { useState } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import {
  parseHistoricalBookingCsv,
  generateSeasonHotelHistoryCsv,
  HOTEL_SEASONS,
  type SeasonType,
  type HistoricalDatasetSummary
} from './services/historicalDataService';
import type { CustomFareClass } from './services/emsrN';

const MONEY = (n: number) => Math.round(n).toLocaleString('vi-VN') + ' đ';

interface HistoricalDataViewProps {
  onApplyForecastToService: (classes: CustomFareClass[], summary?: HistoricalDatasetSummary) => void;
  onApplyForecastToSimulation?: (demands: [number, number, number], prices: [number, number, number]) => void;
}

export default function HistoricalDataView({
  onApplyForecastToService,
  onApplyForecastToSimulation
}: HistoricalDataViewProps) {
  const [dataSummary, setDataSummary] = useState<HistoricalDatasetSummary | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<SeasonType>('q3_peak');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const convertSegmentsToClasses = (summary: HistoricalDatasetSummary): CustomFareClass[] => {
    return summary.segments.map((seg, idx) => ({
      id: `class_fc_${idx + 1}`,
      name: seg.segmentName,
      price: Math.max(100000, Math.round(seg.avgRate / 10000) * 10000),
      meanDemand: Math.max(10, seg.forecastDemand30d),
      sdDemand: seg.dailySdDemand * Math.sqrt(30)
    }));
  };

  const handleSelectSeason = (seasonKey: SeasonType) => {
    setSelectedSeason(seasonKey);
    setErrorMsg(null);
    setTimeout(() => {
      try {
        const seasonInfo = HOTEL_SEASONS.find(s => s.key === seasonKey);
        const csvContent = generateSeasonHotelHistoryCsv(seasonKey);
        const summary = parseHistoricalBookingCsv(csvContent);
        setDataSummary(summary);
        const extractedClasses = convertSegmentsToClasses(summary);
        onApplyForecastToService(extractedClasses, summary);
        setSuccessMsg(`Đã nạp ${summary.totalRecords.toLocaleString('vi-VN')} đơn đặt phòng [${seasonInfo?.quarterName}].`);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Lỗi nạp dữ liệu mùa vụ.');
      }
    }, 80);
  };

  const handleDownloadCurrentSeasonCsv = () => {
    const seasonInfo = HOTEL_SEASONS.find(s => s.key === selectedSeason) || HOTEL_SEASONS[2];
    const csvContent = generateSeasonHotelHistoryCsv(selectedSeason);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = seasonInfo.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const text = evt.target?.result as string;
        const summary = parseHistoricalBookingCsv(text);
        setDataSummary(summary);

        const extractedClasses = convertSegmentsToClasses(summary);
        onApplyForecastToService(extractedClasses, summary);

        setSuccessMsg(`Đã phân tích ${summary.totalRecords.toLocaleString('vi-VN')} đơn từ file "${file.name}".`);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Lỗi đọc file CSV.');
      }
    };
    reader.onerror = () => setErrorMsg('Không thể đọc file đã chọn.');
    reader.readAsText(file);
  };

  return (
    <div className="historical-view-container">
      {/* 4 BỘ DỮ LIỆU MẪU THEO MÙA + UPLOAD FILE CSV */}
      <section className="panel" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#14394a', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={15} color="#007f72" />
            <span>Chọn dữ liệu mẫu 3 tháng / cùng kỳ năm ngoái hoặc tải file CSV:</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <label className="primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', cursor: 'pointer', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
              <UploadCloud size={14} /> Tải file CSV lên
              <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
            <button onClick={handleDownloadCurrentSeasonCsv} style={{ padding: '6px 12px', fontSize: 11 }}>
              <Download size={13} /> Tải CSV mẫu
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
          {HOTEL_SEASONS.map(s => {
            const isSelected = selectedSeason === s.key && dataSummary !== null;
            return (
              <div
                key={s.key}
                onClick={() => handleSelectSeason(s.key)}
                style={{
                  border: `1.5px solid ${isSelected ? '#007f72' : '#e2e8f0'}`,
                  background: isSelected ? '#edf8f5' : '#fff',
                  borderRadius: 8,
                  padding: '10px 12px',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <strong style={{ fontSize: 12, color: isSelected ? '#007f72' : '#1e293b' }}>
                    {s.quarterName}
                  </strong>
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: isSelected ? '#d1fae5' : '#f1f5f9', color: isSelected ? '#065f46' : '#64748b', fontWeight: 600 }}>
                    {s.badge}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginTop: 6 }}>
                  <span>Lấp đầy: <strong style={{ color: '#0f172a' }}>{s.occupancyTarget}</strong></span>
                  <span>ADR: <strong style={{ color: '#007f72' }}>{s.adrExpected}</strong></span>
                </div>
              </div>
            );
          })}
        </div>

        {errorMsg && (
          <div className="error" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={15} /> {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="sr-status" style={{ marginTop: 10, padding: '8px 12px', background: '#e6f4ea', color: '#137333', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
            <CheckCircle2 size={15} /> {successMsg}
          </div>
        )}
      </section>

      {/* Kết quả trích xuất */}
      {dataSummary && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="kpi-grid">
            <div className="panel kpi" style={{ borderTopColor: '#007f72' }}>
              <div className="kpi-label">TỔNG LƯỢT ĐẶT ĐÃ PHÂN TÍCH</div>
              <div className="revenue">{dataSummary.totalRecords.toLocaleString('vi-VN')} <small>đơn</small></div>
              <small style={{ color: '#82949e', fontSize: 10 }}>
                {dataSummary.dateRange.start} → {dataSummary.dateRange.end}
              </small>
            </div>

            <div className="panel kpi" style={{ borderTopColor: '#d18a2e' }}>
              <div className="kpi-label">GIÁ BÌNH QUÂN LỊCH SỬ (ADR)</div>
              <div className="revenue">{MONEY(dataSummary.overallAdr)}</div>
            </div>

            <div className="panel kpi" style={{ borderTopColor: '#c2410c' }}>
              <div className="kpi-label">TỶ LỆ HỦY & NO-SHOW</div>
              <div className="revenue">{dataSummary.overallCancellationRate}%</div>
            </div>

            <div className="panel kpi" style={{ borderTopColor: '#078778' }}>
              <div className="kpi-label">THỜI GIAN ĐẶT TRƯỚC TB</div>
              <div className="revenue">{dataSummary.avgLeadTime} <small>ngày</small></div>
            </div>
          </div>

          <section className="panel">
            <div className="section-heading" style={{ margin: '0 0 10px' }}>
              <h3 style={{ margin: 0, fontSize: 13 }}>Phân khúc & Nhu cầu dự báo 30 ngày tới</h3>
              {onApplyForecastToSimulation && (
                <button
                  className="primary"
                  onClick={() => {
                    const segs = dataSummary.segments.slice(0, 3);
                    const demands: [number, number, number] = [
                      segs[0]?.forecastDemand30d ?? 60,
                      segs[1]?.forecastDemand30d ?? 45,
                      segs[2]?.forecastDemand30d ?? 25
                    ];
                    const prices: [number, number, number] = [
                      segs[0]?.avgRate ?? 500000,
                      segs[1]?.avgRate ?? 900000,
                      segs[2]?.avgRate ?? 1500000
                    ];
                    onApplyForecastToSimulation(demands, prices);
                  }}
                  style={{ padding: '6px 12px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  Áp dụng làm cơ sở sinh khách mô phỏng 1 tháng tới <ArrowRight size={13} />
                </button>
              )}
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Hạng phòng</th>
                    <th>Số đơn</th>
                    <th>Giá TB (ADR)</th>
                    <th>Cầu TB/ngày</th>
                    <th>Dự báo 30 ngày</th>
                    <th>Tỷ lệ hủy</th>
                    <th>Lead Time</th>
                  </tr>
                </thead>
                <tbody>
                  {dataSummary.segments.map((seg, idx) => (
                    <tr key={seg.segmentName}>
                      <td>#{idx + 1}</td>
                      <td><strong>{seg.segmentName}</strong></td>
                      <td>{seg.totalBookings}</td>
                      <td><strong style={{ color: '#007f72' }}>{MONEY(seg.avgRate)}</strong></td>
                      <td>{seg.dailyMeanDemand}</td>
                      <td><strong style={{ color: '#d18a2e' }}>{seg.forecastDemand30d} phòng</strong></td>
                      <td>{seg.cancellationRate}%</td>
                      <td>{seg.avgLeadTimeDays} ngày</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Nhịp độ đặt phòng lịch sử (Pickup Pace)</h3>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dataSummary.dailyPaceSeries.slice(0, 45)}>
                  <CartesianGrid strokeDasharray="3 4" vertical={false} />
                  <Legend />
                  <XAxis dataKey="date" tickLine={false} tickFormatter={v => v.slice(5)} />
                  <YAxis tickLine={false} width={36} />
                  <Tooltip labelFormatter={v => `Ngày: ${v}`} formatter={(val: number) => [`${val} phòng`, 'Số phòng']} />
                  <Bar dataKey="bookings" name="Lượt đặt phòng" fill="#007f72" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
