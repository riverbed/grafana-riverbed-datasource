import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stack, Alert, useTheme2, Button, InlineSwitch } from '@grafana/ui';
import { QueryEditorProps } from '@grafana/data';
import { DataSource } from '../datasource';
import { deriveFilterKeyStrings, queryHasKeysOption, parseNestedKeyObject } from '../utils/filters';
import { MyDataSourceOptions, MyQuery, TopBySpec, FilterRow, InfoSchema, QueryTypeSpec } from '../types';
import { InfoContext } from '../context/InfoContext';
import { diffUnmappedPaths } from '../json/diff';
import { getPluginVersion } from '../utils/version';
import { buildBodyFromForm as buildBodyFromFormUtil } from '../utils/queryMapping';
import { resolveGrafanaSupportLevel } from '../utils/grafanaSupport';
import { decideHydrationFromSavedQuery, makeDefaultQuery } from '../utils/queryLifecycle';
import { useJsonSync } from '../hooks/useJsonSync';
import { QueryForm } from './query/QueryForm';
import { QueryJsonPanel } from './query/QueryJsonPanel';

type Props = QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>;

// Helpers used for partial-hydration warning comparisons.
function normalizeAllowedFields(obj: any) {
  const out: any = {};
  if (!obj || typeof obj !== 'object') {
    return out;
  }
  if (typeof obj.queryType === 'string') {
    out.queryType = obj.queryType;
  }
  if (Array.isArray(obj.metrics)) {
    out.metrics = obj.metrics;
  }
  if (Array.isArray(obj.properties)) {
    out.properties = obj.properties;
  }
  if (Array.isArray(obj.groupBy)) {
    out.groupBy = obj.groupBy;
  }
  if (Array.isArray(obj.topBy)) {
    out.topBy = obj.topBy;
  }
  if (typeof obj.limit === 'number') {
    out.limit = obj.limit;
  }
  if (typeof obj.timeSeries === 'boolean') {
    out.timeSeries = obj.timeSeries;
  }
  if (typeof obj.comparedTo === 'string') {
    out.comparedTo = obj.comparedTo;
  }
  if (obj.filters && Array.isArray(obj.filters?.keys)) {
    out.filters = { keys: obj.filters.keys };
  }
  return out;
}

function stableStringify(value: any): string {
  const seen = new WeakSet();
  const sortObj = (v: any): any => {
    if (v === null || typeof v !== 'object') {
      return v;
    }
    if (seen.has(v)) {
      return undefined;
    }
    seen.add(v);
    if (Array.isArray(v)) {
      return v.map(sortObj);
    }
    const keys = Object.keys(v).sort();
    const o: any = {};
    for (const k of keys) {
      o[k] = sortObj(v[k]);
    }
    return o;
  };
  return JSON.stringify(sortObj(value));
}

export function QueryEditor({ query, onChange, onRunQuery, datasource, data }: Props) {
  const theme = useTheme2();
  // Metadata loading
  const [info, setInfo] = useState<InfoSchema | null>(null);
  const [infoError, setInfoError] = useState<string | undefined>(undefined);
  const [infoLoading, setInfoLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    setInfoLoading(true);
    setInfoError(undefined);
    (async () => {
      try {
        const resp = await datasource.callInfo();
        if (!cancelled) {
          setInfo(resp);
          setInfoLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setInfoError(err?.message ?? 'Failed to load metadata');
          setInfoLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [datasource]);

  const showJson = !!query.ui?.showJson;
  const [lastEditSource, setLastEditSource] = useState<'form' | 'json'>('form');

  // Compute current query type spec early for validation/mapping
  const currentQueryType: QueryTypeSpec | null = useMemo(() => {
    if (!info || !query?.queryTypeId) {
      return null;
    }
    const q = info?.queries?.[query.queryTypeId];
    return q || null;
  }, [info, query?.queryTypeId]);

  // Surface backend notices (warnings/errors) for this refId in the editor
  const noticesBySeverity = useMemo(() => {
    const res: { error: string[]; warning: string[] } = { error: [], warning: [] };
    const seen = new Set<string>();
    const frames = data?.series ?? [];
    for (const f of frames) {
      if ((f as any).refId && (f as any).refId !== query.refId) {
        continue;
      }
      const n = (f as any).meta?.notices ?? [];
      for (const item of n) {
        const sev = (item?.severity ?? '').toLowerCase();
        const txt = String(item?.text ?? '').trim();
        if (!txt) {
          continue;
        }
        const key = `${sev}:${txt}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        if (sev === 'error') {
          res.error.push(txt);
        } else if (sev === 'warning') {
          res.warning.push(txt);
        }
      }
    }
    return res;
  }, [data, query.refId]);

  // Helpers to map between form <-> JSON
  const buildBodyFromForm = useCallback(
    (q: MyQuery) => buildBodyFromFormUtil(info, q, currentQueryType),
    [info, currentQueryType]
  );

  const handleFormChange = useCallback(
    (next: MyQuery) => {
      const cleared: MyQuery = {
        ...next,
        ui: {
          ...(next.ui || {}),
          blockExecutionForUnknownQueryType: false,
        },
      };
      setLastEditSource('form');
      onChange(cleared);
    },
    [onChange]
  );

  // Tracks validation errors from the last JSON -> Form mapping
  const lastValidationErrorsRef = useRef<string | undefined>(undefined);
  // Prevent repeated reset requests for the same saved JSON during async re-renders.
  const lastResetQueryTextRef = useRef<string | undefined>(undefined);

  const applyFormFromJSON = useCallback(
    (parsed: any): MyQuery => {
      const errors: string[] = [];

      // Determine target query type first
      let selectedQueryTypeId: string | undefined = query.queryTypeId;
      let invalidQueryType = false;
      if (typeof parsed?.queryType === 'string') {
        const queries = info?.queries;
        if (queries && Object.prototype.hasOwnProperty.call(queries, parsed.queryType)) {
          const spec = queries[parsed.queryType];
          const supportLevel = resolveGrafanaSupportLevel(spec);
          if (supportLevel !== 'disabled') {
            selectedQueryTypeId = parsed.queryType;
          } else {
            errors.push('This query type is not supported for use in Grafana');
            invalidQueryType = true;
          }
        } else {
          errors.push(`Unknown queryType: ${parsed.queryType}`);
          invalidQueryType = true;
        }
      }

      // Build a cleared baseline for known fields (overwrite strategy)
      const baseline: MyQuery = {
        ...query,
        queryTypeId: selectedQueryTypeId ?? query.queryTypeId,
        metrics: [],
        properties: [],
        groupBy: [],
        topBy: [],
        limit: undefined,
        timeSeries: false,
        filterRows: [],
        legacyFilters: {},
        filters: undefined,
        comparedTo: undefined,
      };

      const next: MyQuery = { ...baseline };

      // If queryType is unknown, stop validating the rest of JSON.
      if (invalidQueryType) {
        next.ui = {
          ...(next.ui || {}),
          blockExecutionForUnknownQueryType: true,
        };
        const errorText = errors.length ? errors.join('; ') : undefined;
        setJsonValidationError(errorText);
        lastValidationErrorsRef.current = errorText;
        return next;
      }

      const selectedSpec: any = selectedQueryTypeId ? info?.queries?.[selectedQueryTypeId] : currentQueryType;

      // Helpers for validating lists
      const ensureStrings = (arr: any): string[] =>
        Array.isArray(arr) ? arr.filter((x: any) => typeof x === 'string') : [];
      const setValidatedList = (
        field: 'metrics' | 'properties' | 'groupBy',
        values: string[] | undefined,
        allowed: string[] | undefined,
        label: string
      ) => {
        if (!values) {
          return;
        }
        const allowedSet = new Set(allowed || []);
        const valid = values.filter((v) => allowedSet.has(v));
        const invalid = values.filter((v) => !allowedSet.has(v));
        if (invalid.length) {
          errors.push(`${label} not allowed: ${invalid.join(', ')}`);
        }
        (next as any)[field] = valid;
      };

      // metrics
      if (Array.isArray(parsed?.metrics)) {
        setValidatedList(
          'metrics',
          ensureStrings(parsed.metrics),
          ensureStrings(selectedSpec?.metrics),
          'Metrics'
        );
      }

      // properties vs groupBy
      if (Array.isArray(parsed?.properties)) {
        if (Array.isArray(selectedSpec?.properties) && selectedSpec.properties.length > 0) {
          setValidatedList(
            'properties',
            ensureStrings(parsed.properties),
            ensureStrings(selectedSpec.properties),
            'Properties'
          );
        } else if (parsed.properties && parsed.properties.length) {
          errors.push('Properties not supported by selected query type');
        }
      }
      if (Array.isArray(parsed?.groupBy)) {
        const allowedGB = ensureStrings(selectedSpec?.expandedKeys);
        setValidatedList('groupBy', ensureStrings(parsed.groupBy), allowedGB, 'Group by');
      }

      // topBy
      if (Array.isArray(parsed?.topBy)) {
        const metricSet = new Set(ensureStrings(selectedSpec?.metrics));
        const validTop: TopBySpec[] = [];
        const invalidTop: string[] = [];
        for (const t of parsed.topBy) {
          const id = typeof t?.id === 'string' ? t.id : '';
          const dir = t?.direction === 'asc' || t?.direction === 'desc' ? t.direction : undefined;
          if (!id || !metricSet.has(id)) {
            invalidTop.push(id || '(missing)');
            continue;
          }
          if (!dir) {
            invalidTop.push(`${id} (invalid direction)`);
            continue;
          }
          validTop.push({ id, direction: dir });
        }
        if (invalidTop.length) {
          errors.push(`Top by invalid entries: ${invalidTop.join(', ')}`);
        }
        next.topBy = validTop;
      }

      // limit
      if (typeof parsed?.limit === 'number') {
        next.limit = parsed.limit;
      }

      // timeSeries
      if (typeof parsed?.timeSeries === 'boolean') {
        const supportsTS = Array.isArray(selectedSpec?.supportedQueryTypes)
          ? selectedSpec.supportedQueryTypes.includes('time_series')
          : false;
        if (parsed.timeSeries && !supportsTS) {
          errors.push('Time series not supported by selected query type');
        } else {
          next.timeSeries = parsed.timeSeries;
        }
      }

      // comparedTo
      if (typeof parsed?.comparedTo === 'string') {
        const validCT = new Set(['yesterday', 'last_week', '4_weeks_ago']);
        if (validCT.has(parsed.comparedTo)) {
          next.comparedTo = parsed.comparedTo;
        } else {
          errors.push(`Invalid comparedTo: ${parsed.comparedTo}`);
        }
      }

      // Map filters.keys back into filterRows with validation (mode-aware mapping)
      const rowsFromKeysArray = (keysArr: Array<Record<string, any>>): FilterRow[] => {
        const rows: FilterRow[] = [];
        const allowedKeyStrings = new Set(deriveFilterKeyStrings(selectedSpec));
        const hasKeys = queryHasKeysOption(selectedSpec);
        for (const obj of keysArr || []) {
          if (hasKeys) {
            const items: any[] = [];
            for (const [k, v] of Object.entries(obj || {})) {
              if (allowedKeyStrings.has(k)) {
                items.push({ type: 'keys', key: k, value: v as any });
              } else {
                errors.push(`Filter key not allowed for this query type: ${k}`);
              }
            }
            if (items.length) {
              rows.push({ items } as FilterRow);
            }
          } else {
            // nested row object: parse per top-level key
            const parsedItems = parseNestedKeyObject(obj as any, info?.keys);
            const filteredItems = parsedItems.filter((it) => it.key && allowedKeyStrings.has(it.key));
            if (filteredItems.length) {
              rows.push({
                items: filteredItems.map((it) => ({
                  type: 'keys',
                  key: it.key,
                  values: it.values,
                  value: it.value,
                })),
              } as FilterRow);
            }
          }
        }
        return rows;
      };
      const hasKeys = queryHasKeysOption(selectedSpec);
      if (hasKeys) {
        if (Array.isArray(parsed?.filters?.keys)) {
          next.filterRows = rowsFromKeysArray(parsed.filters.keys as Array<Record<string, any>>);
          next.legacyFilters = {};
        }
      } else if (parsed?.filters && !Array.isArray(parsed.filters?.keys)) {
        // Legacy dictionary
        const dict = parsed.filters;
        const legacyOut: any = {};
        if (dict && typeof dict === 'object') {
          for (const typeId of Object.keys(dict)) {
            if (typeId === 'keys') {
              continue;
            }
            const arr = Array.isArray(dict[typeId]) ? dict[typeId] : [];
            const valuesMaps: Array<Record<string, any>> = [];
            for (const obj of arr) {
              if (obj && typeof obj === 'object') {
                const items = parseNestedKeyObject({ [typeId]: obj }, info?.keys);
                // parseNestedKeyObject returns an array of base entries; there should be exactly one for this type
                const entry = items.find((it) => it.key === typeId);
                if (entry?.values) {
                  valuesMaps.push(entry.values);
                } else if (entry?.value !== undefined) {
                  valuesMaps.push({ name: entry.value });
                }
              }
            }
            if (valuesMaps.length) {
              legacyOut[typeId] = valuesMaps;
            }
          }
        }
        next.legacyFilters = legacyOut;
        next.filterRows = [];
      }

      // Surface validation errors
      const errorText = errors.length ? errors.join('; ') : undefined;
      setJsonValidationError(errorText);
      lastValidationErrorsRef.current = errorText;
      // Ensure execution is not blocked when queryType is valid
      if (next.ui?.blockExecutionForUnknownQueryType) {
        next.ui = { ...next.ui, blockExecutionForUnknownQueryType: false };
      }

      return next;
    },
    [query, info, currentQueryType]
  );

  const [jsonError, setJsonError] = useState<string | undefined>(undefined);
  const [jsonHydrationWarning, setJsonHydrationWarning] = useState<{ message: string; paths: string[] } | undefined>(
    undefined
  );
  const [jsonValidationError, setJsonValidationError] = useState<string | undefined>(undefined);
  const [jsonText, setJsonText] = useState<string>('');
  const [unmappedPaths, setUnmappedPaths] = useState<string[]>([]);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const copyTimerRef = useRef<number | undefined>(undefined);
  const [isDraggingSplit, setIsDraggingSplit] = useState<boolean>(false);
  const [isHoverSplit, setIsHoverSplit] = useState<boolean>(false);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  // Partial hydration helpers
  const computeHydrationWarning = useCallback(
    (parsed: any, next: MyQuery): { message: string; paths: string[] } | undefined => {
      const target = normalizeAllowedFields(parsed);
      const body = buildBodyFromForm(next);
      const formNorm = normalizeAllowedFields(body);
      const unmapped = diffUnmappedPaths(parsed, body);
      // Show warning when normalized known fields differ OR when there are unmapped JSON paths
      if (stableStringify(target) !== stableStringify(formNorm) || unmapped.length > 0) {
        return {
          message:
            'Some JSON fields could not be mapped to the form. The JSON is kept; the form reflects only mapped parts.',
          paths: unmapped,
        };
      }
      return undefined;
    },
    [buildBodyFromForm]
  );

  type JsonSource = 'editor' | 'clipboard';
  type ParseErrorLabel = 'generic' | 'clipboard';

  const applyJsonFromText = useCallback(
    (opts: {
      source: JsonSource;
      rawText: string;
      forceShowJson?: boolean;
      prettyPrint?: boolean;
      parseErrorLabel?: ParseErrorLabel;
    }) => {
      const { rawText, forceShowJson, prettyPrint, parseErrorLabel } = opts;
      const trimmed = (rawText ?? '').trim();

      // Empty or whitespace-only input: clear JSON-specific errors/warnings but do
      // not overwrite queryText or force JSON visibility.
      if (!trimmed) {
        setJsonError(undefined);
        setJsonHydrationWarning(undefined);
        setUnmappedPaths([]);
        return;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        // Keep existing JSON and form state; just surface an error.
        if (parseErrorLabel === 'clipboard') {
          setJsonError('Invalid JSON in clipboard');
        } else {
          setJsonError('Invalid JSON');
        }
        return;
      }

      const next = applyFormFromJSON(parsed);
      setJsonError(undefined);

      const hasInvalidQueryTypeError =
        typeof lastValidationErrorsRef.current === 'string' &&
        (lastValidationErrorsRef.current.includes('Unknown queryType:') ||
          lastValidationErrorsRef.current.includes('This query type is not supported for use in Grafana'));

      if (hasInvalidQueryTypeError) {
        // When queryType is invalid or not supported in Grafana, surface only the
        // validation error; skip partial mapping/unmapped warnings.
        setJsonHydrationWarning(undefined);
        setUnmappedPaths([]);
      } else {
        const body = buildBodyFromForm(next);
        const warning = computeHydrationWarning(parsed, next);
        setJsonHydrationWarning(warning);
        setUnmappedPaths(diffUnmappedPaths(parsed, body));
      }

      const textForState = prettyPrint ? JSON.stringify(parsed, null, 2) : rawText;

      setJsonText(textForState);
      setLastEditSource('json');

      let updatedUi = next.ui || {};
      if (forceShowJson) {
        updatedUi = { ...(updatedUi || {}), showJson: true };
      }

      const nextQuery: MyQuery = {
        ...next,
        ...(forceShowJson ? { ui: updatedUi } : { ui: next.ui }),
        queryText: textForState,
      };

      onChange(nextQuery);
    },
    [applyFormFromJSON, buildBodyFromForm, computeHydrationWarning, onChange]
  );

  // Hydrate editor JSON from existing queryText if present, but only after metadata is ready
  useEffect(() => {
    // Do not hydrate until metadata has finished loading and is available.
    if (infoLoading || !info) {
      return;
    }

    // If the editor already has JSON content, don't overwrite it.
    if (jsonText && jsonText.trim() !== '') {
      return;
    }

    const existingText = query.queryText && query.queryText.trim() !== '' ? query.queryText : '';

    if (existingText) {
      const decision = decideHydrationFromSavedQuery({ query, info });
      if (decision.action === 'reset') {
        // Guard against repeated resets if parent props haven't updated yet.
        if (lastResetQueryTextRef.current === existingText) {
          return;
        }
        lastResetQueryTextRef.current = existingText;

        // Clear editor-local JSON state immediately so we don't keep showing stale JSON.
        setJsonText('');
        setUnmappedPaths([]);
        setLastEditSource('form');
        setJsonError(undefined);
        setJsonHydrationWarning(undefined);
        setJsonValidationError(
          decision.reason
            ? `${decision.reason}. Query reset to defaults for this datasource.`
            : 'Query reset to defaults for this datasource.'
        );

        // Preserve UI-only layout preferences even when the query payload resets.
        const next = makeDefaultQuery(query.refId);
        next.ui = { ...(next.ui || {}), showJson: query.ui?.showJson };
        next.editorSplit = query.editorSplit;
        next.jsonEditorHeight = query.jsonEditorHeight ?? next.jsonEditorHeight;

        onChange(next);
        return;
      }

      // Clear any prior reset guard once we successfully proceed with hydration.
      lastResetQueryTextRef.current = undefined;

      // Treat saved JSON the same as if the user had just pasted it:
      // JSON→form mapping, validation, partial-mapping warning, unmapped paths, etc.
      applyJsonFromText({
        source: 'editor',
        rawText: existingText,
        forceShowJson: showJson,
        prettyPrint: true,
        parseErrorLabel: 'generic',
      });
    } else {
      // No saved JSON: synthesize from form, now that metadata is available.
      const body = buildBodyFromForm(query);
      const pretty = JSON.stringify(body, null, 2);
      setJsonText(pretty);
      setLastEditSource('form');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, infoLoading, query.queryText, showJson]);

  // Explicit handler for Query Type change to keep JSON in sync immediately
  const handleQueryTypeChange = useCallback(
    (newTypeId?: string) => {
      // Reset dependent fields
      const cleared: MyQuery = {
        ...query,
        ui: query.ui ? { ...query.ui, blockExecutionForUnknownQueryType: false } : query.ui,
        queryTypeId: newTypeId,
        metrics: [],
        groupBy: [],
        properties: [],
        filterRows: [],
        filters: undefined,
        timeSeries: false,
        topBy: [],
        limit: 10,
        comparedTo: undefined,
      };

      // Build form body from the cleared form for the new type
      const body = buildBodyFromForm(cleared);
      // On type change we DROP unknown/unmapped fields: rebuild JSON from a clean slate
      const merged = body;
      const pretty = JSON.stringify(merged, null, 2);

      // Update JSON and queryText immediately
      setJsonText(pretty);
      setUnmappedPaths(diffUnmappedPaths(merged, body));
      setLastEditSource('form');
      onChange({ ...cleared, queryText: pretty });
    },
    [query, buildBodyFromForm, setJsonText, setUnmappedPaths, onChange]
  );

  // Live JSON updates when form fields change
  useJsonSync({
    query,
    jsonText,
    setJsonText,
    info,
    currentQueryType,
    onChange,
    setJsonError,
    setJsonValidationError,
    setJsonHydrationWarning,
    setUnmappedPaths,
    editSource: lastEditSource,
  } as any);

  // JSON Panel handlers
  const onJsonBlur = (e: any) => {
    // Prefer the editor's latest value from the event; fall back to state
    const latestText: string = e && e.target && typeof e.target.value === 'string' ? e.target.value : jsonText;

    applyJsonFromText({
      source: 'editor',
      rawText: latestText,
      forceShowJson: false,
      prettyPrint: false,
      parseErrorLabel: 'generic',
    });
  };

  const copyJsonToClipboard = async () => {
    try {
      // Prefer current merged JSON (what executes)
      const text =
        query.queryText && query.queryText.trim() !== ''
          ? query.queryText
          : JSON.stringify(buildBodyFromForm(query), null, 2);
      await navigator.clipboard.writeText(text);
      // flash success
      setCopySuccess(true);
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopySuccess(false);
        copyTimerRef.current = undefined;
      }, 1500);
    } catch (err) {
      setJsonError('Failed to copy JSON (clipboard unavailable)');
    }
  };

  const pasteJsonFromClipboard = async () => {
    try {
      // Ensure panel is visible for any paste outcome
      onChange({ ...query, ui: { ...(query.ui || {}), showJson: true } });
      const txt = await navigator.clipboard.readText();
      if (!txt || !txt.trim()) {
        setJsonError('Clipboard is empty');
        return;
      }

      applyJsonFromText({
        source: 'clipboard',
        rawText: txt,
        forceShowJson: true,
        prettyPrint: true,
        parseErrorLabel: 'clipboard',
      });
    } catch {
      setJsonError('Failed to read from clipboard');
    }
  };

  const splitPercentage = (query as any).editorSplit ?? (query as any).togetherSplit ?? 50;

  return (
    <InfoContext.Provider value={{ info }}>
      <Stack direction="column" gap={2}>
        {noticesBySeverity.error.length > 0 && (
          <Alert title="Query errors" severity="error">
            {noticesBySeverity.error.join('\n')}
          </Alert>
        )}
        {noticesBySeverity.warning.length > 0 && (
          <Alert title="Query warnings" severity="warning">
            {noticesBySeverity.warning.join('\n')}
          </Alert>
        )}
        <div
          className="query-editor-row"
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <InlineSwitch
              value={showJson}
              onChange={(e) => onChange({ ...query, ui: { ...(query.ui || {}), showJson: e.currentTarget.checked } })}
              aria-label="toggle-show-json"
            />
            <span style={{ marginRight: 8 }}>Show JSON</span>
            <Button variant="secondary" onClick={copyJsonToClipboard}>
              Copy JSON
            </Button>
            <Button variant="secondary" onClick={pasteJsonFromClipboard}>
              Paste JSON
            </Button>
            {copySuccess && (
              <span
                aria-label="copy-success"
                style={{ marginLeft: 8, fontSize: 12, color: theme.isDark ? '#22c55e' : '#15803d', opacity: 0.9 }}
              >
                JSON copied to clipboard
              </span>
            )}
          </div>
          <div style={{ opacity: 0.7, fontSize: 12 }}>{`Version: ${getPluginVersion()}`}</div>
        </div>

        <div className="query-editor-row" style={{ width: '100%' }}>
          {!showJson ? (
            <QueryForm
              query={query}
              onChange={handleFormChange}
              info={info}
              isLoading={infoLoading}
              currentQueryType={currentQueryType}
              onQueryTypeChange={handleQueryTypeChange}
            />
          ) : (
            <Stack direction="row" gap={2} alignItems="stretch">
              <div
                style={{
                  flexBasis: `${splitPercentage}%`,
                  flexGrow: 0,
                  flexShrink: 0,
                  minWidth: 200,
                }}
              >
                <QueryForm
                  query={query}
                  onChange={handleFormChange}
                  info={info}
                  isLoading={infoLoading}
                  currentQueryType={currentQueryType}
                  onQueryTypeChange={handleQueryTypeChange}
                />
              </div>
              <div
                aria-label="Resize panels"
                role="separator"
                aria-orientation="vertical"
                onMouseEnter={() => setIsHoverSplit(true)}
                onMouseLeave={() => !isDraggingSplit && setIsHoverSplit(false)}
                style={{
                  width: 14,
                  cursor: 'col-resize',
                  alignSelf: 'stretch',
                  borderRadius: 6,
                  border: `1px solid ${isHoverSplit ? 'var(--border-strong)' : 'var(--border-medium)'}`,
                  backgroundImage:
                    'repeating-linear-gradient(0deg, var(--border-strong), var(--border-strong) 6px, transparent 6px, transparent 12px)',
                  backgroundColor: isHoverSplit ? 'var(--background-secondary)' : 'var(--background-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingSplit(true);
                  const startX = e.clientX;
                  const startSplit = splitPercentage;
                  const stackEl = e.currentTarget.parentElement as HTMLElement;
                  const containerWidth = stackEl?.getBoundingClientRect().width || 1;
                  const onMove = (ev: MouseEvent) => {
                    const delta = ev.clientX - startX;
                    const next = Math.max(20, Math.min(80, startSplit + (delta / containerWidth) * 100));
                    onChange(Object.assign({}, query, { editorSplit: next }));
                  };
                  const onUp = () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    setIsDraggingSplit(false);
                  };
                  window.addEventListener('mousemove', onMove);
                  window.addEventListener('mouseup', onUp);
                }}
              >
                <div
                  style={{
                    width: 4,
                    height: 48,
                    borderRadius: 2,
                    opacity: isHoverSplit || isDraggingSplit ? 0.9 : 0.65,
                    background: theme.isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)',
                  }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <QueryJsonPanel
                  jsonText={jsonText}
                  onJsonChange={setJsonText}
                  onJsonBlur={onJsonBlur}
                  initialHeight={query.jsonEditorHeight ?? 220}
                  onHeightChange={(h) => onChange({ ...query, jsonEditorHeight: h })}
                  jsonError={jsonError}
                  jsonValidationError={jsonValidationError}
                  jsonHydrationWarning={jsonHydrationWarning}
                  unmappedPaths={unmappedPaths}
                  info={info}
                  currentQueryType={currentQueryType}
                />
              </div>
            </Stack>
          )}
        </div>

        {infoError && (
          <Alert title="Metadata load failed" severity="warning">
            {infoError}
          </Alert>
        )}
      </Stack>
    </InfoContext.Provider>
  );
}
