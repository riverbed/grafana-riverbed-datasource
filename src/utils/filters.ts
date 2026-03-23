/*
 Filter key options algorithm:
 1) Inspect the selected query type spec from the runtime schema (API response).
 2) If no 'keys' entry appears under its 'filters', treat the 'filters' list itself
    as the complete set of selectable keys.
 3) If a 'keys' entry exists, build the selectable keys as the union of
    'expandedKeys' and 'properties' for that query type.
 4) De-duplicate keys, preserve a stable order (expandedKeys first, then any
    remaining unique properties), and return them as Select options.
*/

export type SelectOption = { label: string; value: string };

function normalizeToStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const result: string[] = [];
  for (const item of input) {
    if (typeof item === 'string') {
      result.push(item);
    } else if (item && typeof item === 'object') {
      // Try common field names if schema ever returns objects
      const maybe = (item as any).name ?? (item as any).id ?? (item as any).key;
      if (typeof maybe === 'string') {
        result.push(maybe);
      }
    }
  }
  return result;
}

function hasKeysOption(filters: unknown): boolean {
  if (!Array.isArray(filters)) {
    return false;
  }
  for (const item of filters) {
    if (typeof item === 'string') {
      if (item.trim().toLowerCase() === 'keys') return true;
    } else if (item && typeof item === 'object') {
      const candidate = (item as any).id ?? (item as any).name ?? (item as any).key ?? (item as any).type;
      if (typeof candidate === 'string' && candidate.trim().toLowerCase() === 'keys') return true;
    }
  }
  return false;
}

export function deriveFilterKeyStrings(queryTypeSpec: any | null | undefined): string[] {
  if (!queryTypeSpec) {
    return [];
  }

  const filtersList: string[] = normalizeToStringArray(queryTypeSpec.filters);
  const hasKeys = hasKeysOption(queryTypeSpec.filters);

  if (!hasKeys) {
    // No 'keys' option under filters: the filters list itself is the options
    // Return in the same order
    return filtersList;
  }

  // 'keys' is present: build from expandedKeys ∪ properties
  const expandedKeys: string[] = normalizeToStringArray(queryTypeSpec.expandedKeys);
  const properties: string[] = normalizeToStringArray(queryTypeSpec.properties);

  // De-duplicate, keep expandedKeys order first, then append unique properties
  const set = new Set<string>();
  const out: string[] = [];
  for (const k of expandedKeys) {
    if (!set.has(k)) {
      set.add(k);
      out.push(k);
    }
  }
  for (const p of properties) {
    if (!set.has(p)) {
      set.add(p);
      out.push(p);
    }
  }

  return out;
}

export function deriveFilterKeyOptions(queryTypeSpec: any | null | undefined): SelectOption[] {
  const items = deriveFilterKeyStrings(queryTypeSpec);
  const opts = items.map((k) => ({ label: k, value: k }));
  try {
    // Lazy import to avoid potential circular deps at module init
    const { sortOptionsByLabel } = require('./options') as { sortOptionsByLabel: (o: SelectOption[]) => SelectOption[] };
    return sortOptionsByLabel(opts);
  } catch {
    return opts;
  }
}

export function queryHasKeysOption(queryTypeSpec: any | null | undefined): boolean {
  if (!queryTypeSpec) return false;
  return hasKeysOption(queryTypeSpec.filters);
}

// Explicit semantic helper: legacy query types are those whose filters list exists
// and does NOT include a "keys" entry.
export function isLegacyQueryType(queryTypeSpec: any | null | undefined): boolean {
  if (!queryTypeSpec) return false;
  const hasList = Array.isArray((queryTypeSpec as any).filters);
  return hasList && !queryHasKeysOption(queryTypeSpec);
}
// Resolve a human-friendly label for a key id using the info.keys structure.
// Supports dot-notated keys like "application.name" by traversing nested properties.
// Internal traversal helpers (shared by label/type resolvers)
export function getKeyNode(infoKeys: any, id: string): any | undefined {
  if (!id || !infoKeys) return undefined;
  const parts = id.split('.');
  let node = (infoKeys as any)[parts[0] as any];
  if (!node) return undefined;
  for (let i = 1; i < parts.length; i++) {
    node = node?.properties?.[parts[i] as any];
    if (!node) return undefined;
  }
  return node;
}

export function resolveKeyProp(id: string, infoKeys: any, prop: 'label' | 'type'): string | undefined {
  if (!id || !infoKeys) return undefined;
  const node = getKeyNode(infoKeys, id);
  return node ? ((node as any)[prop] as string | undefined) : undefined;
}

export function resolveKeyLabel(id: string, infoKeys?: any): string {
  return resolveKeyProp(id, infoKeys, 'label') ?? id;
}

// Resolve a type hint for a key id using the info.keys structure.
// Returns undefined when type cannot be resolved; callers should fallback to "value".
export function resolveKeyType(id: string, infoKeys?: any): string | undefined {
  return resolveKeyProp(id, infoKeys, 'type');
}

// Variant that accepts infoKeys to return labeled options while keeping values as IDs
export function deriveFilterKeyOptionsLabeled(queryTypeSpec: any | null | undefined, infoKeys: any | undefined): SelectOption[] {
  const items = deriveFilterKeyStrings(queryTypeSpec);
  const opts = items.map((k) => ({ label: resolveKeyLabel(k, infoKeys), value: k }));
  try {
    const { sortOptionsByLabel } = require('./options') as { sortOptionsByLabel: (o: SelectOption[]) => SelectOption[] };
    return sortOptionsByLabel(opts);
  } catch {
    return opts;
  }
}


// Filter a list of select options by excluding keys already used in the same row,
// while preserving the currently selected key so it remains visible/selectable.
export function filterOptionsByUsedKeys(
  allOptions: SelectOption[],
  usedKeys: Set<string>,
  currentKey?: string
): SelectOption[] {
  if (!allOptions || allOptions.length === 0) {
    return [];
  }
  if (!usedKeys || usedKeys.size === 0) {
    return allOptions;
  }
  return allOptions.filter((opt) => opt.value === currentKey || !usedKeys.has(opt.value));
}


// Collect primaryKey leaves for a selected base key by traversing info.keys down its properties.
// Returns leaf ids RELATIVE to the base key (e.g., "protocol.number", "port.number") along with labels/types.
export function collectPrimaryKeyLeaves(infoKeys: any, baseKeyId: string): Array<{ id: string; label: string; type?: string }> {
  if (!infoKeys || !baseKeyId) {
    return [];
  }
  const baseNode = getKeyNode(infoKeys, baseKeyId) ?? (infoKeys as any)[baseKeyId];
  if (!baseNode) {
    return [];
  }

  const out: Array<{ id: string; label: string; type?: string }> = [];

  const walk = (node: any, relPath: string[]) => {
    const props = node?.properties;
    const hasProps = props && typeof props === 'object';

    if (hasProps) {
      for (const childId of Object.keys(props)) {
        walk(props[childId], [...relPath, childId]);
      }
    }

    const isLeaf = !hasProps || Object.keys(props).length === 0;
    if (node?.primaryKey === true && isLeaf) {
      const relId = relPath.join('.');
      // Prefer label/type from node; fall back to resolving via full id
      const fullId = `${baseKeyId}.${relId}`;
      const label = (node as any)?.label ?? resolveKeyLabel(fullId, infoKeys);
      const type = (node as any)?.type ?? resolveKeyType(fullId, infoKeys);
      out.push({ id: relId, label, type });
    }
  };

  walk(baseNode, []);
  return out;
}

// Build a nested object for a single keys item.
// Example: base "protoport" with values { "protocol.number": 6, "port.number": 80 } =>
// { protoport: { protocol: { number: 6 }, port: { number: 80 } } }
export function buildNestedKeyObject(
  item: { key?: string; value?: string | number; values?: Record<string, string | number> },
  _infoKeys: any
): Record<string, any> {
  const baseKey = item?.key;
  if (!baseKey) {
    return {};
  }

  const setPath = (root: any, path: string[], value: any) => {
    let cursor: any = root;
    for (let i = 0; i < path.length - 1; i++) {
      const segment = path[i] as any;
      if (typeof (cursor as any)[segment] !== 'object' || (cursor as any)[segment] === null) {
        (cursor as any)[segment] = {};
      }
      cursor = (cursor as any)[segment];
    }
    cursor[path[path.length - 1] as any] = value;
  };

  const nested: Record<string, any> = {};

  if (item.values && typeof item.values === 'object') {
    for (const relId of Object.keys(item.values)) {
      let value = (item.values as any)[relId];
      if (value === undefined || (typeof value === 'string' && value.trim() === '')) {
        continue;
      }
      // Coerce numeric strings to numbers when leaf type is numeric
      try {
        const fullId = `${baseKey}.${relId}`;
        const t = resolveKeyType(fullId, _infoKeys);
        const isNumeric = typeof t === 'string' && /(number|integer|float|double)/i.test(t);
        if (isNumeric && typeof value === 'string') {
          const maybe = Number(value);
          if (!Number.isNaN(maybe)) {
            value = maybe as any;
          }
        }
      } catch {
        // ignore type coercion failures
      }
      const parts = relId.split('.');
      setPath(nested, parts, value);
    }
  } else if (item.value !== undefined && !(typeof item.value === 'string' && item.value.trim() === '')) {
    // Fallback to common simple leaf "name"
    setPath(nested, ['name'], item.value);
  }

  if (Object.keys(nested).length === 0) {
    return {};
  }
  return { [baseKey]: nested };
}

// Deep-merge helper for combining sibling keys within a single row object.
export function mergeNestedObjects(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];
    if (srcVal && typeof srcVal === 'object' && !Array.isArray(srcVal)) {
      target[key] = mergeNestedObjects(tgtVal && typeof tgtVal === 'object' ? { ...tgtVal } : {}, srcVal);
    } else {
      target[key] = srcVal;
    }
  }
  return target;
}

// Parse a nested row object into an array of items with base keys and their values map.
// Each returned entry corresponds to one top-level base key within the object.
export function parseNestedKeyObject(
  rowObject: Record<string, any>,
  infoKeys: any
): Array<{ key: string; values?: Record<string, any>; value?: any }> {
  if (!rowObject || typeof rowObject !== 'object') {
    return [];
  }
  const results: Array<{ key: string; values?: Record<string, any>; value?: any }> = [];

  for (const baseKey of Object.keys(rowObject)) {
    const payload = rowObject[baseKey];
    if (!payload || typeof payload !== 'object') {
      continue;
    }
    const leaves = collectPrimaryKeyLeaves(infoKeys, baseKey);
    const outValues: Record<string, any> = {};

    const readPath = (obj: any, path: string[]): any => {
      let cur = obj;
      for (const seg of path) {
        if (cur == null || typeof cur !== 'object') {
          return undefined;
        }
        cur = cur[seg];
      }
      return cur;
    };

    for (const leaf of leaves) {
      const parts = leaf.id.split('.');
      const v = readPath(payload, parts);
      const hasValue = typeof v === 'string' ? v.trim().length > 0 : v !== undefined;
      if (hasValue) {
        outValues[leaf.id] = v;
      }
    }

    if (Object.keys(outValues).length > 0) {
      results.push({ key: baseKey, values: outValues });
    } else if (payload?.name !== undefined) {
      const v = payload.name;
      const hasValue = typeof v === 'string' ? v.trim().length > 0 : v !== undefined;
      if (hasValue) {
        results.push({ key: baseKey, value: v });
      }
    }
  }

  return results;
}

