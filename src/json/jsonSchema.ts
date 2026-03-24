/*
  Utilities to build a dynamic JSON schema for the Advanced/Together editors.
  The schema drives Monaco's built-in JSON autocomplete for keys and values.
*/

import { deriveFilterKeyStrings, getKeyNode, resolveKeyType, resolveKeyLabel } from '../utils/filters';

export function buildSchema(info: any, currentQueryType: any | null) {
  const queries = info?.queries ?? {};
  const queryTypeEnum: string[] = Object.keys(queries);
  const metrics: string[] = Array.isArray(currentQueryType?.metrics) ? currentQueryType.metrics : [];
  const expandedKeys: string[] = Array.isArray(currentQueryType?.expandedKeys) ? currentQueryType.expandedKeys : [];
  const properties: string[] = Array.isArray(currentQueryType?.properties) ? currentQueryType.properties : [];

  const filterKeyNames: string[] = currentQueryType ? deriveFilterKeyStrings(currentQueryType) : [];
  const hasKeysOption = Array.isArray(currentQueryType?.filters)
    ? currentQueryType.filters.some((f: any) => typeof f === 'string' && f.toLowerCase() === 'keys')
    : false;
  const legacyTypes: string[] = Array.isArray(currentQueryType?.filters)
    ? currentQueryType.filters.filter((f: any) => typeof f === 'string' && f.toLowerCase() !== 'keys')
    : [];
  const infoKeys = info?.keys ?? {};

  // Recursively convert an info.keys node into JSON schema for autocomplete
  // Return a JSON schema object for this node, or null when no primary leaves exist under it (to omit from suggestions).
  const buildSchemaFromInfoNode = (node: any): any | null => {
    if (!node || typeof node !== 'object') {
      return { type: 'object', additionalProperties: true };
    }
    const props = node.properties && typeof node.properties === 'object' ? node.properties : {};
    const propEntries = Object.keys(props);
    // Leaf if no nested properties
    if (propEntries.length === 0) {
      // Only suggest primaryKey leaves for legacy types
      if (node.primaryKey !== true) {
        return null;
      }
      const t = typeof node.type === 'string' ? node.type : undefined;
      const isNum = !!(t && /(number|integer|float|double)/i.test(t));
      const schemaLeaf: any = { type: isNum ? 'number' : 'string' };
      if (node.label) {
        schemaLeaf.title = String(node.label);
      }
      return schemaLeaf;
    }
    // Object with nested children
    const out: any = {
      type: 'object',
      properties: {} as Record<string, any>,
      additionalProperties: true,
    };
    for (const childId of propEntries) {
      const childSchema = buildSchemaFromInfoNode(props[childId]);
      if (childSchema) {
        out.properties[childId] = childSchema;
        // Add title from child label when available to improve UX
        if (props[childId]?.label && typeof childSchema === 'object') {
          out.properties[childId].title = String(props[childId].label);
        }
      }
    }
    // If no children remain after filtering, omit this branch
    if (Object.keys(out.properties).length === 0) {
      return null;
    }
    return out;
  };

  // Build a skeleton object containing only primaryKey leaves nested under this node
  const buildSkeletonFromInfoNode = (node: any): any | null => {
    if (!node || typeof node !== 'object') {
      return null;
    }
    const props = node.properties && typeof node.properties === 'object' ? node.properties : {};
    const propEntries = Object.keys(props);
    if (propEntries.length === 0) {
      // leaf
      if (node.primaryKey === true) {
        // Use a type-appropriate placeholder
        const t = typeof node.type === 'string' ? node.type : undefined;
        if (t && /(number|integer|float|double)/i.test(t)) {
          return 0;
        }
        if (t && /boolean/i.test(t)) {
          return false;
        }
        return "";
      }
      return null;
    }
    // nested
    const out: any = {};
    for (const childId of propEntries) {
      const childSkeleton = buildSkeletonFromInfoNode(props[childId]);
      if (childSkeleton !== null) {
        out[childId] = childSkeleton;
      }
    }
    if (Object.keys(out).length === 0) {
      return null;
    }
    return out;
  };

  // Collect full dotted key ids for leaves in info.keys (fallback for keys-mode suggestions)
  const collectLeafKeyIds = (infoKeysObj: any): string[] => {
    if (!infoKeysObj || typeof infoKeysObj !== 'object') {
      return [];
    }
    const out: string[] = [];
    const dive = (baseId: string, node: any, trail: string[]) => {
      const props = node?.properties && typeof node.properties === 'object' ? node.properties : {};
      const keys = Object.keys(props);
      if (keys.length === 0) {
        const full = trail.length ? `${baseId}.${trail.join('.')}` : baseId;
        out.push(full);
        return;
      }
      for (const k of keys) {
        dive(baseId, props[k], [...trail, k]);
      }
    };
    for (const top of Object.keys(infoKeysObj)) {
      const node = infoKeysObj[top];
      const hasProps = node?.properties && typeof node.properties === 'object' && Object.keys(node.properties).length > 0;
      if (hasProps) {
        dive(top, node, []);
      } else {
        out.push(top);
      }
    }
    return out;
  };

  const buildLegacyTypeItemsSchema = (typeId: string): any => {
    // Try to resolve the base node either via getKeyNode (dot-safe) or direct
    const base = getKeyNode(infoKeys, typeId) ?? infoKeys?.[typeId];
    if (base) {
      const schemaObj = buildSchemaFromInfoNode(base);
      const skeleton = buildSkeletonFromInfoNode(base);
      if (schemaObj) {
        // Also attach object-level defaultSnippets so typing within the array can quickly insert another object
        const withSnippets = { ...schemaObj } as any;
        if (skeleton) {
          withSnippets.defaultSnippets = [
            {
              label: `Add ${resolveKeyLabel(typeId, infoKeys) || typeId} object`,
              body: skeleton,
            },
          ];
        }
        return withSnippets;
      }
    }
    // Fallback permissive object
    return { type: 'object', additionalProperties: true };
  };

  // Helper to get leaf type for full dotted key id; supports both nested and flattened entries
  const getLeafTypeForKeyId = (keyId: string): string | undefined => {
    const t = resolveKeyType(keyId, infoKeys);
    if (t) {
      return t;
    }
    const flat = infoKeys && (infoKeys as any)[keyId];
    const flatType = flat && typeof flat.type === 'string' ? flat.type : undefined;
    return flatType;
  };

  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    additionalProperties: true,
    properties: {
      queryType: { type: 'string', enum: queryTypeEnum },
      metrics: {
        type: 'array',
        items: { type: 'string', enum: metrics },
      },
      groupBy: {
        type: 'array',
        items: { type: 'string', enum: expandedKeys },
      },
      properties: {
        type: 'array',
        items: { type: 'string', enum: properties },
      },
      topBy: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', enum: metrics },
            direction: { type: 'string', enum: ['asc', 'desc'] },
          },
        },
      },
      timeSeries: { type: 'boolean' },
      // comparedTo: { type: 'string', enum: ['yesterday', 'last_week', '4_weeks_ago'] }, -- no supported yet (Grafana should just do this anyway)
      limit: { type: 'number' },
      filters: hasKeysOption
        ? (() => {
            // Build defaultSnippets for items (object) and array to add first key/value quickly
            const itemSnippets: any[] = [];
            const arraySnippets: any[] = [];
            const candidateKeys = (filterKeyNames && filterKeyNames.length > 0) ? filterKeyNames : collectLeafKeyIds(infoKeys);
            for (const k of candidateKeys) {
              const t = getLeafTypeForKeyId(k);
              let def: any = '';
              if (t && /(number|integer|float|double)/i.test(t)) {
                def = 0;
              } else if (t && /boolean/i.test(t)) {
                def = false;
              }
              const bodyObj: any = { [k]: def };
              itemSnippets.push({
                label: `${resolveKeyLabel(k, infoKeys) || k}`,
                body: bodyObj,
              });
              arraySnippets.push({
                label: `${resolveKeyLabel(k, infoKeys) || k}`,
                body: [bodyObj],
              });
            }
            // Build properties map so picking a key inserts the key and a typed default value
            const itemProperties: Record<string, any> = {};
            for (const k of candidateKeys) {
              const t = getLeafTypeForKeyId(k);
              const isNum = !!(t && /(number|integer|float|double)/i.test(t));
              const isBool = !!(t && /boolean/i.test(t));
              itemProperties[k] = {
                type: isNum ? 'number' : isBool ? 'boolean' : 'string',
                title: resolveKeyLabel(k, infoKeys) || k,
                default: isNum ? 0 : isBool ? false : '',
              };
            }
            return {
              type: 'object',
              // When user selects "filters", offer snippets that insert { "keys": [ { "<key>": <typedDefault> } ] }
              defaultSnippets: arraySnippets.length
                ? arraySnippets.map((s) => ({
                    label: s.label,
                    body: { keys: s.body },
                  }))
                : undefined,
              properties: {
                keys: {
                  type: 'array',
                  defaultSnippets: arraySnippets.length ? arraySnippets : undefined,
                  items: {
                    type: 'object',
                    // Define explicit properties so selecting a key inserts typed default value
                    properties: itemProperties,
                    // propertyNames kept to still allow free-form when needed
                    propertyNames: (filterKeyNames && filterKeyNames.length) ? { enum: filterKeyNames } : undefined,
                    additionalProperties: true,
                    defaultSnippets: itemSnippets.length ? itemSnippets : undefined,
                  },
                },
              },
            };
          })()
        : {
            type: 'object',
            properties: legacyTypes.reduce((acc: any, t) => {
              const base = getKeyNode(infoKeys, t) ?? infoKeys?.[t];
              const itemsSchema = buildLegacyTypeItemsSchema(t);
              const skeleton = base ? buildSkeletonFromInfoNode(base) : null;
              const arrSchema: any = {
                type: 'array',
                items: itemsSchema,
              };
              // Attach array-level defaultSnippets to insert one skeleton object
              if (skeleton) {
                arrSchema.defaultSnippets = [
                  {
                    label: `Add ${resolveKeyLabel(t, infoKeys) || t} filter`,
                    body: [skeleton],
                  },
                ];
              }
              acc[t] = arrSchema;
              return acc;
            }, {} as Record<string, any>),
            additionalProperties: true,
          },
    },
  } as any;

  return schema;
}


