/**
 * Compute paths present in parsed JSON that are not part of the normalized form body.
 * - Reports unknown top-level keys (not in formBody)
 * - Reports nested keys under filters.* except filters.keys
 */
export function diffUnmappedPaths(parsed: any, formBody: any): string[] {
  const out: string[] = [];
  if (!parsed || typeof parsed !== 'object') {
    return out;
  }
  const topKeys = Object.keys(parsed);
  const formKeys = new Set(Object.keys(formBody || {}));

  for (const k of topKeys) {
    if (k === 'filters') {
      const pFilters = parsed.filters;
      const fFilters = formBody?.filters || {};
      if (pFilters && typeof pFilters === 'object') {
        for (const sub of Object.keys(pFilters)) {
          if (sub === 'keys') {
            // Only mapped when present in formBody
            const hasKeys = Array.isArray(fFilters.keys);
            if (!hasKeys && Array.isArray(pFilters.keys) && pFilters.keys.length > 0) {
              out.push('$.filters.keys');
            }
            continue;
          }
          // Any other filters.* is considered unmapped
          out.push(`$.filters.${sub}`);
        }
      }
      continue;
    }

    if (!formKeys.has(k)) {
      out.push(`$.${k}`);
    }
  }
  return out;
}


