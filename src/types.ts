import { DataSourceJsonData } from '@grafana/data';
import { DataQuery } from '@grafana/schema';

// Strongly-typed metadata returned from backend /proxy/info
export interface InfoKeyNode {
  label?: string;
  type?: string;
  primaryKey?: boolean;
  hidden?: boolean;
  properties?: Record<string, InfoKeyNode>;
}

export interface InfoSchema {
  // Map of queryTypeId -> spec
  queries?: Record<string, QueryTypeSpec>;
  // Root keys dictionary for labels/types and nested structures
  keys?: Record<string, InfoKeyNode>;
  // Optional metrics dictionary to resolve labels
  metrics?: Record<string, { label?: string; id?: string; type?: string }>;
}

export type GrafanaSupportLevel = 'disabled' | 'alpha' | 'beta' | 'enabled';

export interface QueryTypeSpec {
  // Human label for query type
  label?: string;
  // Allowed metrics and properties for this type
  metrics?: string[];
  properties?: string[];
  // Expanded, fully-qualified keys suitable for selection
  expandedKeys?: string[];
  // Supported query type flavors (e.g., 'time_series')
  supportedQueryTypes?: string[];
  // For legacy types, a list of filter buckets (no 'keys' present means legacy)
  // For keys-mode, this list includes the literal string 'keys'
  filters?: Array<string | { id?: string; name?: string; key?: string; type?: string }>;
  // Whether this query type is supported for use in the Grafana plugin.
  supportGrafanaPlugIn?: GrafanaSupportLevel;
}

export type FilterItem =
  | { type: 'keys'; key?: string; value?: string | number; values?: Record<string, string | number> }
  | { type: 'application'; name?: string }
  | { type: 'network_device'; name?: string }
  | { type: 'network_interface'; name?: string }
  | { type: 'location'; name?: string }
  | { type: 'network_client'; ipaddr?: string; name?: string }
  | { type: 'network_server'; ipaddr?: string; name?: string }
  | { type: 'protocol'; number?: number | string }
  | { type: 'protoport'; protocol?: number | string; port?: number | string }
  // Generic filter from metadata with no schema; accept a single string value
  | { type: 'custom'; filterId: string; value?: string };

export interface FilterRow {
  items: FilterItem[];
}

export interface FormFilters {
  // Flat keys OR-rows; each row is AND of entries
  keys?: Array<Record<string, string | number>>;
  // Basic legacy object filters (v1)
  application?: Array<{ name?: string }>;
  network_device?: Array<{ name?: string }>;
  network_interface?: Array<{ name?: string }>;
  location?: Array<{ name?: string }>;
  network_client?: Array<{ ipaddr?: string; name?: string }>;
  network_server?: Array<{ ipaddr?: string; name?: string }>;
}

export interface TopBySpec { id: string; direction: 'asc' | 'desc'; }

// Legacy filters editor state: for each legacy type id (no 'keys' in filters),
// store an array of value maps keyed by primaryKey leaf ids relative to the type root.
export interface LegacyFiltersState {
  [typeId: string]: Array<Record<string, string | number>>;
}

export interface MyQuery extends DataQuery {
  // UI-only preferences
  ui?: {
    showJson?: boolean;
    // When true, block execution because JSON contains an unknown/invalid queryType
    blockExecutionForUnknownQueryType?: boolean;
  };
  // Advanced
  queryText?: string;
  jsonEditorHeight?: number;
  // Split view percentage width for left/form pane
  editorSplit?: number;
  // Form state
  queryTypeId?: string; // e.g., "network_interface.traffic"
  metrics?: string[];
  groupBy?: string[];
  // When query type defines properties, selected properties to include in request
  properties?: string[];
  // New dynamic filter rows (OR rows, AND within)
  filterRows?: FilterRow[];
  // Legacy filters (dictionary of type -> array of objects), UI state as leaf value maps
  legacyFilters?: LegacyFiltersState;
  // Legacy structure (no backward-compat logic; may be unused going forward)
  filters?: FormFilters;
  topBy?: TopBySpec[];
  limit?: number;
  timeSeries?: boolean;
  comparedTo?: 'yesterday' | 'last_week' | '4_weeks_ago';
}

export const DEFAULT_QUERY: Partial<MyQuery> = {
  jsonEditorHeight: 220,
  ui: { showJson: false },
  limit: 10,
};

export interface DataPoint {
  Time: number;
  Value: number;
}

export interface DataSourceResponse {
  datapoints: DataPoint[];
}

/**
 * These are options configured for each DataSource instance
 */
export interface MyDataSourceOptions extends DataSourceJsonData {
  tokenUrl?: string;
  scope?: string;
  apiBaseUrl?: string;
  tenantId?: string;
  clientId?: string;
  /**
   * Optional API version to use for the `info` endpoint.
   */
  infoApiVersion?: string;
  /**
   * Optional API version to use for the `queries` endpoint.
   */
  queriesApiVersion?: string;
}

/**
 * Value that is used in the backend, but never sent over HTTP to the frontend
 */
export interface MySecureJsonData {
  clientSecret?: string;
}

// Warning/Error metadata surfaced by the server (per sub-query)
export interface ServerNoticeMeta {
  code?: string;
  message?: string;
}

export interface ServerDataSourceMeta {
  name?: string;
  type?: string;
  baseUrl?: string;
}

// Naming refactor (non-breaking): public aliases
export type DatastoreQuery = MyQuery;
export type DatastoreOptions = MyDataSourceOptions;
