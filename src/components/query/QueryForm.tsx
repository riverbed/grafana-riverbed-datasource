import React, { useMemo } from 'react';
import { Stack, Select, InlineSwitch, Input, Alert } from '@grafana/ui';
import { GroupByPropertiesSection } from './sections/GroupByPropertiesSection';
import { FiltersSection } from './sections/FiltersSection';
import { TopByEditor } from './TopByEditor';
import { InplaceDraggableMultiSelect } from './InplaceDraggableMultiSelect';
import { MyQuery, InfoSchema, QueryTypeSpec } from '../../types';
import { getGrafanaSupportPrefix, getGrafanaSupportWarning, resolveGrafanaSupportLevel } from '../../utils/grafanaSupport';
import { resolveKeyLabel } from '../../utils/filters';
import { sortOptionsByLabel } from '../../utils/options';
import { useMetricLabelMap } from '../../hooks/useMetricLabelMap';

interface Props {
  query: MyQuery;
  onChange: (q: MyQuery) => void;
  info: InfoSchema | null;
  isLoading: boolean;
  currentQueryType: QueryTypeSpec | null;
  onQueryTypeChange: (typeId?: string) => void;
}

export const QueryForm: React.FC<Props> = ({
  query,
  onChange,
  info,
  isLoading,
  currentQueryType,
  onQueryTypeChange,
}) => {
  const metricLabelMap: Record<string, string> = useMetricLabelMap(info);

  const supportedMetrics: Array<{ label: string; value: string }> = useMemo(() => {
    const ids: string[] = currentQueryType?.metrics || [];
    const opts = ids.map((id: string) => ({ label: metricLabelMap[id] || id, value: id }));
    return sortOptionsByLabel(opts);
  }, [currentQueryType, metricLabelMap]);

  const propertiesOptions: Array<{ label: string; value: string }> = useMemo(() => {
    const props: string[] = Array.isArray(currentQueryType?.properties)
      ? (currentQueryType?.properties as string[])
      : [];
    const opts = props.map((p: string) => ({ label: resolveKeyLabel(p, info?.keys), value: p }));
    return sortOptionsByLabel(opts);
  }, [currentQueryType, info]);

  const queryTypeOptions: Array<{ label: string; value: string; sortLabel?: string }> = useMemo(() => {
    if (!info?.queries) {
      return [];
    }
    const entries = Object.entries(info.queries || {});
    const opts = entries
      .filter(([, spec]) => resolveGrafanaSupportLevel(spec) !== 'disabled')
      .map(([id, spec]) => {
        const supportLevel = resolveGrafanaSupportLevel(spec);
        const baseLabel = (spec as any)?.label || id;
        const label = `${getGrafanaSupportPrefix(supportLevel)}${baseLabel}`;
        return { label, sortLabel: baseLabel, value: id };
      });
    return sortOptionsByLabel(opts);
  }, [info]);

  const selectedQueryTypeOption = useMemo(
    () => queryTypeOptions.find((o) => o.value === query.queryTypeId) ?? null,
    [query.queryTypeId, queryTypeOptions]
  );

  const queryTypeWarning = useMemo(() => {
    const supportLevel = resolveGrafanaSupportLevel(currentQueryType);
    return getGrafanaSupportWarning(supportLevel);
  }, [currentQueryType]);

  const canTimeSeries = useMemo(() => {
    const list: string[] = currentQueryType?.supportedQueryTypes || [];
    return list.includes('time_series');
  }, [currentQueryType]);

  const groupByOptions: Array<{ label: string; value: string }> = useMemo(() => {
    // Only allow expandedKeys when present; do not fall back to keys/properties
    const expanded: string[] = Array.isArray(currentQueryType?.expandedKeys)
      ? (currentQueryType?.expandedKeys as string[])
      : [];
    const opts = expanded.map((k: string) => ({ label: resolveKeyLabel(k, info?.keys), value: k }));
    return sortOptionsByLabel(opts);
  }, [currentQueryType, info]);

  return (
    <div style={{ width: '100%' }}>
      <Stack direction="column" gap={2}>
        <div>
          <div style={{ marginBottom: 6 }}>Query Type</div>
          <div style={{ width: '100%' }}>
            <Select
              value={selectedQueryTypeOption}
              options={queryTypeOptions}
              onChange={(v) => onQueryTypeChange(v?.value)}
              isLoading={isLoading}
            />
          </div>
          {queryTypeWarning && (
            <div style={{ marginTop: 8 }}>
              <Alert title="Query type warning" severity="warning">
                {queryTypeWarning}
              </Alert>
            </div>
          )}
        </div>

        <div>
          <div style={{ marginBottom: 6 }}>Metrics</div>
          <div style={{ width: '100%' }}>
            <InplaceDraggableMultiSelect
              ariaLabel="metrics"
              value={(query.metrics || []).map((id) => ({ label: metricLabelMap[id] || id, value: id }))}
              options={supportedMetrics}
              onChange={(vals) => onChange({ ...query, metrics: (vals || []).map((x) => x.value as string) })}
              disabled={!query.queryTypeId}
            />
          </div>
        </div>

        <div>
          <div style={{ marginBottom: 6 }}>Time series</div>
          <InlineSwitch
            value={!!query.timeSeries}
            onChange={(e) => onChange({ ...query, timeSeries: e.currentTarget.checked })}
            disabled={!canTimeSeries}
            aria-label="timeseries-toggle"
          />
        </div>

        <GroupByPropertiesSection
          currentQueryType={currentQueryType}
          info={info}
          propertiesOptions={propertiesOptions}
          groupByOptions={groupByOptions}
          query={query}
          onChange={onChange}
        />

        {/* Filters UI */}
        <FiltersSection currentQueryType={currentQueryType} info={info} query={query} onChange={onChange} />

        {/* TopBy */}
        <TopByEditor
          metricsOptions={supportedMetrics}
          topBy={query.topBy}
          onChange={(next) => onChange({ ...query, topBy: next })}
        />

        <div>
          <div style={{ marginBottom: 6 }}>Limit</div>
          <div style={{ width: '100%' }}>
            <Input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              step={1}
              value={query.limit ?? ''}
              onChange={(e) => {
                const v = e.currentTarget.value;
                if (v === '') {
                  onChange({ ...query, limit: undefined });
                  return;
                }
                if (/^\d+$/.test(v)) {
                  onChange({ ...query, limit: Number(v) });
                }
                // Ignore non-integer transient input (e.g., 'e')
              }}
            />
          </div>
        </div>
      </Stack>
    </div>
  );
};

