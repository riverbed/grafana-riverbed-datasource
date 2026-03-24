import type { GrafanaSupportLevel, QueryTypeSpec } from '../types';

// Default behavior when supportGrafanaPlugIn is not provided by metadata.
export const GRAFANA_QUERY_TYPE_SUPPORTED_DEFAULT: GrafanaSupportLevel = 'enabled';

export const resolveGrafanaSupportLevel = (spec?: QueryTypeSpec | null): GrafanaSupportLevel => {
  if (!spec) {
    return GRAFANA_QUERY_TYPE_SUPPORTED_DEFAULT;
  }
  const value = spec.supportGrafanaPlugIn;
  if (value === 'disabled' || value === 'alpha' || value === 'beta' || value === 'enabled') {
    return value;
  }
  return GRAFANA_QUERY_TYPE_SUPPORTED_DEFAULT;
};

export const isQueryTypeSupportedInGrafana = (spec?: QueryTypeSpec | null): boolean => {
  return resolveGrafanaSupportLevel(spec) !== 'disabled';
};

export const getGrafanaSupportPrefix = (level: GrafanaSupportLevel): string => {
  if (level === 'alpha') {
    return '(alpha) ';
  }
  if (level === 'beta') {
    return '(beta) ';
  }
  return '';
};

export const getGrafanaSupportWarning = (level: GrafanaSupportLevel): string | undefined => {
  if (level === 'alpha') {
    return 'This query type is in alpha. Results and behavior may change.';
  }
  if (level === 'beta') {
    return 'This query type is in beta. Results and behavior may change.';
  }
  return undefined;
};
