import { evaluate } from './model/shared/monteCarlo';
import type { Config } from './model/types';

self.onmessage = ({ data }: MessageEvent<Config>) => {
  try {
    for (const intensity of [0.5, 1, 1.5]) {
      const { rows, pairs } = evaluate({ ...data, intensity }, 100);
      self.postMessage({ intensity, rows, pairs });
    }
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
