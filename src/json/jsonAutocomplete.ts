import { buildSchema } from './jsonSchema';

type Monaco = typeof import('monaco-editor');

export function setupJsonAutocomplete(
  editor: any,
  monaco: Monaco,
  opts: { info: any; currentQueryType: any | null }
) {
  const schema = buildSchema(opts.info, opts.currentQueryType);
  const modelUri = editor?.getModel?.()?.uri?.toString?.();
  const prev = (monaco.languages.json.jsonDefaults as any)._diagnosticsOptions;
  const nextSchemas = [
    {
      uri: 'inmemory://riverbed/query.schema.json',
      fileMatch: modelUri ? [modelUri] : ['*'],
      schema,
    },
  ];
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    enableSchemaRequest: false,
    allowComments: true,
    schemas: nextSchemas,
  });

  // Light UX enhancement: when user types a comma, trigger suggestions (useful for adding another object in arrays)
  let disposeChange: any = null;
  try {
    if (editor && typeof editor.onDidChangeModelContent === 'function') {
      disposeChange = editor.onDidChangeModelContent((e: any) => {
        try {
          const changes: any[] = Array.isArray(e?.changes) ? e.changes : [];
          for (const ch of changes) {
            if (ch?.text === ',' && ch?.rangeLength === 0) {
              // Trigger suggest to surface defaultSnippets (e.g., add another legacy object)
              if (typeof editor.trigger === 'function') {
                editor.trigger('keyboard', 'editor.action.triggerSuggest', {});
              }
              break;
            }
          }
        } catch {
          // ignore
        }
      });
    }
  } catch {
    // ignore
  }

  return () => {
    try {
      if (prev) {
        monaco.languages.json.jsonDefaults.setDiagnosticsOptions(prev);
      }
    } catch {}
    if (disposeChange && typeof disposeChange.dispose === 'function') {
      try { disposeChange.dispose(); } catch {}
    }
  };
}


