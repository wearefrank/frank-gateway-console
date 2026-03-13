import React, {useState, useEffect, useCallback, useMemo} from 'react';
import yaml from 'js-yaml';
import './configLoader.css';
import { type ApisixConfig } from '../../actions/SchemaValidation';
import { type ValidationLog, ValidationLogger } from '../../actions/ValidationLogger';
import { ConfigManager } from '../../actions/ConfigManager';
import { LoaderHeader } from './components/LoaderHeader';
import { FileUpload } from './components/FileUpload';
import { ConfigEditor } from './components/ConfigEditor';
import { ValidationLogs } from './components/ValidationLogs';
import { SchemaView } from './components/SchemaView';


export const ApisixConfigLoader = () => {
    const [config, setConfig] = useState<ApisixConfig | null>(() => {
        const saved = localStorage.getItem('apisix-config-text');
        if (saved) {
            try { return yaml.load(saved) as ApisixConfig; } catch { return null; }
        }
        return null;
    });
    const [configText, setConfigText] = useState<string>(() => localStorage.getItem('apisix-config-text') ?? '');
    const [viewMode, setViewMode] = useState<'yaml' | 'json'>(() => (localStorage.getItem('apisix-view-mode') as 'yaml' | 'json') ?? 'yaml');
    const [showWhitespace, setShowWhitespace] = useState(true);
    const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
    const [logs, setLogs] = useState<ValidationLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [validConfig, setValidConfig] = useState(true);
    const [fillDefault, setFillDefault] = useState(() => localStorage.getItem('apisix-fill-default') === 'true');

    // Singleton
    const configManager = useMemo(() => new ConfigManager(), []);
    const logger = useMemo(() => new ValidationLogger(), []);

    const handleConfigChange = (newValue: string) => {
        setConfigText(newValue);
        localStorage.setItem('apisix-config-text', newValue);

        if (!newValue.trim()) {
            setConfig(null);
            configManager.setConfig({} as ApisixConfig); // Clear config
            setValidConfig(true); // Empty input shouldn't show as invalid
            return;
        }

        try {
            const parsed = yaml.load(newValue) as ApisixConfig;
            setConfig(parsed);
            configManager.setConfig(parsed);
            setValidConfig(true);
        } catch {
            setValidConfig(false);
        }
    };

    const toggleFillDefault = () => {
        setFillDefault(prev => {
            localStorage.setItem('apisix-fill-default', String(!prev));
            return !prev;
        });
    }

    const toggleViewMode = (mode: 'yaml' | 'json') => {
        if (mode === viewMode) return;
        setViewMode(mode);
        localStorage.setItem('apisix-view-mode', mode);
        if (config) {
            try {
                const formatted = mode === 'json'
                    ? JSON.stringify(config, null, 2)
                    : yaml.dump(config);
                setConfigText(formatted);
                localStorage.setItem('apisix-config-text', formatted);
            } catch {
                setLogs(prev => [
                    logger.add('error', `Failed to convert to ${mode.toUpperCase()}`),
                    ...prev
                ]);
            }
        }
    };

    const fetchSchema = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("http://localhost:8080/api/schema");
            if (!res.ok) {
                setLogs(prev => [
                    logger.add('error', `Connection failed: Status: ${res.status}`),
                    ...prev
                ]);
                return;
            }
            const data = await res.json();
            setSchema(data);
            configManager.setSchema(data);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setLogs(prev => [
                logger.add('error', `Connection failed: ${msg}`),
                ...prev
            ]);
        } finally {
            setLoading(false);
        }
    }, [configManager, logger]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            try {
                const parsed = yaml.load(content) as ApisixConfig;
                const formatted = viewMode === 'json' ? JSON.stringify(parsed, null, 2) : yaml.dump(parsed);
                setConfig(parsed);
                setConfigText(formatted);
                localStorage.setItem('apisix-config-text', formatted);
                configManager.setConfig(parsed);
                // Clear previous validation logs
                setLogs([]);
                setValidConfig(true);
            } catch {
                setLogs(prev => [
                    logger.add('error', 'Failed to parse file.'),
                    ...prev
                ]);
                setValidConfig(false);
            }
        };
        reader.readAsText(file);
    };

    const clearLogs = () => setLogs([]);

    const handleNewConfig = () => {
        setConfig(null);
        setConfigText('');
        configManager.setConfig({} as ApisixConfig);
        setValidConfig(true);
        localStorage.removeItem('apisix-config-text');
    };

    useEffect(() => {
        if (config && schema) {
            // Clear previous validation results, keep connection logs
            setLogs(prev => prev.filter(l => l.message.includes('backend') || l.message.includes('Schema')));
            
            // Use ConfigManager for validation
            configManager.setConfig(config);
            configManager.setSchema(schema);
            configManager.setFillInDefaults(fillDefault);
            
            const validationLogs = configManager.validate();
            if (Array.isArray(validationLogs)) {
                setLogs(prev => [...validationLogs, ...prev]);
            }
        } else if (!schema) {
            fetchSchema()
        }
    }, [config, schema, fetchSchema, configManager, fillDefault]);

    return (
        <div className="container">
            <LoaderHeader 
                schema={schema} 
                loading={loading} 
                onFetch={fetchSchema} 
            />

            <FileUpload onFileUpload={handleFileUpload} />

            <div className="grid grid-2 loader-grid">
                <ConfigEditor 
                    configText={configText}
                    viewMode={viewMode}
                    showWhitespace={showWhitespace}
                    validConfig={validConfig}
                    fillDefaults={fillDefault}
                    validationLogs={logs}
                    onConfigChange={handleConfigChange}
                    onToggleWhitespace={() => setShowWhitespace(!showWhitespace)}
                    onToggleViewMode={toggleViewMode}
                    onNewConfig={handleNewConfig}
                    onToggleFillDefaults={toggleFillDefault}
                />

                <ValidationLogs 
                    logs={logs} 
                    onClear={clearLogs} 
                    config={config}
                />
            </div>

            <SchemaView schema={schema} />
        </div>
    );
};
