import React, { PropsWithChildren } from 'react';
import { Select, MultiSelect, InlineSwitch, Input } from '@grafana/ui';

export const FormRow: React.FC<PropsWithChildren<{ label: string }>> = ({ label, children }) => {
  return (
    <div>
      <div style={{ marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
};

export const LabeledSelect: React.FC<{
  label: string;
  value: any;
  options: Array<{ label: string; value: string }>;
  onChange: (v: any) => void;
  disabled?: boolean;
}> = ({ label, value, options, onChange, disabled }) => (
  <FormRow label={label}>
    <div style={{ width: '100%' }}>
      <Select value={value} options={options} onChange={onChange} disabled={disabled} />
    </div>
  </FormRow>
);

export const LabeledMultiSelect: React.FC<{
  label: string;
  values: Array<{ label: string; value: string }>;
  options: Array<{ label: string; value: string }>;
  onChange: (vals: any) => void;
  disabled?: boolean;
}> = ({ label, values, options, onChange, disabled }) => (
  <FormRow label={label}>
    <div style={{ width: '100%' }}>
      <MultiSelect value={values} options={options} onChange={onChange} disabled={disabled} />
    </div>
  </FormRow>
);

export const LabeledSwitch: React.FC<{
  label: string;
  value: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  description?: string;
}> = ({ label, value, onChange, disabled }) => (
  <FormRow label={label}>
    <InlineSwitch value={value} onChange={onChange} disabled={disabled} />
  </FormRow>
);

export const LabeledNumber: React.FC<{
  label: string;
  value?: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}> = ({ label, value, onChange }) => (
  <FormRow label={label}>
    <div style={{ width: '100%' }}>
      <Input
        type="number"
        inputMode="numeric"
        pattern="[0-9]*"
        step={1}
        value={value ?? ''}
        onChange={onChange}
      />
    </div>
  </FormRow>
);


