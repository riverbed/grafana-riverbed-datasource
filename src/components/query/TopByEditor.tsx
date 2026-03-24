import React, { useEffect, useMemo } from 'react';
import { Stack, Select, IconButton, Button } from '@grafana/ui';
import { TopBySpec } from '../../types';
import { sortOptionsByLabel } from '../../utils/options';
import { filterOptionsByUsedKeys } from '../../utils/filters';

interface Props {
  metricsOptions: Array<{ label: string; value: string }>;
  topBy?: TopBySpec[];
  onChange: (next: TopBySpec[]) => void;
}

export const TopByEditor: React.FC<Props> = ({ metricsOptions, topBy = [], onChange }) => {
  const sortedMetricsOptions = useMemo(() => sortOptionsByLabel(metricsOptions), [metricsOptions]);

  // Normalize: ensure only unique metric ids by clearing later duplicates
  useEffect(() => {
    if (!topBy || topBy.length === 0) {
      return;
    }
    let changed = false;
    const seen = new Set<string>();
    const normalized: TopBySpec[] = topBy.map((item) => {
      const id = (item?.id ?? '') as string;
      if (!id) {
        return item;
      }
      if (seen.has(id)) {
        changed = true;
        return { ...item, id: '' };
      }
      seen.add(id);
      return item;
    });
    if (changed) {
      onChange(normalized);
    }
  }, [topBy, onChange]);
  return (
    <div>
      <div style={{ border: '1px solid var(--border-weak)', borderRadius: 4, padding: 8 }}>
        <Stack gap={1}>
          <Stack direction="row" gap={1} alignItems="center">
            <div style={{ fontWeight: 500, opacity: 0.8 }}>Top by</div>
            <div style={{ flex: 1 }} />
          </Stack>

          {(topBy || []).map((t, idx) => (
            <Stack direction="column" gap={0.5} key={idx}>
              <div style={{ width: '100%' }}>
                <Select
                  placeholder="metric"
                  options={(() => {
                    const used = new Set(
                      (topBy || [])
                        .map((x) => x?.id)
                        .filter((k) => typeof k === 'string' && k.length > 0)
                    );
                    return filterOptionsByUsedKeys(sortedMetricsOptions, used, t.id);
                  })()}
                  value={t.id ? (sortedMetricsOptions.find((o) => o.value === t.id) ?? null) : null}
                  onChange={(v) => {
                    const arr = [...(topBy || [])];
                    arr[idx] = { ...arr[idx], id: (v?.value as string) || '' } as TopBySpec;
                    onChange(arr);
                  }}
                />
              </div>
              <div style={{ width: '100%' }}>
                <Select
                  options={[{ label: 'desc', value: 'desc' }, { label: 'asc', value: 'asc' }]}
                  value={{ label: t.direction, value: t.direction }}
                  onChange={(v) => {
                    const arr = [...(topBy || [])];
                    arr[idx] = { ...arr[idx], direction: (v?.value as 'asc'|'desc') } as TopBySpec;
                    onChange(arr);
                  }}
                />
              </div>
              <IconButton
                name="trash-alt"
                aria-label="Remove"
                onClick={() => onChange((topBy || []).filter((_, i) => i !== idx))}
              />
            </Stack>
          ))}

          <div>
            <Button
              variant="secondary"
              onClick={() => onChange([...(topBy || []), { id: '', direction: 'desc' }])}
              disabled={(sortedMetricsOptions?.length ?? 0) > 0 && new Set((topBy || []).map((x) => x.id).filter((k) => !!k)).size >= (sortedMetricsOptions?.length ?? 0)}
            >
              +
            </Button>
          </div>
        </Stack>
      </div>
    </div>
  );
};


