import React from 'react';
import { Stack, CodeEditor, Button, Alert } from '@grafana/ui';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  editorHeight: number;
  onResizerMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  jsonError?: string;
  onFormat: () => void;
  onReset: () => void;
  onMonacoMount?: (editor: any, monaco: any) => void;
}

export const AdvancedJsonEditor: React.FC<Props> = ({ value, onChange, onBlur, editorHeight, onResizerMouseDown, jsonError, onFormat, onReset, onMonacoMount }) => {
  return (
    <div>
      <Stack gap={1}>
        <Stack direction="row" gap={1}>
          <Button variant="secondary" onClick={onFormat}>Format JSON</Button>
          <Button variant="secondary" onClick={onReset}>Reset</Button>
        </Stack>
        <div style={{ height: editorHeight + 40, width: '100%' }}>
          <CodeEditor
            language="json"
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            height={editorHeight}
            showMiniMap={false}
            showLineNumbers={true}
            monacoOptions={{ wordWrap: 'on', scrollBeyondLastLine: false }}
            onEditorDidMount={onMonacoMount as any}
          />
          <div
            onMouseDown={onResizerMouseDown}
            style={{ height: 12, cursor: 'row-resize', marginTop: 10 }}
            aria-label="Resize JSON editor"
            role="separator"
            aria-orientation="horizontal"
          />
        </div>
        {jsonError && (
          <Alert title="JSON error" severity="error">{jsonError}</Alert>
        )}
      </Stack>
    </div>
  );
};


