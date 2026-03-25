import React from 'react';
import { CodeEditor } from '@grafana/ui';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onValidate: (ok: boolean) => void;
  height: number;
}

export const CompactJsonPreview: React.FC<Props> = ({ value, onChange, onValidate, height }) => {
  return (
    <div style={{ width: '100%' }}>
      <CodeEditor
        language="json"
        value={value}
        onChange={(v) => onChange(v)}
        onBlur={() => {
          try { if (value && value.trim() !== '') { JSON.parse(value); } onValidate(true); } catch { onValidate(false); }
        }}
        height={height}
        showMiniMap={false}
        showLineNumbers={true}
        monacoOptions={{ wordWrap: 'on', scrollBeyondLastLine: false }}
      />
    </div>
  );
};


