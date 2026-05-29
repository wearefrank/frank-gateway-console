import React, {useState, useEffect, useMemo, useRef, useCallback, startTransition} from 'react';
import {useSearchParams} from 'react-router-dom';
import styles from './YamlEditor.module.css';
import { type ValidationLog, ValidationLogger } from '../../actions/ValidationLogger';
import { FileUpload } from './components/FileUpload';
import { ConfigEditor } from './components/ConfigEditor';
import { ValidationLogs } from './components/ValidationLogs';
import { ReferencesPanel } from './components/ReferencesPanel';
import { useConfigManager } from '../../hooks/useConfigManager';
import { useAppSettings } from '../../hooks/useAppSettings';
import { useVersionHistory } from '../../hooks/useVersionHistory';
import { checkReferences } from './actions/checkReferences';
import { getDisplayId } from '../../config/categoryDefinitions';


const YamlEditor = () => {
    const { configManager, config, configYamlValid, schema, setConfig: setGlobalConfig } = useConfigManager();
    const [appSettings, setAppSettings] = useAppSettings();
    const { saveVersion } = useVersionHistory();
    const [saveVersionOpen, setSaveVersionOpen] = useState(false);
    const [saveVersionMessage, setSaveVersionMessage] = useState('');
    const [savingVersion, setSavingVersion] = useState(false);
    const [searchParams] = useSearchParams();

    const [configText, setConfigText] = useState<string>(configManager.getRawText());
    const [showWhitespace, setShowWhitespace] = useState(true);
    const [logs, setLogs] = useState<ValidationLog[]>([]);
    const [fillDefault, setFillDefault] = useState(appSettings.ui.configFillDefault);
    const scrollKeyRef = useRef(0);
    const scrolledFocusRef = useRef<string | null>(null);
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
        () => configYamlValid && !logs.some(l => l.type === 'error') && localErrors.length === 0,
        [configYamlValid, logs, localErrors]
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
        setGlobalConfig(newValue);
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
            setGlobalConfig(content);
            setConfigText(content);
            if (configManager.isYamlValid()) {
                setLogs([]);
            } else {
                setLogs(prev => [logger.add('error', 'Failed to parse file.'), ...prev]);
            }
        };
        reader.readAsText(file);
    };

    const clearLogs = () => setLogs([]);

    const handleNewConfig = () => {
        setGlobalConfig('');
        setConfigText('');
    };

    const handleSaveVersionClick = () => {
        setSaveVersionOpen(open => !open);
    };

    const handleSaveVersionSubmit = async () => {
        setSavingVersion(true);
        try {
            await saveVersion(saveVersionMessage, configManager.getRawText());
            setSaveVersionOpen(false);
            setSaveVersionMessage('');
        } finally {
            setSavingVersion(false);
        }
    };

    useEffect(() => {
        if (config && schema) {
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
        const focusNonce = searchParams.get('_n');
        if (!config || !focusCategory || !focusId) return;

        // Only scroll once per unique focus target. Without this guard, any
        // config change (e.g. a keystroke) would re-trigger the scroll because
        // `config` is a dependency needed to resolve the array index.
        // The nonce (_n) increments on each click so repeated clicks on the
        // same entry always produce a new key and trigger a fresh scroll.
        const focusKey = `${focusCategory}:${focusId}:${focusNonce}`;
        if (scrolledFocusRef.current === focusKey) return;

        const key = focusCategory + 's';
        const entries = (config[key as keyof typeof config] as Record<string, unknown>[]) ?? [];
        const index = entries.findIndex((e, i) => getDisplayId(focusCategory, e, i) === focusId);
        if (index === -1) return;

        scrolledFocusRef.current = focusKey;
        scrollKeyRef.current += 1;
        setScrollToTarget({ path: `/${key}/${index}`, key: scrollKeyRef.current });
    }, [config, searchParams]);

    return (
        <div className="container">
            <div className={`flex justify-between align-center mb-4 pb-3 ${styles.loaderHeader}`}>
                <h2 className="mb-1">YAML Editor</h2>
            </div>

            <FileUpload onFileUpload={handleFileUpload} />

            {saveVersionOpen && (
                <div className={`flex flex-column gap-sm mb-4 ${styles.saveVersionForm}`}>
                    <span className="text-muted text-small">This will create a git commit in the configured repository.</span>
                    <div className="flex align-center gap-sm flex-wrap">
                        <input
                            type="text"
                            placeholder="Commit message..."
                            value={saveVersionMessage}
                            onChange={e => setSaveVersionMessage(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveVersionSubmit(); }}
                            className={styles.saveVersionInput}
                            autoFocus
                        />
                        <button
                            className="btn-primary text-small"
                            onClick={handleSaveVersionSubmit}
                            disabled={savingVersion}
                        >
                            {savingVersion ? 'Committing...' : 'Commit'}
                        </button>
                        <button
                            className="text-small"
                            onClick={() => { setSaveVersionOpen(false); setSaveVersionMessage(''); }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            <div className={`grid grid-2 ${styles.loaderGrid}`}>
                <ConfigEditor
                    configText={configText}
                    showWhitespace={showWhitespace}
                    validConfig={validConfig}
                    yamlValid={configYamlValid}
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
                    onSaveVersion={handleSaveVersionClick}
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

            {/*<SchemaView schema={schema} />*/}
        </div>
    );
};
export default YamlEditor
