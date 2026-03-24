import { MyQuery, InfoSchema, QueryTypeSpec, FilterRow } from '../types';
import { buildNestedKeyObject, collectPrimaryKeyLeaves, parseNestedKeyObject, queryHasKeysOption, isLegacyQueryType, deriveFilterKeyStrings } from './filters';

// Normalize form query into minimal JSON request body.
export function buildBodyFromForm(info: InfoSchema | null, q: MyQuery, currentQueryType?: QueryTypeSpec | null): any {
  const body: any = {};
  if (q.queryTypeId) body.queryType = q.queryTypeId;
  if (Array.isArray(q.metrics) && q.metrics.length) body.metrics = q.metrics;
  if (Array.isArray(q.properties) && q.properties.length) body.properties = q.properties;
  if (Array.isArray(q.groupBy) && q.groupBy.length) body.groupBy = q.groupBy;
  if (Array.isArray(q.topBy)) {
    const topByFiltered = q.topBy.filter((t) => typeof (t as any)?.id === 'string' && (t as any).id.length > 0);
    if (topByFiltered.length) body.topBy = topByFiltered;
  }
  // For types that support time_series, always emit an explicit boolean timeSeries
  const spec = currentQueryType;
  const supportsTS = Array.isArray(spec?.supportedQueryTypes)
    ? spec!.supportedQueryTypes!.includes('time_series')
    : false;
  if (supportsTS && typeof q.timeSeries === 'boolean') {
    body.timeSeries = q.timeSeries;
  }
  if (typeof q.limit === 'number') body.limit = q.limit;
  if (q.comparedTo) body.comparedTo = q.comparedTo;

  // Filters
  const effectiveSpec = q.queryTypeId ? (currentQueryType ?? info?.queries?.[q.queryTypeId] ?? null) : null;
  const legacy = isLegacyQueryType(effectiveSpec as any);
  if (!legacy) {
    if (Array.isArray(q.filterRows) && q.filterRows.length) {
      const keysArray: any[] = [];
      for (const row of q.filterRows) {
        const obj: Record<string, string | number> = {};
        for (const item of row.items || []) {
          if ((item as any).type === 'keys' && (item as any).key) {
            const v = (item as any).value;
            const hasValue = typeof v === 'string' ? v.trim().length > 0 : v !== undefined;
            if (hasValue) obj[(item as any).key as string] = v as any;
          }
        }
        if (Object.keys(obj).length) keysArray.push(obj);
      }
      if (keysArray.length) body.filters = { keys: keysArray };
    }
  } else {
    const outFilters: Record<string, any[]> = {};
    const legacyFilters = q.legacyFilters || {};
    for (const typeId of Object.keys(legacyFilters)) {
      const arr = legacyFilters[typeId] || [];
      const nestedArr: any[] = [];
      for (const valuesMap of arr) {
        const leaves = collectPrimaryKeyLeaves(info?.keys, typeId) || [];
        if (leaves.length > 0) {
          const allFilled = leaves.every((leaf) => {
            const v = (valuesMap as any)[leaf.id];
            return typeof v === 'string' ? v.trim().length > 0 : v !== undefined;
          });
          if (!allFilled) {
            continue;
          }
        } else {
          const v = (valuesMap as any)['name'];
          const has = typeof v === 'string' ? v.trim().length > 0 : v !== undefined;
          if (!has) {
            continue;
          }
        }
        const wrapped = buildNestedKeyObject({ key: typeId, values: valuesMap } as any, info?.keys);
        const inner = (wrapped as any)[typeId];
        if (inner && Object.keys(inner).length) {
          nestedArr.push(inner);
        }
      }
      if (nestedArr.length) {
        outFilters[typeId] = nestedArr;
      }
    }
    if (Object.keys(outFilters).length) {
      body.filters = outFilters;
    }
  }
  return body;
}

// Map filters.keys JSON back into FilterRow[] with validation for Together/Advanced
export function rowsFromKeysArray(selectedSpec: QueryTypeSpec | null | undefined, info: InfoSchema | null, keysArr: Array<Record<string, any>>): FilterRow[] {
  const rows: FilterRow[] = [];
  const allowedKeyStrings = new Set(deriveFilterKeyStrings(selectedSpec));
  const hasKeys = queryHasKeysOption(selectedSpec);
  for (const obj of keysArr || []) {
    if (hasKeys) {
      const items: any[] = [];
      for (const [k, v] of Object.entries(obj || {})) {
        if (allowedKeyStrings.has(k)) {
          items.push({ type: 'keys', key: k, value: v as any });
        }
      }
      if (items.length) rows.push({ items } as FilterRow);
    } else {
      const parsedItems = parseNestedKeyObject(obj as any, info?.keys);
      const filteredItems = parsedItems.filter((it) => it.key && allowedKeyStrings.has(it.key));
      if (filteredItems.length) {
        rows.push({ items: filteredItems.map((it) => ({ type: 'keys', key: it.key, values: it.values, value: it.value })) } as FilterRow);
      }
    }
  }
  return rows;
}


