import { useMemo } from 'react';
import { InfoSchema } from '../types';

export function useMetricLabelMap(info: InfoSchema | null): Record<string, string> {
  return useMemo(() => {
    const out: Record<string, string> = {};
    const metrics = info?.metrics ?? {};
    try {
      for (const [id, def] of Object.entries(metrics as Record<string, { label?: string }>)) {
        out[id] = def?.label || id;
      }
    } catch {
      // ignore malformed structures
    }
    return out;
  }, [info]);
}


