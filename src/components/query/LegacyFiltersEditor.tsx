import React, { useMemo, useContext } from 'react';
import { Stack, Button, IconButton, Input, Select } from '@grafana/ui';
import { LegacyFiltersState, InfoKeyNode, QueryTypeSpec } from '../../types';
import { collectPrimaryKeyLeaves } from '../../utils/filters';
import { sortOptionsByLabel } from '../../utils/options';
import { InfoContext } from '../../context/InfoContext';

interface Props {
  currentQueryType: QueryTypeSpec | null;
  legacyFilters: LegacyFiltersState | undefined;
  setLegacyFilters: (next: LegacyFiltersState) => void;
  infoKeys?: Record<string, InfoKeyNode>;
}

export const LegacyFiltersEditor: React.FC<Props> = ({ currentQueryType, legacyFilters, setLegacyFilters, infoKeys }) => {
  const { info } = useContext(InfoContext);
  const resolvedInfoKeys: Record<string, InfoKeyNode> | undefined = infoKeys ?? (info?.keys as Record<string, InfoKeyNode> | undefined);
  const legacyTypes: string[] = useMemo(() => {
    const list = Array.isArray(currentQueryType?.filters) ? (currentQueryType!.filters as any[]) : [];
    return list.filter((x: any) => typeof x === 'string' && x.toLowerCase() !== 'keys');
  }, [currentQueryType]);

  const existingTypes = Object.keys(legacyFilters || {});
  const remainingTypes = legacyTypes.filter((t) => !existingTypes.includes(t));
  const typeLabel = (typeId: string): string => {
    return (resolvedInfoKeys && (resolvedInfoKeys as any)[typeId]?.label) || typeId;
  };
  const typeOptions = useMemo(
    () => sortOptionsByLabel(remainingTypes.map((t) => ({ label: typeLabel(t), value: t }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remainingTypes, resolvedInfoKeys]
  );

  const addObject = (typeId: string) => {
    const next: LegacyFiltersState = { ...(legacyFilters || {}) };
    const arr = [...(next[typeId] || [])];
    arr.push({}); // empty values map; UI will fill primary leaves
    next[typeId] = arr;
    setLegacyFilters(next);
  };

  const addSection = (typeId: string) => {
    const next: LegacyFiltersState = { ...(legacyFilters || {}) };
    if (!next[typeId]) {
      // Auto-create the first empty term when adding a new section
      next[typeId] = [{}];
      setLegacyFilters(next);
    }
  };

  const removeObject = (typeId: string, idx: number) => {
    const next: LegacyFiltersState = { ...(legacyFilters || {}) };
    const arr = [...(next[typeId] || [])];
    arr.splice(idx, 1);
    if (arr.length > 0) {
      next[typeId] = arr;
    } else {
      delete next[typeId];
    }
    setLegacyFilters(next);
  };

  const removeSection = (typeId: string) => {
    const next: LegacyFiltersState = { ...(legacyFilters || {}) };
    if (typeId in next) {
      delete next[typeId];
      setLegacyFilters(next);
    }
  };

  const updateValue = (typeId: string, idx: number, relLeafId: string, value: string) => {
    const next: LegacyFiltersState = { ...(legacyFilters || {}) };
    const arr = [...(next[typeId] || [])];
    const obj = { ...(arr[idx] || {}) };
    obj[relLeafId] = value;
    arr[idx] = obj;
    next[typeId] = arr;
    setLegacyFilters(next);
  };

  return (
    <div>
      <div style={{ marginBottom: 6 }}>Filters</div>
      <Stack direction="column" gap={1}>
        {Object.keys(legacyFilters || {}).map((typeId, sectionIdx) => {
          const leaves = collectPrimaryKeyLeaves(resolvedInfoKeys as any, typeId);
          const items = (legacyFilters?.[typeId] || []) as Array<Record<string, any>>;
          const sectionPrefix = sectionIdx > 0 ? 'AND ' : '';
          return (
            <div key={typeId} style={{ border: '1px solid var(--border-weak)', borderRadius: 4, padding: 8 }}>
              <Stack direction="row" alignItems="center">
                <div style={{ fontWeight: 600 }}>{`${sectionPrefix}${typeLabel(typeId)}`}</div>
                <Button
                  variant="secondary"
                  onClick={() => addObject(typeId)}
                  aria-label={`add-legacy-term-${typeId}`}
                >
                  +
                </Button>
                <IconButton
                  name="trash-alt"
                  aria-label={`remove-legacy-section-${typeId}`}
                  onClick={() => removeSection(typeId)}
                />
                <div style={{ flex: 1 }} />
              </Stack>
              <div style={{ marginTop: 6 }}>
              <Stack direction="column" gap={1}>
                {items.map((vals, idx) => (
                  <div key={idx} style={{ border: '1px solid var(--border-weak)', borderRadius: 4, padding: 8 }}>
                    <Stack direction="row" alignItems="center" gap={1}>
                      {(() => {
                        const fieldsRequiredSuffix = leaves.length > 1 ? ' (all fields required)' : '';
                        const termPrefix = idx > 0 ? 'OR ' : '';
                        return (
                          <div style={{ fontWeight: 500, opacity: 0.8 }}>{`${termPrefix}${typeLabel(typeId)} #${idx + 1}${fieldsRequiredSuffix}`}</div>
                        );
                      })()}
                      <IconButton name="trash-alt" aria-label="remove-legacy-term" onClick={() => removeObject(typeId, idx)} />
                      <div style={{ flex: 1 }} />
                    </Stack>
                    <div style={{ marginTop: 6 }}>
                    <Stack direction="column" gap={0.5}>
                      {leaves.length === 0 ? (
                        <Input
                          placeholder="name"
                          value={vals['name'] !== undefined ? String(vals['name']) : ''}
                          onChange={(e) => updateValue(typeId, idx, 'name', e.currentTarget.value)}
                        />
                      ) : (
                        leaves.map((leaf) => {
                          const isNumeric = typeof leaf.type === 'string' && /(number|integer|float|double)/i.test(leaf.type);
                          const typeSuffix = leaf.type ? ` (${leaf.type})` : '';
                          const placeholder = `${leaf.label || leaf.id}${typeSuffix}`;
                          return (
                            <Input
                              key={leaf.id}
                              type={isNumeric ? 'number' : undefined}
                              placeholder={placeholder}
                              value={vals[leaf.id] !== undefined ? String(vals[leaf.id]) : ''}
                              onChange={(e) => updateValue(typeId, idx, leaf.id, e.currentTarget.value)}
                            />
                          );
                        })
                      )}
                    </Stack>
                    </div>
                  </div>
                ))}
              </Stack>
              </div>
            </div>
          );
        })}
      </Stack>
      {/* Global adder for sections (types) — placed at the end */}
      <div style={{ marginTop: 8 }}>
      <Stack direction="row" gap={1} alignItems="center">
        <Select
          placeholder={(Object.keys(legacyFilters || {}).length > 0) ? "Add filter type... (AND)" : "Add filter type..."}
          options={typeOptions}
          value={null}
          onChange={(v) => {
            const id = (v?.value as string) || undefined;
            if (id) {
              addSection(id);
            }
          }}
          isDisabled={remainingTypes.length === 0}
        />
      </Stack>
      </div>
    </div>
  );
};


