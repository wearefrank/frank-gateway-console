import React, { useState, useEffect, useCallback, useMemo } from 'react';
import yaml from 'js-yaml';
import { type ApisixConfig, type ValidationLog } from '../../actions/SchemaValidation';
import { ConfigManager } from '../../actions/ConfigManager';


export const ApisixConfigLoader = () => {
    const [config, setConfig] = useState<ApisixConfig | null>(null);
    const [jsonText, setJsonText] = useState<string>('');
    const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
    const [logs, setLogs] = useState<ValidationLog[]>([]);
    const [loading, setLoading] = useState(false);

    // Singleton
    const configManager = useMemo(() => new ConfigManager(), []);

    const addLog = useCallback((type: ValidationLog['type'], message: string) => {
        setLogs(prev => [
            { id: Math.random(), timestamp: new Date().toLocaleTimeString(), type, message },
            ...prev
        ]);
    }, []);

    const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        setJsonText(newValue);
        
        if (!newValue.trim()) {
            setConfig(null);
            configManager.setConfig({} as ApisixConfig); // Clear config
            return;
        }

        try {
            const parsed = JSON.parse(newValue);
            setConfig(parsed);
            configManager.setConfig(parsed);
        } catch (err) {
            // Don't want to spam the console with invalid JSON errors
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
                setJsonText(JSON.stringify(parsed, null, 2));
                configManager.setConfig(parsed);
                // Clear previous validation logs
                setLogs([]);
            } catch {
                addLog('error', 'Failed to parse YAML file.');
            }
        };
        reader.readAsText(file);
    };

    const clearLogs = () => setLogs([])

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
            <div className="flex justify-between align-center mb-4 pb-3" style={{ borderBottom: '1px solid var(--border-dim)' }}>
                <div>
                    <h2 className="mb-1">APISIX Config Validator</h2>
                </div>
                <div className="flex align-center gap-md">
                    <div className={schema ? "text-success text-small" : "text-muted text-small"} style={{ fontWeight: 600 }}>
                        {schema ? 'Schema Active' : 'Schema Missing'}
                    </div>
                    <button
                        onClick={fetchSchema}
                        disabled={loading}
                        className={loading ? "" : "btn-primary"}
                    >
                        {loading ? 'Fetching...' : 'Fetch Schema'}
                    </button>
                </div>
            </div>

            {/* File Upload */}
            <div className="mb-4">
                <label className="form-label">Configuration File</label>
                <input
                    type="file"
                    accept=".yaml,.yml"
                    onChange={handleFileUpload}
                />
            </div>

            {/* Main View */}
            <div className="grid grid-2" style={{ height: '600px' }}>

                {/* Left */}
                <div className="card flex flex-column" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
                    <div className="card-header flex justify-between align-center">
                        Parsed Configuration
                        <button 
                            className="text-small" 
                            style={{ padding: '2px 8px' }} 
                            onClick={() => { setConfig(null); setJsonText(''); configManager.setConfig({} as ApisixConfig); }}
                        >
                            New
                        </button>
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden', padding: '16px', fontFamily: 'monospace', fontSize: '12px', position: 'relative' }}>
                        <textarea
                            value={jsonText}
                            onChange={handleJsonChange}
                            spellCheck={false}
                            placeholder='{"routes": []}'
                            style={{
                                width: '100%',
                                height: '100%',
                                border: 'none',
                                outline: 'none',
                                resize: 'none',
                                backgroundColor: 'transparent',
                                color: 'inherit',
                                fontFamily: 'inherit',
                                fontSize: 'inherit',
                                padding: '0',
                                lineHeight: '1.4',
                                position: 'relative',
                                zIndex: 2,
                                overflow: 'auto'
                            }}
                        />
                        {!jsonText && (
                            <div className="flex align-center justify-center text-muted text-small" 
                                 style={{ 
                                     position: 'absolute', 
                                     top: 0, left: 0, right: 0, bottom: 0, 
                                     pointerEvents: 'none', 
                                     fontStyle: 'italic',
                                     padding: '16px',
                                     textAlign: 'center'
                                 }}>
                                No file uploaded yet.<br/>Type or paste JSON here...
                            </div>
                        )}
                    </div>
                </div>

                {/* Right */}
                <div className="card flex flex-column" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="flex justify-between align-center card-header">
                        Validation Results
                        <button className="text-small" style={{ padding: '4px 8px' }} onClick={clearLogs}>Clear</button>
                    </div>
                    <div className="flex flex-column gap-sm scroll-y" style={{ flex: 1, padding: '16px' }}>

                        {logs.map(log => (
                            <div key={log.id} style={{
                                padding: '12px',
                                borderRadius: '6px',
                                fontSize: '13px',
                                backgroundColor: getLogColor(log.type),
                                borderLeft: `4px solid ${getLogBorder(log.type)}`
                            }}>
                                <div className="flex justify-between mb-1 text-small" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    <strong style={{textTransform: 'uppercase'}}>{log.type}</strong>
                                    <span>{log.timestamp}</span>
                                </div>
                                <div style={{ wordBreak: 'break-word' }}>{log.message}</div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
            <div className="card mt-4" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', backgroundColor: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-dim)', fontWeight: 600, fontSize: '14px' }}>
                    Reference Schema
                </div>
                <div className="scroll-y" style={{ maxHeight: '400px', padding: '16px' }}>
                    {schema ? <pre style={{ margin: 0, fontSize: '12px' }}>{JSON.stringify(schema, null, 2)}</pre> : <div className="text-muted text-small italic">Fetch schema...</div>}
                </div>
            </div>
        </div>
    );
};

// --- Styles (Refactored to use Global Styles) ---

const getLogColor = (type: string) => {
    switch (type) {
        case 'error': return 'rgba(255, 107, 107, 0.1)';
        case 'success': return 'rgba(99, 230, 190, 0.1)';
        case 'warning': return 'rgba(253, 195, 0, 0.1)';
        default: return 'var(--bg-tertiary)';
    }
};

const getLogBorder = (type: string) => {
    switch (type) {
        case 'error': return 'var(--error-color)';
        case 'success': return 'var(--success-color)';
        case 'warning': return 'var(--accent-color)';
        default: return 'var(--text-secondary)';
    }
};
