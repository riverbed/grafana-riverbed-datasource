import { useEffect } from 'react';
import { MyQuery } from '../types';
import { mergeFormIntoJson } from '../json/merge';
import { diffUnmappedPaths } from '../json/diff';
import { isLegacyQueryType } from '../utils/filters';
import { buildBodyFromForm } from '../utils/queryMapping';
import { doesQueryTypeSupportTime } from '../utils/supportTime';

type Params = {
  query: MyQuery;
  jsonText: string;
  setJsonText: (v: string) => void;
  info: any;
  currentQueryType: any;
  onChange: (q: MyQuery) => void;
  setJsonError: (v: string | undefined) => void;
  setJsonValidationError: (v: string | undefined) => void;
  setJsonHydrationWarning: (v: { message: string; paths: string[] } | undefined) => void;
  setUnmappedPaths: (p: string[]) => void;
  editSource: 'form' | 'json';
};

export function useJsonSync({
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
  editSource,
}: Params) {
  useEffect(() => {
    // When the last edits came from JSON, do not rewrite JSON or queryText.
    if (editSource === 'json') {
      return;
    }

    // Do not attempt form→JSON merge until metadata (info) is available.
    if (!info) {
      return;
    }

    // Clear transient notices prior to recomputing JSON for a new edit/run
    setJsonError(undefined);
    setJsonValidationError(undefined);
    // Parse current JSON (if any), then merge in known fields from form
    let parsed: any = {};
    try {
      if (jsonText && jsonText.trim() !== '') {
        parsed = JSON.parse(jsonText);
      } else if (query.queryText && query.queryText.trim() !== '') {
        parsed = JSON.parse(query.queryText);
      } else {
        parsed = {};
      }
    } catch {
      parsed = {};
    }
    const body = buildBodyFromForm(info, query, currentQueryType);
    const resolvedSupportTime = query.queryTypeId ? doesQueryTypeSupportTime(currentQueryType) : undefined;
    const legacyTypes: string[] | undefined = isLegacyQueryType(currentQueryType)
      ? (Array.isArray(currentQueryType?.filters)
          ? (currentQueryType!.filters as any[]).filter((f: any) => typeof f === 'string' && f.toLowerCase() !== 'keys')
          : undefined)
      : undefined;
    const merged = mergeFormIntoJson(parsed, body, { legacyTypes });
    const pretty = JSON.stringify(merged, null, 2);
    if (jsonText !== pretty) {
      // Always reflect the computed JSON in the editor state
      setJsonText(pretty);
      // Update unmapped paths for user visibility
      setUnmappedPaths(diffUnmappedPaths(merged, body));
      // Prevent the very first automatic run when entering the editor with no type and no JSON.
      // Only skip emitting onChange when ALL of these are true:
      //  - no query type selected
      //  - no saved JSON on the query
      //  - the editor did not already have JSON content
      const noTypeSelected = !query.queryTypeId;
      const hasSavedJson = !!(query.queryText && query.queryText.trim());
      const hasEditorJson = !!(jsonText && jsonText.trim());
      if (noTypeSelected && !hasSavedJson && !hasEditorJson) {
        return;
      }
      // In all other cases, propagate the merged JSON to the query (normal behavior)
      const nextQuery: MyQuery = {
        ...query,
        supportTime: resolvedSupportTime,
        ui: {
          ...(query.ui || {}),
          // Any form-driven merge should clear the unknown-queryType execution block.
          blockExecutionForUnknownQueryType: false,
        },
        queryText: pretty,
      };
      onChange(nextQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    query.queryTypeId,
    query.metrics,
    query.properties,
    query.groupBy,
    query.filterRows,
    query.legacyFilters,
    query.topBy,
    query.limit,
    query.timeSeries,
    query.comparedTo,
    editSource,
  ]);
}

