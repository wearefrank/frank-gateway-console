import React, {useState, useEffect, useMemo, useRef, useCallback} from 'react';
import yaml from 'js-yaml';
import styles from './configLoader.module.css';
import { type ApisixConfig } from '../../actions/SchemaValidation';
import { type ValidationLog, ValidationLogger } from '../../actions/ValidationLogger';
import { FileUpload } from './components/FileUpload';
import { ConfigEditor } from './components/ConfigEditor';
import { ValidationLogs } from './components/ValidationLogs';
import { ReferencesPanel } from './components/ReferencesPanel';
import { SchemaView } from './components/SchemaView';
import { useConfigManager } from '../../hooks/useConfigManager';
import { useAppSettings } from '../../hooks/useAppSettings';
import { checkReferences } from './actions/checkReferences';


const ApisixConfigLoader = () => {
    const { configManager, config, configText: globalConfigText, schema, setConfig: setGlobalConfig } = useConfigManager();
    const [appSettings, setAppSettings] = useAppSettings();

    const [configText, setConfigText] = useState<string>(globalConfigText);
    const [viewMode, setViewMode] = useState<'yaml' | 'json'>(appSettings.ui.configViewMode);
    const [showWhitespace, setShowWhitespace] = useState(true);
    const [logs, setLogs] = useState<ValidationLog[]>([]);
    const [yamlValid, setYamlValid] = useState(true);
    const [fillDefault, setFillDefault] = useState(appSettings.ui.configFillDefault);
    const scrollKeyRef = useRef(0);
    const [scrollToTarget, setScrollToTarget] = useState<{ path: string; key: number } | null>(null);
    const [rightTab, setRightTab] = useState<'validation' | 'references'>('validation');
    const [refLogs, setRefLogs] = useState<ValidationLog[]>([]);

    const logger = useMemo(() => new ValidationLogger(), []);

    const localErrors = useMemo<ValidationLog[]>(() => {
        if (!configText.trim() || configText.trimEnd().endsWith('#END')) return [];
        return [logger.add('error', 'Config is missing the #END marker at the end')];
    }, [configText, logger]);

    const validConfig = useMemo(
        () => yamlValid && !logs.some(l => l.type === 'error') && localErrors.length === 0,
        [yamlValid, logs, localErrors]
    );

    const displayLogs = [
        ...localErrors,
        ...(localErrors.length > 0 ? logs.filter(l => l.type !== 'success') : logs),
        ...refLogs,
    ];

    const tabToggle = (
        <div className={styles.toggleGroup}>
            <button
                className={rightTab === 'validation' ? styles.toggleBtnActive : styles.toggleBtn}
                onClick={() => setRightTab('validation')}
            >
                Logs
            </button>
            <button
                className={rightTab === 'references' ? styles.toggleBtnActive : styles.toggleBtn}
                onClick={() => setRightTab('references')}
            >
                References
            </button>
        </div>
    );

    const handleConfigChange = (newValue: string) => {
        setConfigText(newValue);

        if (!newValue.trim()) {
            setGlobalConfig(null, '');
            setYamlValid(true);
            return;
        }

        try {
            const parsed = yaml.load(newValue) as ApisixConfig;
            setGlobalConfig(parsed, newValue);
            setYamlValid(true);
        } catch {
            // Still save the text locally for editing, but don't update global config
            localStorage.setItem('apisix-config-text', newValue);
            setYamlValid(false);
        }
    };

    const toggleFillDefault = useCallback(() => {
        setFillDefault(prev => {
            const next = !prev;
            setAppSettings({ ...appSettings, ui: { ...appSettings.ui, configFillDefault: next } });
            return next;
        });
    }, [appSettings, setAppSettings]);

    const toggleViewMode = (mode: 'yaml' | 'json') => {
        if (mode === viewMode) return;
        setViewMode(mode);
        setAppSettings({ ...appSettings, ui: { ...appSettings.ui, configViewMode: mode } });
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
                setYamlValid(true);
            } catch {
                setLogs(prev => [
                    logger.add('error', 'Failed to parse file.'),
                    ...prev
                ]);
                setYamlValid(false);
            }
        };
        reader.readAsText(file);
    };

    const clearLogs = () => setLogs([]);

    const handleNewConfig = () => {
        setGlobalConfig(null, '');
        setConfigText('');
        setYamlValid(true);
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

    useEffect(() => {
        setRefLogs(config ? checkReferences(config) : []);
    }, [config]);

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
                    validationLogs={displayLogs}
                    onConfigChange={handleConfigChange}
                    onToggleWhitespace={() => setShowWhitespace(!showWhitespace)}
                    onToggleViewMode={toggleViewMode}
                    onNewConfig={handleNewConfig}
                    onToggleFillDefaults={toggleFillDefault}
                    scrollToTarget={scrollToTarget}
                />

                {rightTab === 'validation' ? (
                    <ValidationLogs
                        logs={displayLogs}
                        onClear={clearLogs}
                        config={config}
                        headerExtra={tabToggle}
                        onLogClick={(log) => {
                            if (log.path) {
                                scrollKeyRef.current += 1;
                                setScrollToTarget({ path: log.path, key: scrollKeyRef.current });
                            }
                        }}
                    />
                ) : (
                    <ReferencesPanel headerExtra={tabToggle} />
                )}
            </div>

            <SchemaView schema={schema} />
        </div>
    );
};
export default ApisixConfigLoader
