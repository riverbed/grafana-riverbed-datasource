import type { DataSourceApi, DataSourceJsonData } from '@grafana/data';
import type { DataQuery } from '@grafana/schema';

import { buildBodyFromForm as buildBodyFromFormUtil } from './queryMapping';
import { DEFAULT_QUERY, InfoSchema, MyQuery } from '../types';
import { resolveGrafanaSupportLevel } from './grafanaSupport';

export const RIVERBED_PLUGIN_ID = 'riverbed-datastore-datasource';

/**
 * Construct a clean Riverbed query object with safe defaults.
 *
 * Important: this is used for datasource switching/import and must avoid leaking
 * any prior query state (including queryText).
 */
export function makeDefaultQuery(refId?: string): MyQuery {
  return {
    ...(DEFAULT_QUERY as MyQuery),
    ...(refId ? { refId } : {}),
    // Explicitly clear all user-editable query state.
    queryText: '',
    supportTime: undefined,
    queryTypeId: undefined,
    metrics: [],
    properties: [],
    groupBy: [],
    topBy: [],
    limit: (DEFAULT_QUERY as any).limit ?? 10,
    timeSeries: false,
    comparedTo: undefined,
    filterRows: [],
    legacyFilters: {},
    filters: undefined,
    ui: {
      ...((DEFAULT_QUERY as MyQuery).ui || {}),
      // Ensure we never block execution due to stale state after a reset.
      blockExecutionForUnknownQueryType: false,
    },
  };
}

/**
 * Ensure `query.queryText` exists by synthesizing it from current form fields.
 * This is intentionally metadata-free; the backend will validate/execute.
 */
export function ensureQueryTextFromForm(query: MyQuery): MyQuery {
  if (query?.queryText && query.queryText.trim() !== '') {
    return query;
  }
  const body: any = buildBodyFromFormUtil(null, query, null);
  const queryText = JSON.stringify(body);
  return { ...query, queryText };
}

export function inferOriginPluginId(
  origin: DataSourceApi<DataQuery, DataSourceJsonData> | undefined | null
): string | undefined {
  const originMeta: any = (origin as any)?.meta;
  return originMeta?.id ?? originMeta?.type ?? originMeta?.name;
}

export function shouldPreserveQueriesOnSwitch(originPluginId: string | undefined, destPluginId: string): boolean {
  return originPluginId === destPluginId;
}

export function decideHydrationFromSavedQuery(opts: {
  query: MyQuery;
  info: InfoSchema | null;
}): { action: 'hydrate' | 'reset'; reason?: string } {
  const { query, info } = opts;

  const txt = query?.queryText;
  if (!txt || txt.trim() === '' || !info?.queries) {
    return { action: 'hydrate' };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(txt);
  } catch {
    // Let the normal JSON hydration logic surface the parse error.
    return { action: 'hydrate' };
  }

  const qt = parsed?.queryType;
  if (typeof qt !== 'string' || qt.trim() === '') {
    return { action: 'hydrate' };
  }

  const spec = info.queries[qt];
  if (!spec) {
    return { action: 'reset', reason: `Unknown queryType: ${qt}` };
  }
  if (resolveGrafanaSupportLevel(spec) === 'disabled') {
    return { action: 'reset', reason: 'This query type is not supported for use in Grafana' };
  }

  return { action: 'hydrate' };
}


