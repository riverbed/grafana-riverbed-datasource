import React from 'react';
import { LegacyFiltersEditor } from '../LegacyFiltersEditor';
import { FilterRowsEditor } from '../FilterRowsEditor';
import { isLegacyQueryType } from '../../../utils/filters';
import { InfoSchema, MyQuery, QueryTypeSpec } from '../../../types';

interface Props {
  currentQueryType: QueryTypeSpec | null;
  info: InfoSchema | null;
  query: MyQuery;
  onChange: (q: MyQuery) => void;
}

export const FiltersSection: React.FC<Props> = ({ currentQueryType, info, query, onChange }) => {
  const legacy = isLegacyQueryType(currentQueryType);
  if (legacy) {
    return (
      <LegacyFiltersEditor
        currentQueryType={currentQueryType}
        legacyFilters={query.legacyFilters}
        setLegacyFilters={(next) => onChange({ ...query, legacyFilters: next })}
        infoKeys={info?.keys}
      />
    );
  }
  const filterRows = query.filterRows || [];
  return (
    <FilterRowsEditor
      currentQueryType={currentQueryType}
      filterRows={filterRows}
      setFilterRows={(rows) => onChange({ ...query, filterRows: rows })}
      infoKeys={info?.keys}
    />
  );
};


