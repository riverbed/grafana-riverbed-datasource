import {
  DataSourceInstanceSettings,
  CoreApp,
  ScopedVars,
  DataSourceApi,
  DataSourceJsonData,
} from '@grafana/data';
import type { DataQuery } from '@grafana/schema';
import { DataSourceWithBackend, getTemplateSrv } from '@grafana/runtime';

import { MyQuery, MyDataSourceOptions, DEFAULT_QUERY } from './types';
import {
  ensureQueryTextFromForm as ensureQueryTextFromFormUtil,
  inferOriginPluginId,
  makeDefaultQuery,
  RIVERBED_PLUGIN_ID,
  shouldPreserveQueriesOnSwitch,
} from './utils/queryLifecycle';

export class DataSource extends DataSourceWithBackend<MyQuery, MyDataSourceOptions> {
  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
  }

  getDefaultQuery(_: CoreApp): Partial<MyQuery> {
    return DEFAULT_QUERY;
  }

  applyTemplateVariables(query: MyQuery, scopedVars: ScopedVars) {
    const withText = this.ensureQueryTextFromForm(query);
    const finalText = getTemplateSrv().replace(withText.queryText, scopedVars);
    try {
      // console.log('[RB DS] outgoing body', JSON.parse(finalText));
    } catch {
      // console.log('[RB DS] outgoing body (raw)', finalText);
    }
    return { ...withText, queryText: finalText };
  }

  filterQuery(query: MyQuery): boolean {
    // Block execution when JSON contains an unknown/invalid queryType as signaled by the editor.
    if (query.ui && (query.ui as any).blockExecutionForUnknownQueryType === true) {
      return false;
    }
    // Allow when we have JSON or at least a query type selected.
    return !!(query.queryText || query.queryTypeId);
  }

  async callInfo(): Promise<any> {
    // Use Grafana helper that automatically prefixes the datasource resource URL
    return await this.getResource('proxy/info');
  }

  async postQuery(body: any): Promise<any> {
    // Use Grafana helper to POST to datasource resource
    return await this.postResource('proxy/queries', body);
  }

  /**
   * Participate in Grafana Explore datasource switching.
   *
   * - When switching into Riverbed from a non-Riverbed datasource, ignore the
   *   incoming queries and start from a clean DEFAULT_QUERY.
   * - When switching between two Riverbed instances, preserve the existing
   *   Riverbed query JSON (ensuring queryText exists) so the new instance can
   *   revalidate it against its own metadata.
   *
   * NOTE: Resetting queries when leaving Riverbed (Riverbed -> non-Riverbed)
   * must be implemented by the destination datasource's importQueries or by
   * Grafana core; this plugin cannot enforce that direction.
   */
  async importQueries(
    queries: DataQuery[],
    origin: DataSourceApi<DataQuery, DataSourceJsonData>
  ): Promise<MyQuery[]> {
    const originPluginId = inferOriginPluginId(origin);
    const firstRefId = (queries?.[0] as any)?.refId as string | undefined;

    // When switching into Riverbed from a non-Riverbed datasource, ignore the incoming
    // queries and start from a clean default query (preserving refId when available).
    if (!shouldPreserveQueriesOnSwitch(originPluginId, RIVERBED_PLUGIN_ID)) {
      return [makeDefaultQuery(firstRefId)];
    }

    const typedQueries = (queries as MyQuery[]) || [];

    // Origin is Riverbed: preserve existing queries, but ensure queryText exists.
    if (!Array.isArray(typedQueries) || typedQueries.length === 0) {
      return [makeDefaultQuery(firstRefId)];
    }

    return typedQueries.map((q) => this.ensureQueryTextFromForm(q));
  }

  private ensureQueryTextFromForm(query: MyQuery): MyQuery {
    return ensureQueryTextFromFormUtil(query);
  }
}
