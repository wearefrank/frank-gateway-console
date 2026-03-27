import React, {useState, useEffect, useMemo, useRef} from 'react';
import yaml from 'js-yaml';
import styles from './configLoader.module.css';
import { type ApisixConfig } from '../../actions/SchemaValidation';
import { type ValidationLog, ValidationLogger } from '../../actions/ValidationLogger';
import { FileUpload } from './components/FileUpload';
import { ConfigEditor } from './components/ConfigEditor';
import { ValidationLogs } from './components/ValidationLogs';
import { SchemaView } from './components/SchemaView';
import { useConfigManager } from '../../hooks/useConfigManager';


export const ApisixConfigLoader = () => {
    const { configManager, config, configText: globalConfigText, schema, setConfig: setGlobalConfig } = useConfigManager();

    const [configText, setConfigText] = useState<string>(globalConfigText);
    const [viewMode, setViewMode] = useState<'yaml' | 'json'>(() => (localStorage.getItem('apisix-view-mode') as 'yaml' | 'json') ?? 'yaml');
    const [showWhitespace, setShowWhitespace] = useState(true);
    const [logs, setLogs] = useState<ValidationLog[]>([]);
    const [validConfig, setValidConfig] = useState(true);
    const [fillDefault, setFillDefault] = useState(() => localStorage.getItem('apisix-fill-default') === 'true');
    const scrollKeyRef = useRef(0);
    const [scrollToTarget, setScrollToTarget] = useState<{ path: string; key: number } | null>(null);

    const logger = useMemo(() => new ValidationLogger(), []);

    // Sync global config text when it changes externally
    useEffect(() => {
        setConfigText(globalConfigText);
    }, [globalConfigText]);

    const handleConfigChange = (newValue: string) => {
        setConfigText(newValue);

        if (!newValue.trim()) {
            setGlobalConfig(null, '');
            setValidConfig(true);
            return;
        }

        try {
            const parsed = yaml.load(newValue) as ApisixConfig;
            setGlobalConfig(parsed, newValue);
            setValidConfig(true);
        } catch {
            // Still save the text locally for editing, but don't update global config
            localStorage.setItem('apisix-config-text', newValue);
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

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            try {
                const parsed = yaml.load(content) as ApisixConfig;
                const formatted = viewMode === 'json' ? JSON.stringify(parsed, null, 2) : yaml.dump(parsed);
                setGlobalConfig(parsed, formatted);
                setConfigText(formatted);
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
        setGlobalConfig(null, '');
        setConfigText('');
        setValidConfig(true);
    };

    useEffect(() => {
        if (config && schema) {
            setLogs(prev => prev.filter(l => l.message.includes('backend') || l.message.includes('Schema')));

            configManager.setConfig(config);
            configManager.setSchema(schema);
            configManager.setFillInDefaults(fillDefault);

            const validationLogs = configManager.validate();
            if (Array.isArray(validationLogs)) {
                setLogs(prev => [...validationLogs, ...prev]);
            }
        }
    }, [config, schema, configManager, fillDefault]);

    return (
        <div className="container">
            <div className={`flex justify-between align-center mb-4 pb-3 ${styles.loaderHeader}`}>
                <h2 className="mb-1">APISIX Config Validator</h2>
            </div>

            <FileUpload onFileUpload={handleFileUpload} />

            <div className={`grid grid-2 ${styles.loaderGrid}`}>
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
                    scrollToTarget={scrollToTarget}
                />

                <ValidationLogs
                    logs={logs}
                    onClear={clearLogs}
                    config={config}
                    onLogClick={(log) => {
                        if (log.path) {
                            scrollKeyRef.current += 1;
                            setScrollToTarget({ path: log.path, key: scrollKeyRef.current });
                        }
                    }}
                />
            </div>

            <SchemaView schema={schema} />
        </div>
    );
};
