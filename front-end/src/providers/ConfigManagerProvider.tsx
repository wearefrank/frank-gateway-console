import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfigManager } from '../actions/ConfigManager';
import { ConfigManagerContext, type ConfigManagerState } from '../hooks/useConfigManager';

export const ConfigManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const configManager = useMemo(() => new ConfigManager(), []);
    const [version, setVersion] = useState(0);
    const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
    const [schemaLoading, setSchemaLoading] = useState(false);

    const bump = useCallback(() => setVersion(v => v + 1), []);

    const setConfig = useCallback((text: string) => {
        configManager.setRawText(text);
        bump();
    }, [configManager, bump]);

    const fetchSchema = useCallback(async () => {
        setSchemaLoading(true);
        try {
            const res = await fetch("/api/schema");
            if (!res.ok) throw new Error(`Status: ${res.status}`);
            const data = await res.json();
            setSchema(data);
            configManager.setSchema(data);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`Connection failed: ${msg}`);
        } finally {
            setSchemaLoading(false);
        }
    }, [configManager]);

    // Auto-fetch schema on mount
    useEffect(() => {
        fetchSchema().catch(() => {});
    }, [fetchSchema]);

    const value: ConfigManagerState = useMemo(() => ({
        configManager,
        config: configManager.getConfig(),
        configText: configManager.getValidText(),
        configYamlValid: configManager.isYamlValid(),
        schema,
        schemaLoading,
        setConfig,
        fetchSchema,
    }), [configManager, version, schema, schemaLoading, setConfig, fetchSchema]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <ConfigManagerContext.Provider value={value}>
            {children}
        </ConfigManagerContext.Provider>
    );
};
