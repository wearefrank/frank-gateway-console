import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfigManager } from '../actions/ConfigManager';
import yaml from 'js-yaml';
import { type ApisixConfig } from '../actions/SchemaValidation';
import { ConfigManagerContext, type ConfigManagerState } from '../hooks/useConfigManager';

export const ConfigManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const configManager = useMemo(() => new ConfigManager(), []);

    const [config, setConfigState] = useState<ApisixConfig | null>(() => {
        const saved = localStorage.getItem('apisix-config-text');
        if (saved) {
            try { return yaml.load(saved) as ApisixConfig; } catch { return null; }
        }
        return null;
    });
    const [configText, setConfigText] = useState<string>(() => localStorage.getItem('apisix-config-text') ?? '');
    const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
    const [schemaLoading, setSchemaLoading] = useState(false);

    // Sync initial config to configManager
    useEffect(() => {
        if (config) configManager.setConfig(config);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const setConfig = useCallback((newConfig: ApisixConfig | null, text: string) => {
        setConfigState(newConfig);
        setConfigText(text);
        if (text) {
            localStorage.setItem('apisix-config-text', text);
        } else {
            localStorage.removeItem('apisix-config-text');
        }
        if (newConfig) {
            configManager.setConfig(newConfig);
        }
    }, [configManager]);

    const fetchSchema = useCallback(async () => {
        setSchemaLoading(true);
        try {
            const res = await fetch("http://localhost:8080/api/schema");
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
        config,
        configText,
        schema,
        schemaLoading,
        setConfig,
        fetchSchema,
    }), [configManager, config, configText, schema, schemaLoading, setConfig, fetchSchema]);

    return (
        <ConfigManagerContext.Provider value={value}>
            {children}
        </ConfigManagerContext.Provider>
    );
};
