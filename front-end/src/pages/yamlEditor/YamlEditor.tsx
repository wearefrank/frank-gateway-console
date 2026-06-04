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
    const validationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [scrollToTarget, setScrollToTarget] = useState<{ path: string; key: number } | null>(null);
    const [rightTab, setRightTab] = useState<'validation' | 'references'>('validation');
    const [refLogs, setRefLogs] = useState<ValidationLog[]>([]);
    const [highlightedLog, setHighlightedLog] = useState<ValidationLog | null>(null);

    const logger = useMemo(() => new ValidationLogger(), []);

    // APISIX standalone mode requires a #END marker at the end of the file
    const localErrors = useMemo<ValidationLog[]>(() => {
        if (!configText.trim() || configText.trimEnd().endsWith('#END')) return [];
        return [logger.add('error', 'Config is missing the #END marker at the end')];
    }, [configText, logger]);

    const validConfig = useMemo(
        () => configYamlValid && !logs.some(l => l.type === 'error') && localErrors.length === 0,
        [configYamlValid, logs, localErrors]
    );

    // merged log list: local errors first (e.g. missing #END), then schema errors, then reference warnings
    // sorted by path so the order matches the document order in the editor

    // maps plural YAML keys (e.g. "routes", "upstreams") to their position in the parsed config,
    // so logs are ordered by the same category sequence as the config file
    const CATEGORY_ORDER: Record<string, number> = Object.fromEntries(
        Object.keys(config ?? {}).map((k, i) => [k, i])
    );

    // sorts two logs by their JSON pointer path (e.g. "/routes/2/plugins/limit-req") so the
    // error list mirrors top-to-bottom reading order in the YAML editor:
    // 1. logs without a path (global messages like "Configuration is VALID") sort first
    // 2. first segment: category order from CATEGORY_DEFINITIONS (routes before upstreams, etc.)
    // 3. second segment: array index as a number (route 0 before route 10)
    // 4. other remaining segments: alphabetical field/plugin name
    const sortByPath = (a: ValidationLog, b: ValidationLog): number => {
        if (!a.path && !b.path) return 0;
        if (!a.path) return -1;
        if (!b.path) return 1;
        const aParts = a.path.split('/').filter(Boolean);
        const bParts = b.path.split('/').filter(Boolean);
        for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
            const aSeg = aParts[i];
            const bSeg = bParts[i];
            if (i === 0) {
                // sort by category position; unknown categories fall to the end
                const aOrder = CATEGORY_ORDER[aSeg] ?? Infinity;
                const bOrder = CATEGORY_ORDER[bSeg] ?? Infinity;
                if (aOrder !== bOrder) return aOrder - bOrder;
            } else {
                // numeric segments (array indices) are compared as integers to avoid "10" < "2"
                const aNum = parseInt(aSeg, 10);
                const bNum = parseInt(bSeg, 10);
                if (!isNaN(aNum) && !isNaN(bNum)) {
                    if (aNum !== bNum) return aNum - bNum;
                } else {
                    const cmp = aSeg.localeCompare(bSeg);
                    if (cmp !== 0) return cmp;
                }
            }
        }
        // shorter paths sort before longer ones with the same prefix
        return aParts.length - bParts.length;
    };

    const schemeLogs = localErrors.length > 0 ? logs.filter(l => l.type !== 'success') : logs;
    const displayLogs = [
        ...localErrors,
        ...[...schemeLogs, ...refLogs].sort(sortByPath),
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
        if (validationDebounceRef.current) clearTimeout(validationDebounceRef.current);
        validationDebounceRef.current = setTimeout(() => setGlobalConfig(newValue), 400);
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

    // scroll the editor to a specific entry when navigated here from another page (e.g. topology view)
    useEffect(() => {
        const focusCategory = searchParams.get('focusCategory');
        const focusId = searchParams.get('focusId');
        const focusNonce = searchParams.get('_n');
        if (!config || !focusCategory || !focusId) return;

        // Only scroll once per unique focus target. Without this guard, any
        // config change (e.g. a keystroke) would re-trigger the scroll because
        // `config` is a dependency needed to resolve the array index.
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
        <div className={styles.loaderPage}>
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

            <div className={styles.loaderGrid}>
                <ConfigEditor
                    configText={configText}
                    showWhitespace={showWhitespace}
                    validConfig={validConfig}
                    yamlValid={configYamlValid}
                    fillDefaults={fillDefault}
                    validationLogs={displayLogs}
                    config={config}
                    schema={schema}
                    onConfigChange={handleConfigChange}
                    onToggleWhitespace={() => setShowWhitespace(!showWhitespace)}
                    onToggleFillDefaults={toggleFillDefault}
                    onLineClick={log => {
                        setHighlightedLog(log);
                        setRightTab('validation');
                    }}
                    onReferenceNavigate={path => {
                        scrollKeyRef.current += 1;
                        setScrollToTarget({ path, key: scrollKeyRef.current });
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
