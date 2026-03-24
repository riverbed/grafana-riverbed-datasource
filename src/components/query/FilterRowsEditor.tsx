import React, { useEffect, useMemo } from 'react';
import { Stack, Select, Input, IconButton, Button } from '@grafana/ui';
import { FilterItem, FilterRow } from '../../types';
import { deriveFilterKeyOptionsLabeled, filterOptionsByUsedKeys, resolveKeyType, collectPrimaryKeyLeaves, queryHasKeysOption } from '../../utils/filters';

interface Props {
  currentQueryType: any | null;
  filterRows: FilterRow[];
  setFilterRows: (rows: FilterRow[]) => void;
  infoKeys?: any;
}

export const FilterRowsEditor: React.FC<Props> = ({ currentQueryType, filterRows, setFilterRows, infoKeys }) => {
  const addFilterRow = () => setFilterRows([...(filterRows || []), { items: [{ type: 'keys' } as FilterItem] }]);
  const removeFilterRow = (idx: number) => setFilterRows(filterRows.filter((_, i) => i !== idx));
  const addFilterItem = (rowIdx: number) => {
    const rows = [...filterRows];
    rows[rowIdx] = { ...rows[rowIdx], items: [...(rows[rowIdx]?.items || []), { type: 'keys' } as FilterItem] };
    setFilterRows(rows);
  };
  const updateFilterItem = (rowIdx: number, itemIdx: number, next: Partial<FilterItem>) => {
    const rows = [...filterRows];
    const row = rows[rowIdx];
    if (!row || !row.items || !row.items[itemIdx]) {
      return;
    }
    const curr = row.items[itemIdx] as any;
    row.items[itemIdx] = { ...curr, ...next } as FilterItem;
    setFilterRows(rows);
  };
  const removeFilterItem = (rowIdx: number, itemIdx: number) => {
    const rows = [...filterRows];
    const row = rows[rowIdx];
    if (!row || !row.items) {
      return;
    }
    row.items = row.items.filter((_, i) => i !== itemIdx);
    if (row.items.length === 0) {
      rows.splice(rowIdx, 1);
    }
    setFilterRows(rows);
  };

  const keyOptions = useMemo(() => deriveFilterKeyOptionsLabeled(currentQueryType, infoKeys), [currentQueryType, infoKeys]);
  const isKeysMode = useMemo(() => queryHasKeysOption(currentQueryType), [currentQueryType]);

  // Normalize: ensure only unique keys per AND row by clearing later duplicates
  useEffect(() => {
    if (!filterRows || filterRows.length === 0) {
      return;
    }
    let changed = false;
    const normalized: FilterRow[] = filterRows.map((row) => {
      if (!row?.items || row.items.length === 0) {
        return row;
      }
      const seen = new Set<string>();
      let rowChanged = false;
      const newItems = row.items.map((it) => {
        if ((it as any).type !== 'keys') {
          return it;
        }
        const k = (it as any).key as string | undefined;
        if (!k) {
          return it;
        }
        if (seen.has(k)) {
          rowChanged = true;
          return { ...(it as any), key: undefined } as any;
        }
        seen.add(k);
        return it;
      });
      if (rowChanged) {
        changed = true;
        return { ...row, items: newItems };
      }
      return row;
    });
    if (changed) {
      setFilterRows(normalized);
    }
  }, [filterRows, setFilterRows]);

  return (
    <div>
      <div style={{ marginBottom: 6 }}>Filters</div>
      <Stack direction="column" gap={1}>
        {filterRows.map((row, rowIdx) => (
          <React.Fragment key={rowIdx}>
            <div style={{ border: '1px solid var(--border-weak)', borderRadius: 4, padding: 8 }}>
              <Stack gap={1}>
                <Stack direction="row" gap={1} alignItems="center">
                  <div style={{ fontWeight: 500, opacity: 0.8 }}>Terms (AND)</div>
                  <div style={{ flex: 1 }} />
                  <IconButton name="trash-alt" aria-label="Remove row" onClick={() => removeFilterRow(rowIdx)} />
                </Stack>
            {row.items.map((item, itemIdx) => (
              <Stack direction="column" gap={0.5} key={itemIdx}>
                {item.type === 'keys' && (
                  <>
                    <Select
                      placeholder="key"
                      options={(() => {
                        const used = new Set(
                          (row.items || [])
                            .map((it: any) => it?.key)
                            .filter((k: any) => typeof k === 'string' && k.length > 0)
                        );
                        return filterOptionsByUsedKeys(keyOptions, used, (item as any).key as any);
                      })()}
                      value={item.key ? (keyOptions.find((o) => o.value === item.key) ?? null) : null}
                      onChange={(v) => updateFilterItem(rowIdx, itemIdx, { key: v?.value as string, value: undefined as any, values: undefined as any })}
                    />
                    {(() => {
                      if (!item.key) {
                        return null;
                      }

                      if (!isKeysMode) {
                        const leaves = collectPrimaryKeyLeaves(infoKeys, item.key);
                        if (leaves.length > 0) {
                          return (
                            <>
                              {leaves.map((leaf) => {
                                const isNum = typeof leaf.type === 'string' && /(number|integer|float|double)/i.test(leaf.type);
                                const current = (item as any).values?.[leaf.id];
                                return (
                                  <Input
                                    key={leaf.id}
                                    type={isNum ? 'number' : undefined}
                                    placeholder={leaf.label || leaf.id}
                                    value={current !== undefined ? String(current) : ''}
                                    onChange={(e) => {
                                      const nextVal = e.currentTarget.value;
                                      const nextValues = { ...((item as any).values || {}) };
                                      nextValues[leaf.id] = nextVal;
                                      updateFilterItem(rowIdx, itemIdx, { values: nextValues } as any);
                                    }}
                                  />
                                );
                              })}
                            </>
                          );
                        }
                      }

                      // Fallback: single value input (keys mode or no leaf primary keys)
                      const keyType = resolveKeyType(item.key, infoKeys);
                      const isNumeric = typeof keyType === 'string' && /(number|integer|float|double)/i.test(keyType);
                      const placeholder = keyType || 'value';
                      return (
                        <Input
                          type={isNumeric ? 'number' : undefined}
                          placeholder={placeholder}
                          value={(item as any).value !== undefined ? String((item as any).value) : ''}
                          onChange={(e) => updateFilterItem(rowIdx, itemIdx, { value: e.currentTarget.value } as any)}
                        />
                      );
                    })()}
                  </>
                )}
                <IconButton name="trash-alt" aria-label="Remove filter" onClick={() => removeFilterItem(rowIdx, itemIdx)} />
              </Stack>
            ))}
            <div>
              <Button
                variant="secondary"
                onClick={() => addFilterItem(rowIdx)}
                disabled={(keyOptions?.length ?? 0) > 0 && new Set((row.items || []).map((it: any) => it?.key).filter((k: any) => !!k)).size >= (keyOptions?.length ?? 0)}
              >
                +
              </Button>
            </div>
              </Stack>
            </div>
            {rowIdx < (filterRows.length - 1) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border-weak)' }} />
                <div style={{ opacity: 0.7 }}>OR</div>
                <div style={{ flex: 1, height: 1, background: 'var(--border-weak)' }} />
              </div>
            )}
          </React.Fragment>
        ))}
        <Button variant="secondary" onClick={addFilterRow}>
          {(!filterRows || filterRows.length === 0) ? 'Add' : 'Add an OR'}
        </Button>
      </Stack>
    </div>
  );
};


