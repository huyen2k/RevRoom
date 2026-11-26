import { useEffect, useRef, useState } from 'react';
import type { Config } from './model/types';
import type { MonteCarloResult } from './model/shared/monteCarlo';

type Result = Pick<MonteCarloResult, 'rows' | 'pairs'> & { intensity: number };
export const levels = ['Thấp', 'Cơ sở', 'Cao'];
const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

export default function Comparison({ config }: { config: Config }) {
  const worker = useRef<Worker | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => worker.current?.terminate(), []);

  function compare() {
    setResults([]);
    setError('');
    setBusy(true);
    function stop() {
      worker.current?.terminate();
      worker.current = null;
      setBusy(false);
    }
    try {
      const task = new Worker(new URL('./compare.worker.ts', import.meta.url), { type: 'module' });
      worker.current = task;
      task.onerror = () => { setError('Chạy so sánh bị gián đoạn. Hãy thử lại.'); stop(); };
      task.onmessage = ({ data }) => {
        if (data.error) { setError(data.error); stop(); return; }
        setResults(previous => [...previous, data]);
        if (data.intensity === 1.5) stop();
      };
      task.postMessage(config);
    } catch (cause) { setError(String(cause)); stop(); }
  }
  return <section className="panel scenario">
    <h2>So sánh chính sách theo nhu cầu</h2>
    <p>Mỗi mức nhu cầu chạy 100 lượt từ seed {config.seed}. Trong mỗi lượt, A, B và C gặp cùng khách theo cùng thứ tự.</p>
    <button className="primary" disabled={busy} onClick={compare}>{busy ? 'Đang chạy…' : 'So sánh 3 mức nhu cầu'}</button>
    <span aria-live="polite"> {error || (results.length > 0 && `Đã tính ${results.length}/3 mức`)}</span>
    {results.map(({ intensity, rows, pairs }) => {
      const delta = pairs.find(pair => pair.left === 'C' && pair.right === 'B')!;
      const verdict = delta.ci95Low > 0 ? 'C cho doanh thu trung bình cao hơn B.' : delta.ci95High < 0 ? 'B cho doanh thu trung bình cao hơn C.' : 'Chưa thấy chênh lệch doanh thu rõ ràng giữa C và B.';
      return <article key={intensity}><h3>Nhu cầu {levels[intensity * 2 - 1].toLowerCase()} ×{number(intensity)}</h3>
        <table><thead><tr><th>Chiến lược</th><th>Doanh thu TB (triệu đồng)</th><th>Lấp đầy TB</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.policy}><td>{row.policy}</td><td>{number(row.mean / 1e6)}</td><td>{number(row.occupancy)}%</td></tr>)}</tbody></table>
        <p>{verdict} Chênh lệch C − B đạt {number(delta.mean / 1e6)} triệu đồng, khoảng tin cậy 95% xấp xỉ [{number(delta.ci95Low / 1e6)} · {number(delta.ci95High / 1e6)}] triệu đồng.</p>
      </article>;
    })}
  </section>;
}
