import React, {useState, useEffect, useMemo, useRef, useCallback, startTransition} from 'react';
import yaml from 'js-yaml';
import {useSearchParams} from 'react-router-dom';
import styles from './YamlEditor.module.css';
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
import { getIdField } from '../../config/categoryDefinitions';


const YamlEditor = () => {
    const { configManager, config, configText: globalConfigText, schema, setConfig: setGlobalConfig } = useConfigManager();
    const [appSettings, setAppSettings] = useAppSettings();
    const [searchParams] = useSearchParams();

    const [configText, setConfigText] = useState<string>(globalConfigText);
    const [showWhitespace, setShowWhitespace] = useState(true);
    const [logs, setLogs] = useState<ValidationLog[]>([]);
    const [yamlValid, setYamlValid] = useState(true);
    const [fillDefault, setFillDefault] = useState(appSettings.ui.configFillDefault);
    const scrollKeyRef = useRef(0);
    const [scrollToTarget, setScrollToTarget] = useState<{ path: string; key: number } | null>(null);
    const [rightTab, setRightTab] = useState<'validation' | 'references'>('validation');
    const [refLogs, setRefLogs] = useState<ValidationLog[]>([]);
    const [highlightedLog, setHighlightedLog] = useState<ValidationLog | null>(null);

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

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            try {
                const parsed = yaml.load(content) as ApisixConfig;
                setGlobalConfig(parsed, content);
                setConfigText(content);
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
            configManager.setConfig(config);
            configManager.setSchema(schema);
            configManager.setFillInDefaults(fillDefault);

            const validationLogs = configManager.validate();
            startTransition(() => {
                setLogs(prev => {
                    const base = prev.filter(l => l.message.includes('backend') || l.message.includes('Schema'));
                    return Array.isArray(validationLogs) ? [...validationLogs, ...base] : base;
                });
            });
        }
    }, [config, schema, configManager, fillDefault]);

    useEffect(() => {
        const refLogs = config ? checkReferences(config) : [];
        startTransition(() => setRefLogs(refLogs));
    }, [config]);

    useEffect(() => {
        const focusCategory = searchParams.get('focusCategory');
        const focusId = searchParams.get('focusId');
        if (!config || !focusCategory || !focusId) return;

        const key = focusCategory + 's';
        const entries = (config[key as keyof typeof config] as Record<string, unknown>[]) ?? [];
        const idField = getIdField(focusCategory);
        const index = entries.findIndex(e => String(e[idField]) === focusId);
        if (index === -1) return;

        scrollKeyRef.current += 1;
        setScrollToTarget({ path: `/${key}/${index}`, key: scrollKeyRef.current });
    }, [config, searchParams]);

    return (
        <div className="container">
            <div className={`flex justify-between align-center mb-4 pb-3 ${styles.loaderHeader}`}>
                <h2 className="mb-1">YAML Editor</h2>
            </div>

            <FileUpload onFileUpload={handleFileUpload} />

            <div className={`grid grid-2 ${styles.loaderGrid}`}>
                <ConfigEditor
                    configText={configText}
                    showWhitespace={showWhitespace}
                    validConfig={validConfig}
                    yamlValid={yamlValid}
                    fillDefaults={fillDefault}
                    validationLogs={displayLogs}
                    onConfigChange={handleConfigChange}
                    onToggleWhitespace={() => setShowWhitespace(!showWhitespace)}
                    onNewConfig={handleNewConfig}
                    onToggleFillDefaults={toggleFillDefault}
                    onLineClick={(log) => {
                        setHighlightedLog(log);
                        setRightTab('validation');
                    }}
                    scrollToTarget={scrollToTarget}
                />

                {rightTab === 'validation' ? (
                    <ValidationLogs
                        logs={displayLogs}
                        onClear={clearLogs}
                        config={config}
                        headerExtra={tabToggle}
                        highlightedLog={highlightedLog}
                        onLogClick={(log) => {
                            setHighlightedLog(null);
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
export default YamlEditor
