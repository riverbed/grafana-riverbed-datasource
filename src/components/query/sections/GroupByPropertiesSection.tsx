import React from 'react';

import { resolveKeyLabel, isLegacyQueryType } from '../../../utils/filters';
import { InfoSchema, MyQuery, QueryTypeSpec } from '../../../types';
import { InplaceDraggableMultiSelect } from '../InplaceDraggableMultiSelect';

interface Props {
  currentQueryType: QueryTypeSpec | null;
  info: InfoSchema | null;
  propertiesOptions: Array<{ label: string; value: string }>;
  groupByOptions: Array<{ label: string; value: string }>;
  query: MyQuery;
  onChange: (q: MyQuery) => void;
}

export const GroupByPropertiesSection: React.FC<Props> = ({ currentQueryType, info, propertiesOptions, groupByOptions, query, onChange }) => {
  const legacy = isLegacyQueryType(currentQueryType);
  if (propertiesOptions.length > 0) {
    return (
      <div>
        <div style={{ marginBottom: 6 }}>Properties</div>
        <div style={{ width: '100%' }}>
          <InplaceDraggableMultiSelect
            ariaLabel="properties"
            value={(query.properties || []).map((p: string) => ({ label: resolveKeyLabel(p, info?.keys), value: p }))}
            options={propertiesOptions}
            onChange={(vals) => onChange({ ...query, properties: (vals || []).map((x) => x.value as string) })}
            disabled={!query.queryTypeId}
          />
        </div>
      </div>
    );
  }
  // Group by
  if (legacy) {
    // Inline label in legacy mode
    return (
      <div>
        <div style={{ marginBottom: 6 }}>
          <span>Group by: </span>
          {(() => {
            const ids: string[] = Array.isArray((currentQueryType as any)?.keys)
              ? ((currentQueryType as any).keys as string[])
              : [];
            const labels = ids
              .filter((k) => k !== 'data_source')
              .map((k) => resolveKeyLabel(k, info?.keys))
              .filter((s) => typeof s === 'string' && s.trim().length > 0);
            const text = labels.length > 0 ? labels.join(' AND ') : '(none)';
            return <span aria-label="legacy-groupby-label" style={{ opacity: 0.8 }}>{text}</span>;
          })()}
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ marginBottom: 6 }}>Group by</div>
      <div style={{ width: '100%' }}>
        <InplaceDraggableMultiSelect
          ariaLabel="group by"
          value={(query.groupBy || []).map((g: string) => ({ label: resolveKeyLabel(g, info?.keys), value: g }))}
          options={groupByOptions}
          onChange={(vals) => onChange({ ...query, groupBy: (vals || []).map((x) => x.value as string) })}
          disabled={!query.queryTypeId || groupByOptions.length === 0}
        />
      </div>
    </div>
  );
};


