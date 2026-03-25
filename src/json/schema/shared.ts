import { resolveKeyType } from '../../utils/filters';

export const isNumericType = (t?: string) => !!(t && /(number|integer|float|double)/i.test(t || ''));
export const isBooleanType = (t?: string) => !!(t && /boolean/i.test(t || ''));

export function buildSchemaFromInfoNode(node: any): any | null {
  if (!node || typeof node !== 'object') {
    return { type: 'object', additionalProperties: true };
  }
  const props = node.properties && typeof node.properties === 'object' ? node.properties : {};
  const propEntries = Object.keys(props);
  if (propEntries.length === 0) {
    if (node.primaryKey !== true) {
      return null;
    }
    const t = typeof node.type === 'string' ? node.type : undefined;
    const isNum = isNumericType(t);
    const schemaLeaf: any = { type: isNum ? 'number' : 'string' };
    if (node.label) {
      schemaLeaf.title = String(node.label);
    }
    return schemaLeaf;
  }
  const out: any = { type: 'object', properties: {} as Record<string, any>, additionalProperties: true };
  for (const childId of propEntries) {
    const childSchema = buildSchemaFromInfoNode(props[childId]);
    if (childSchema) {
      out.properties[childId] = childSchema;
      if (props[childId]?.label && typeof childSchema === 'object') {
        out.properties[childId].title = String(props[childId].label);
      }
    }
  }
  if (Object.keys(out.properties).length === 0) {
    return null;
  }
  return out;
}

export function buildSkeletonFromInfoNode(node: any): any | null {
  if (!node || typeof node !== 'object') {
    return null;
  }
  const props = node.properties && typeof node.properties === 'object' ? node.properties : {};
  const propEntries = Object.keys(props);
  if (propEntries.length === 0) {
    if (node.primaryKey !== true) {
      return null;
    }
    const t = typeof node.type === 'string' ? node.type : undefined;
    if (isNumericType(t)) {
      return 0;
    }
    if (isBooleanType(t)) {
      return false;
    }
    return '';
  }
  const out: any = {};
  for (const childId of propEntries) {
    const sk = buildSkeletonFromInfoNode(props[childId]);
    if (sk !== null) {
      out[childId] = sk;
    }
  }
  if (Object.keys(out).length === 0) {
    return null;
  }
  return out;
}

export function collectLeafKeyIds(infoKeysObj: any): string[] {
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
}

export function getLeafTypeForKeyId(keyId: string, infoKeys: any): string | undefined {
  const t = resolveKeyType(keyId, infoKeys);
  if (t) {
    return t;
  }
  const flat = infoKeys && (infoKeys as any)[keyId];
  return flat && typeof flat.type === 'string' ? flat.type : undefined;
}


