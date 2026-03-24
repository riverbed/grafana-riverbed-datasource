import React, { useRef } from 'react';
import { CodeEditor, Alert, useTheme2 } from '@grafana/ui';
import { useEditorResizer } from '../../hooks/useEditorResizer';
import { useUnmappedDecorations } from '../../hooks/useUnmappedDecorations';
import { setupJsonAutocomplete } from '../../json/jsonAutocomplete';

interface Props {
  jsonText: string;
  onJsonChange: (v: string) => void;
  onJsonBlur: (e: any) => void;
  initialHeight: number;
  onHeightChange: (h: number) => void;
  jsonError?: string;
  jsonValidationError?: string;
  jsonHydrationWarning?: { message: string; paths: string[] };
  unmappedPaths: string[];
  info: any;
  currentQueryType: any;
}

export const QueryJsonPanel: React.FC<Props> = ({
  jsonText,
  onJsonChange,
  onJsonBlur,
  initialHeight,
  onHeightChange,
  jsonError,
  jsonValidationError,
  jsonHydrationWarning,
  unmappedPaths,
  info,
  currentQueryType,
}) => {
  const theme = useTheme2();
  const monacoRef = useRef<any>(null);
  const editorRef = useRef<any>(null);

  const { editorHeight, onMouseDown, isDragging, setIsHover, isHover } = useEditorResizer({
    initialHeight,
    onChange: onHeightChange,
  });

  useUnmappedDecorations({
    editor: editorRef.current,
    monaco: monacoRef.current,
    unmappedPaths,
    jsonText,
  });

  const onEditorDidMount = (editor: any, monaco: any) => {
    monacoRef.current = monaco;
    editorRef.current = editor;
    try {
      setupJsonAutocomplete(editor, monaco, { info, currentQueryType });
    } catch {}

    // Inject style for unmapped highlighting if not present
    const styleId = 'json-unmapped-decoration-style';
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.textContent = `.json-unmapped { text-decoration: wavy underline #d97706; }`;
      document.head.appendChild(styleEl);
    }
  };

  // Re-run autocomplete setup when info/queryType changes
  React.useEffect(() => {
    if (monacoRef.current && editorRef.current) {
      try {
        setupJsonAutocomplete(editorRef.current, monacoRef.current, { info, currentQueryType });
      } catch {}
    }
  }, [info, currentQueryType]);

  return (
    <div style={{ width: '100%' }}>
      <div style={{ height: editorHeight + 40, width: '100%' }}>
        <CodeEditor
          language="json"
          value={jsonText}
          onChange={onJsonChange}
          onBlur={onJsonBlur}
          height={editorHeight}
          showMiniMap={false}
          showLineNumbers={true}
          monacoOptions={{ wordWrap: 'on', scrollBeyondLastLine: false }}
          onEditorDidMount={onEditorDidMount}
        />
        <div
          onMouseDown={onMouseDown}
          onMouseEnter={() => setIsHover(true)}
          onMouseLeave={() => !isDragging && setIsHover(false)}
          style={{
            height: 14,
            cursor: isDragging ? 'grabbing' : 'row-resize',
            marginTop: 12,
            borderRadius: 6,
            border: `1px solid ${isHover ? 'var(--border-strong)' : 'var(--border-medium)'}`,
            backgroundImage:
              'repeating-linear-gradient(90deg, var(--border-strong), var(--border-strong) 6px, transparent 6px, transparent 12px)',
            backgroundColor: isHover ? 'var(--background-secondary)' : 'var(--background-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Resize JSON editor"
          role="separator"
          aria-orientation="horizontal"
        >
          <div
            style={{
              width: 48,
              height: 4,
              borderRadius: 2,
              opacity: isHover || isDragging ? 0.9 : 0.65,
              background: theme.isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)',
            }}
          />
        </div>
      </div>
      {jsonError && (
        <Alert title="JSON error" severity="error" aria-label="alert-json-error">
          {jsonError}
        </Alert>
      )}
      {!jsonError && jsonValidationError && (
        <Alert title="Invalid values in JSON" severity="error" aria-label="alert-json-validation">
          {jsonValidationError}
        </Alert>
      )}
      {!jsonError && jsonHydrationWarning && (
        <Alert title="Partial mapping" severity="warning" aria-label="alert-partial-mapping">
          {jsonHydrationWarning.message}
          {jsonHydrationWarning.paths.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <strong>Unmapped fields:</strong>
              <ul style={{ marginTop: 4, marginBottom: 0, paddingLeft: 20 }}>
                {jsonHydrationWarning.paths.map((p) => (
                  <li key={p}>
                    <code>{p}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Alert>
      )}
    </div>
  );
};

