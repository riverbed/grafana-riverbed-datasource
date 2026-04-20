import type { QueryTypeSpec } from '../types';

export const QUERY_TYPE_SUPPORT_TIME_DEFAULT = true;

export const doesQueryTypeSupportTime = (spec?: QueryTypeSpec | null): boolean => {
  if (!spec) {
    return QUERY_TYPE_SUPPORT_TIME_DEFAULT;
  }
  return spec.supportTime !== false;
};

