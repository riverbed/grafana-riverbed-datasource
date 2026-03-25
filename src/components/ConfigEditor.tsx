import React, { ChangeEvent, useState } from 'react';
import { InlineField, Input, SecretInput, Alert, Collapse } from '@grafana/ui';
import { getPluginVersion } from '../utils/version';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { MyDataSourceOptions, MySecureJsonData } from '../types';

interface Props extends DataSourcePluginOptionsEditorProps<MyDataSourceOptions, MySecureJsonData> {}

export function ConfigEditor(props: Props) {
  const { onOptionsChange, options } = props;
  const { jsonData, secureJsonFields, secureJsonData } = options;

  const [showAdvanced, setShowAdvanced] = useState(false);

  const onTokenUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        tokenUrl: event.target.value,
      },
    });
  };

  const onScopeChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        scope: event.target.value,
      },
    });
  };

  const onApiBaseUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        apiBaseUrl: event.target.value,
      },
    });
  };

  const onTenantIdChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        tenantId: event.target.value,
      },
    });
  };

  const onClientIdChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        clientId: event.target.value,
      },
    });
  };

  // Secure field (only sent to the backend)
  const onClientSecretChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        clientSecret: event.target.value,
      },
    });
  };

  const onResetClientSecret = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: {
        ...options.secureJsonFields,
        clientSecret: false,
      },
      secureJsonData: {
        ...options.secureJsonData,
        clientSecret: '',
      },
    });
  };

  return (
    <>
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <div style={{ opacity: 0.7, fontSize: 12 }} aria-label="plugin-version">{`Version: ${getPluginVersion()}`}</div>
      </div>
      <InlineField label="Access Token URI" labelWidth={18} interactive>
        <Input
          id="config-editor-token-url"
          onChange={onTokenUrlChange}
          value={jsonData.tokenUrl || ''}
          placeholder="https://login.example.com/oauth2/v2.0/token"
          width={50}
        />
      </InlineField>
      <InlineField label="API Scope" labelWidth={18} interactive>
        <Input
          id="config-editor-scope"
          onChange={onScopeChange}
          value={jsonData.scope || ''}
          placeholder="api://app-id/.default"
          width={50}
        />
      </InlineField>
      <InlineField label="Base URI" labelWidth={18} interactive>
        <Input
          id="config-editor-api-base-url"
          onChange={onApiBaseUrlChange}
          value={jsonData.apiBaseUrl || ''}
          placeholder="https://example.company.com"
          width={50}
        />
      </InlineField>
      <InlineField label="Tenant Id" labelWidth={18} interactive>
        <Input
          id="config-editor-tenant-id"
          onChange={onTenantIdChange}
          value={jsonData.tenantId || ''}
          placeholder="00000000-0000-0000-0000-000000000000"
          width={50}
        />
      </InlineField>
      <InlineField label="Client ID" labelWidth={18} interactive>
        <Input
          id="config-editor-client-id"
          onChange={onClientIdChange}
          value={jsonData.clientId || ''}
          placeholder="00000000-0000-0000-0000-000000000000"
          width={50}
        />
      </InlineField>
      <InlineField label="Client Secret" labelWidth={18} interactive>
        <SecretInput
          required
          id="config-editor-client-secret"
            isConfigured={!!secureJsonFields?.clientSecret}
          value={secureJsonData?.clientSecret}
          placeholder="Enter your client secret"
          width={50}
          onReset={onResetClientSecret}
          onChange={onClientSecretChange}
        />
      </InlineField>
      <Collapse
        label={
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span aria-hidden="true" style={{ marginRight: 4 }}>
              {showAdvanced ? '▼' : '▶'}
            </span>
            <span>Advanced</span>
          </div>
        }
        isOpen={showAdvanced}
        onToggle={() => setShowAdvanced((open) => !open)}
      >
        <InlineField label="Info API version" labelWidth={18} interactive>
          <Input
            id="config-editor-info-api-version"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const val = (e.currentTarget.value || '').trim();
              const v = val === '' ? '1.0' : val;
              const isValid = /^1(\.\d+)?$/.test(v);
              onOptionsChange({
                ...options,
                jsonData: {
                  ...jsonData,
                  infoApiVersion: v,
                },
              });
              (options as any).__infoApiVersionError = isValid
                ? undefined
                : 'This version of the plugin only support APIs of version 1.x';
            }}
            value={jsonData.infoApiVersion && jsonData.infoApiVersion.trim() !== '' ? jsonData.infoApiVersion : '1.0'}
            placeholder="1.0"
            width={20}
          />
        </InlineField>
        <InlineField label="Queries API version" labelWidth={18} interactive>
          <Input
            id="config-editor-queries-api-version"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const val = (e.currentTarget.value || '').trim();
              const v = val === '' ? '1.0' : val;
              const isValid = /^1(\.\d+)?$/.test(v);
              onOptionsChange({
                ...options,
                jsonData: {
                  ...jsonData,
                  queriesApiVersion: v,
                },
              });
              (options as any).__queriesApiVersionError = isValid
                ? undefined
                : 'This version of the plugin only support APIs of version 1.x';
            }}
            value={
              jsonData.queriesApiVersion && jsonData.queriesApiVersion.trim() !== ''
                ? jsonData.queriesApiVersion
                : '1.0'
            }
            placeholder="1.0"
            width={20}
          />
        </InlineField>
        {((options as any).__infoApiVersionError) && (
          <Alert title={(options as any).__infoApiVersionError as string} severity="error" />
        )}
        {((options as any).__queriesApiVersionError) && (
          <Alert title={(options as any).__queriesApiVersionError as string} severity="error" />
        )}
      </Collapse>
    </>
  );
}
