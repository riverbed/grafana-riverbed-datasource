/* Version accessor: prefer injected build-time constant, fallback to 'dev' */
declare const __PLUGIN_VERSION__: string | undefined;
let cached: string | undefined;

export function getPluginVersion(): string {
  if (cached) return cached;
  const injected = typeof __PLUGIN_VERSION__ !== 'undefined' ? __PLUGIN_VERSION__ : undefined;
  cached = injected || 'unset';
  return cached;
}


