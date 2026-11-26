import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  addDays, buildDemandProfile, calendarDays, DAY_FACTORS, DAYS, demandSourceLabel,
  generateHistory, historicalCsv, localDate,
  type CalendarDay, type DayKind, type DayOverrides, type DaySettings, type History,
} from './model/dataSimulation';
import { SEGMENTS, SEGMENT_LABELS, type Config, type DemandProfile } from './model/types';

const SEGMENT_NAMES = SEGMENTS.map(segment => SEGMENT_LABELS[segment]);
const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

function DayEditor({ days, index, title, onSave, onClose }: {
  days: CalendarDay[];
  index?: number;
  title: string;
  onSave: (dates: string[], settings?: DaySettings) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const day = index === undefined ? undefined : days[index];
  const [kind, setKind] = useState<DayKind>(day?.kind ?? 'Sự kiện');
  const [name, setName] = useState(day?.name ?? '');
  const [factors, setFactors] = useState(() => (day?.factors ?? DAY_FACTORS['Sự kiện']).map(String));
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const hasName = kind === 'Ngày lễ' || kind === 'Sự kiện';

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dates = day ? [day.date] : days.slice(start, end + 1).map(entry => entry.date);
    onSave(dates, { kind, name: hasName ? name.trim() : '', factors: [Number(factors[0]), Number(factors[1]), Number(factors[2])] });
    dialog.current?.close();
  }

  return <dialog className="day-editor" ref={dialog} onClose={onClose} aria-labelledby="day-editor-title">
    <form onSubmit={save}>
      <div className="day-editor-heading">
        <div><small>{title}</small><h3 id="day-editor-title">{index === undefined ? 'Đặt sự kiện theo khoảng ngày' : `Chỉnh Ngày ${index + 1}`}</h3></div>
        <button type="button" aria-label="Đóng" onClick={() => dialog.current?.close()}>×</button>
      </div>
      {!day && <div className="data-fields">
        <label className="field">Từ ngày
          <select value={start} onChange={event => {
            const next = Number(event.target.value);
            setStart(next);
            setEnd(current => Math.max(current, next));
          }}>
            {days.map((entry, i) => <option key={entry.date} value={i}>Ngày {i + 1}</option>)}
          </select>
        </label>
        <label className="field">Đến ngày
          <select value={end} onChange={event => setEnd(Number(event.target.value))}>
            {days.slice(start).map((entry, i) => <option key={entry.date} value={start + i}>Ngày {start + i + 1}</option>)}
          </select>
        </label>
      </div>}
      <label className="field">Loại ngày
        <select value={kind} onChange={event => {
          const next = event.target.value as DayKind;
          setKind(next);
          setFactors(DAY_FACTORS[next].map(String));
        }}>
          {Object.keys(DAY_FACTORS).map(option => <option key={option}>{option}</option>)}
        </select>
      </label>
      {hasName && <label className="field">Tên dịp (tùy chọn)
        <input maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="Ví dụ hội nghị" />
      </label>}
      <fieldset className="day-factors">
        <legend>Hệ số nhu cầu</legend>
        <div className="data-fields">
          {factors.map((value, index) => <label key={index} className="field">{SEGMENT_NAMES[index]}
            <input type="number" step="any" min="0.1" max="3" value={value} required
              onChange={event => setFactors(current => current.map((factor, i) => i === index ? event.target.value : factor))} />
          </label>)}
        </div>
        <p className="data-note">1 giữ nguyên. 1,5 tăng 50%. Các mức gợi ý có thể chỉnh.</p>
      </fieldset>
      {!day && <p className="data-note">Áp dụng cho {end - start + 1} ngày, tính cả ngày đầu và ngày cuối. Thiết lập đã có trong khoảng sẽ được thay thế.</p>}
      <div className="actions">
        {day && <button type="button" onClick={() => { onSave([day.date]); dialog.current?.close(); }}>Khôi phục theo lịch</button>}
        <button type="submit" className="primary">{day ? 'Lưu ngày' : 'Áp dụng cho khoảng ngày'}</button>
      </div>
    </form>
  </dialog>;
}

function EditableCalendar({ title, days, onChange }: {
  title: string;
  days: CalendarDay[];
  onChange: (dates: string[], settings?: DaySettings) => void;
}) {
  const [selected, setSelected] = useState<number | 'range'>();
  return <>
    <ol className="data-calendar" aria-label={title}>
      {days.map((day, index) => <li key={day.date}>
        <button type="button" aria-haspopup="dialog"
          className={day.kind === 'Ngày thường' ? '' : day.kind === 'Cuối tuần' ? 'weekend' : 'special'}
          onClick={() => setSelected(index)}>
          <strong>Ngày {index + 1}</strong>
          <span>{day.kind}</span>
          {day.name && <span className="day-name">{day.name}</span>}
        </button>
      </li>)}
    </ol>
    <div className="data-calendar-tools">
      <button type="button" aria-haspopup="dialog" onClick={() => setSelected('range')}>Đặt sự kiện theo khoảng ngày</button>
    </div>
    {selected !== undefined && <DayEditor days={days} index={selected === 'range' ? undefined : selected} title={title}
      onSave={onChange} onClose={() => setSelected(undefined)} />}
  </>;
}

function changeDays(overrides: DayOverrides, dates: string[], settings?: DaySettings): DayOverrides {
  const next = { ...overrides };
  for (const date of dates) {
    if (settings) next[date] = settings;
    else delete next[date];
  }
  return next;
}

export default function DataSimulation({ config, onApply }: {
  config: Config;
  onApply: (profile: DemandProfile | undefined) => void;
}) {
  const [upcomingStart] = useState(localDate);
  const historyStart = addDays(upcomingStart, -DAYS);
  const [historyOverrides, setHistoryOverrides] = useState<DayOverrides>({});
  const [upcomingOverrides, setUpcomingOverrides] = useState<DayOverrides>({});
  const [seed, setSeed] = useState('2026');
  const [history, setHistory] = useState<History>();
  const [historyDirty, setHistoryDirty] = useState(false);
  const [useHistory, setUseHistory] = useState(false);
  const [useUpcoming, setUseUpcoming] = useState(false);
  const historicalDays = calendarDays(historyStart, historyOverrides);
  const upcomingDays = calendarDays(upcomingStart, upcomingOverrides);

  function createHistory() {
    setHistory(generateHistory(historyStart, Number(seed), config.demands, historyOverrides));
    setHistoryDirty(false);
  }

  function downloadHistory() {
    if (!history) return;
    const url = URL.createObjectURL(new Blob([historicalCsv(history)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `revRoom-30-ngay-truoc-seed-${history.seed}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const validSeed = seed !== '' && Number.isInteger(Number(seed)) && Number(seed) >= 0 && Number(seed) <= 4294967295;
  const requiresHistory = useHistory && (!history || historyDirty);
  const preview = requiresHistory ? undefined : buildDemandProfile(
    config.demands, useHistory ? history : undefined, useUpcoming ? upcomingDays : undefined,
  );

  return <div className="data-simulation">
    <section className="panel" aria-labelledby="history-title">
      <h2 id="history-title">30 ngày trước</h2>
      <p>Bấm vào ngày muốn chỉnh trước khi sinh dữ liệu lịch sử.</p>
      <EditableCalendar title="30 ngày trước" days={historicalDays}
        onChange={(dates, settings) => {
          setHistoryOverrides(current => changeDays(current, dates, settings));
          setHistoryDirty(true);
        }} />
      <div className="actions">
        <button type="button" className="primary" disabled={!validSeed} onClick={createHistory}>Sinh dữ liệu 30 ngày trước</button>
        <button type="button" disabled={!history || historyDirty} onClick={downloadHistory}>Tải CSV lịch sử</button>
      </div>
      <details className="data-details">
        <summary>Seed lịch sử</summary>
        <label className="field history-seed">Giá trị seed lịch sử
          <input type="number" min="0" max="4294967295" step="1" value={seed}
            onChange={event => { setSeed(event.target.value); setHistoryDirty(true); }} />
        </label>
        {!validSeed && <p role="alert">Seed phải là số nguyên từ 0 đến 4.294.967.295.</p>}
      </details>
      <p role="status">{history && (historyDirty ? 'Lịch sử đã thay đổi. Bấm sinh lại trước khi sử dụng hoặc tải CSV.'
        : `Đã sinh ${number(history.total)} lượt hỏi cho 30 ngày trước.`)}</p>
    </section>

    <section className="panel" aria-labelledby="upcoming-title">
      <h2 id="upcoming-title">30 ngày tiếp theo</h2>
      <p>Bấm vào ngày mở bán muốn đánh dấu cuối tuần, ngày lễ hoặc sự kiện.</p>
      <EditableCalendar title="30 ngày tiếp theo" days={upcomingDays}
        onChange={(dates, settings) => setUpcomingOverrides(current => changeDays(current, dates, settings))} />
    </section>

    <section className="panel" aria-labelledby="source-title">
      <h2 id="source-title">Nguồn dữ liệu khách</h2>
      <div className="data-switches">
        <label><input type="checkbox" checked={useHistory} onChange={event => setUseHistory(event.target.checked)} />
          <span><strong>Dùng dữ liệu 30 ngày trước</strong><small>Ước lượng nhu cầu nền từ các lượt hỏi trong lịch sử giả lập.</small></span></label>
        <label><input type="checkbox" checked={useUpcoming} onChange={event => setUseUpcoming(event.target.checked)} />
          <span><strong>Dùng lịch 30 ngày tiếp theo</strong><small>Áp dụng hệ số theo từng ngày mở bán.</small></span></label>
      </div>
      <p>Đang chạy: <strong>{demandSourceLabel(config.demandProfile)}</strong></p>
      <p aria-live="polite">{requiresHistory ? 'Cần sinh dữ liệu 30 ngày trước để áp dụng.' : <>Sẽ áp dụng: <strong>{demandSourceLabel(preview)}</strong></>}</p>
      {preview && <details className="data-details">
        <summary>Xem nhu cầu kỳ vọng theo ngày</summary>
        <div className="table-wrap"><table>
          <thead><tr><th>Ngày mở bán</th>{SEGMENT_NAMES.map(name => <th key={name}>{name}</th>)}</tr></thead>
          <tbody>{preview.dailyMeans.map((means, index) => <tr key={index}>
            <td>Ngày {index + 1}{useUpcoming && ` · ${upcomingDays[index].name || upcomingDays[index].kind}`}</td>
            {means.map((mean, i) => <td key={i}>{number(mean * config.intensity)}</td>)}
          </tr>)}</tbody>
        </table></div>
      </details>}
      <button type="button" className="primary" disabled={requiresHistory} onClick={() => onApply(preview)}>
        Sinh dữ liệu và áp dụng
      </button>
    </section>
  </div>;
}
