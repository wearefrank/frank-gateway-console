import React, {useState, useEffect, useCallback, useMemo} from 'react';
import yaml from 'js-yaml';
import './configLoader.css';
import { type ApisixConfig, type ValidationLog } from '../../actions/SchemaValidation';
import { ConfigManager } from '../../actions/ConfigManager';
import { LoaderHeader } from './components/LoaderHeader';
import { FileUpload } from './components/FileUpload';
import { ConfigEditor } from './components/ConfigEditor';
import { ValidationLogs } from './components/ValidationLogs';
import { SchemaView } from './components/SchemaView';


export const ApisixConfigLoader = () => {
    const [config, setConfig] = useState<ApisixConfig | null>(null);
    const [configText, setConfigText] = useState<string>('');
    const [viewMode, setViewMode] = useState<'yaml' | 'json'>('yaml');
    const [showWhitespace, setShowWhitespace] = useState(false);
    const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
    const [logs, setLogs] = useState<ValidationLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [validConfig, setValidConfig] = useState(true);

    // Singleton
    const configManager = useMemo(() => new ConfigManager(), []);

    const addLog = useCallback((type: ValidationLog['type'], message: string) => {
        setLogs(prev => [
            { id: Math.random(), timestamp: new Date().toLocaleTimeString(), type, message },
            ...prev
        ]);
    }, []);

    const handleConfigChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        setConfigText(newValue);
        
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
        } catch (err) {
            setValidConfig(false);
        }
    };

    const toggleViewMode = (mode: 'yaml' | 'json') => {
        if (mode === viewMode) return;
        setViewMode(mode);
        if (config) {
            try {
                const formatted = mode === 'json' 
                    ? JSON.stringify(config, null, 2) 
                    : yaml.dump(config);
                setConfigText(formatted);
            } catch (err) {
                addLog('error', `Failed to convert to ${mode.toUpperCase()}`);
            }
        }
    };

    const fetchSchema = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("http://localhost:8080/api/schema");
            if (!res.ok) {
                addLog('error', `Connection failed: Status: ${res.status}`);
                return;
            }
            const data = await res.json();
            setSchema(data);
            configManager.setSchema(data);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            addLog('error', `Connection failed: ${msg}`);
        } finally {
            setLoading(false);
        }
    }, [addLog, configManager]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            try {
                const parsed = yaml.load(content) as ApisixConfig;
                setConfig(parsed);
                setConfigText(viewMode === 'json' ? JSON.stringify(parsed, null, 2) : yaml.dump(parsed));
                configManager.setConfig(parsed);
                // Clear previous validation logs
                setLogs([]);
                setValidConfig(true);
            } catch {
                addLog('error', 'Failed to parse file.');
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
    };

    useEffect(() => {
        if (config && schema) {
            // Clear previous validation results, keep connection logs
            setLogs(prev => prev.filter(l => l.message.includes('backend') || l.message.includes('Schema')));
            
            // Use ConfigManager for validation
            configManager.setConfig(config);
            configManager.setSchema(schema);
            configManager.validate(addLog);
        } else if (!schema) {
            fetchSchema()
        }
    }, [config, schema, addLog, fetchSchema, configManager]);

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
                    onConfigChange={handleConfigChange}
                    onToggleWhitespace={() => setShowWhitespace(!showWhitespace)}
                    onToggleViewMode={toggleViewMode}
                    onNewConfig={handleNewConfig}
                />

                <ValidationLogs 
                    logs={logs} 
                    onClear={clearLogs} 
                />
            </div>

            <SchemaView schema={schema} />
        </div>
    );
};
