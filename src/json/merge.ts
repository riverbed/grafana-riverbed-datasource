import { mergeNestedObjects } from '../utils/filters';

export type FormBody = {
  queryType?: string;
  metrics?: string[];
  properties?: string[];
  groupBy?: string[];
  topBy?: Array<{ id: string; direction: 'asc' | 'desc' }>;
  limit?: number;
  timeSeries?: boolean;
  comparedTo?: string;
  // filters can be either keys-based (non-legacy) or a legacy dictionary
  filters?: ({ keys?: Array<Record<string, string | number>> } & Record<string, any>);
};

const KNOWN_TOP_LEVEL: Array<keyof FormBody> = [
  'queryType',
  'metrics',
  'properties',
  'groupBy',
  'topBy',
  'limit',
  'timeSeries',
  'comparedTo',
  'filters',
];

function isEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

/**
 * Merge known form fields into an existing JSON, preserving unknown keys.
 * - Replaces known top-level fields with form values
 * - Deletes known fields when form intentionally clears them (e.g., empty arrays, undefined)
 * - For filters: replaces filters.keys only; preserves other subkeys under filters
 */
export function mergeFormIntoJson(
  original: any,
  formBody: FormBody,
  options?: { resetKnown?: boolean; legacyTypes?: string[] }
): any {
  const merged = (original && typeof original === 'object') ? JSON.parse(JSON.stringify(original)) : {};

  // Optionally drop all known fields first (used when switching query type)
  if (options?.resetKnown) {
    for (const key of KNOWN_TOP_LEVEL) {
      if (key === 'filters') {
        if (merged.filters && typeof merged.filters === 'object') {
          if ('keys' in merged.filters) {
            delete merged.filters.keys;
          }
          // Also clear legacy typed filters if provided
          if (options?.legacyTypes && Array.isArray(options.legacyTypes)) {
            for (const t of options.legacyTypes) {
              if (t in merged.filters) {
                delete merged.filters[t];
              }
            }
          }
          if (Object.keys(merged.filters).length === 0) {
            delete merged.filters;
          }
        }
        continue;
      }
      if (key in merged) {
        delete merged[key];
      }
    }
  }

  for (const key of KNOWN_TOP_LEVEL) {
    const value = (formBody as any)[key];

    if (key === 'filters') {
      const legacyTypes = options?.legacyTypes;
      const hasFilters = value && typeof value === 'object';

      if (!legacyTypes || (value && (value as any).keys !== undefined)) {
        // Non-legacy: Only manage filters.keys; keep other filters.* intact
        if (!hasFilters) {
          // Form cleared filters entirely: remove filters.keys (and filters if empty)
          if (merged.filters && typeof merged.filters === 'object' && 'keys' in merged.filters) {
            delete merged.filters.keys;
            if (Object.keys(merged.filters).length === 0) {
              delete merged.filters;
            }
          }
          continue;
        }
        const nextKeys = (value as any)?.keys;
        if (nextKeys && Array.isArray(nextKeys) && nextKeys.length > 0) {
          merged.filters = merged.filters && typeof merged.filters === 'object' ? merged.filters : {};
          merged.filters.keys = nextKeys;
        } else {
          // Explicitly clear filters.keys
          if (merged.filters && typeof merged.filters === 'object' && 'keys' in merged.filters) {
            delete merged.filters.keys;
            if (Object.keys(merged.filters).length === 0) {
              delete merged.filters;
            }
          }
        }
        continue;
      }

      // Legacy: replace per-typed arrays while preserving unknown subkeys via deep merge
      const nextFilters = hasFilters ? (value as any) : undefined;
      merged.filters = merged.filters && typeof merged.filters === 'object' ? merged.filters : {};
      for (const t of legacyTypes) {
        const arr = nextFilters ? nextFilters[t] : undefined;
        if (Array.isArray(arr) && arr.length > 0) {
          const prevArr = Array.isArray(merged.filters[t]) ? (merged.filters[t] as any[]) : [];
          const mergedArr: any[] = [];
          const maxLen = Math.max(prevArr.length, arr.length);
          for (let i = 0; i < maxLen; i++) {
            const incoming = arr[i];
            const prev = prevArr[i];
            if (incoming && prev && typeof prev === 'object') {
              // Overlay primary/known fields from form onto existing JSON, preserving non-primary fields.
              mergedArr.push(mergeNestedObjects({ ...prev }, incoming));
            } else if (incoming) {
              mergedArr.push(incoming);
            } else if (prev) {
              mergedArr.push(prev);
            }
          }
          merged.filters[t] = mergedArr;
        } else if (t in merged.filters) {
          delete merged.filters[t];
        }
      }
      if (Object.keys(merged.filters).length === 0) {
        delete merged.filters;
      }
      continue;
    }

    // Handle other known top-level fields
    const shouldDelete =
      value === undefined ||
      (typeof value === 'string' && value.length === 0) ||
      isEmptyArray(value);
    if (shouldDelete) {
      if (key in merged) {
        delete merged[key];
      }
      continue;
    }

    (merged as any)[key] = value;
  }

  return merged;
}


