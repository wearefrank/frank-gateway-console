import {useCallback, useMemo, useState} from 'react';
import { getIdField } from '../../config/categoryDefinitions';
import type {ResolvedError} from '../../actions/ErrorResolver';
import type {ApisixConfig} from '../../actions/SchemaValidation';
import {Link, useSearchParams} from 'react-router-dom';
import {useConfigManager} from '../../hooks/useConfigManager';
import {SchemaFormGenerator, type SchemaField} from '../../actions/SchemaFormGenerator';
import {useDesignerSettings, getMergedOverrides} from '../../hooks/useDesignerSettings';
import {useFormByCategory} from '../../hooks/useFormByCategory';
import {DesignerSettings} from './DesignerSettings';
import {DesignerErrorLogs, type DesignerAction} from './DesignerErrorLogs';
import {PillSelect} from '../../components/PillSelect/PillSelect';
import {dump} from 'js-yaml';
import {useConfigEditor} from './hooks/useConfigEditor';
import {useEntryEditor} from './hooks/useEntryEditor';
import {EntryList} from './components/EntryList';
import {ConfigFormCard} from './components/ConfigFormCard';
import {buildLineSegments} from '../yamlEditor/yamlLineUtils';
import styles from './ConfigDesigner.module.css';

// All APISIX resource types the designer supports. eg these should be all the categories found in the APISIX schema under main
export const DESIGNER_CATEGORIES = [
    'route', 'upstream', 'service', 'consumer', 'global_rule', 'ssl', 'plugin_config'
] as const;

export type DesignerCategory = typeof DESIGNER_CATEGORIES[number];

// Immutably sets a nested value at the given path inside obj.
function deepSet(obj: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
    const [head, ...rest] = path;
    if (rest.length === 0) {
        return {...obj, [head]: value};
    }
    return {...obj, [head]: deepSet((obj[head] as Record<string, unknown>) ?? {}, rest, value)};
}

// Converts raw form values into a plain object ready for YAML serialization.
// Skips empty values and handles comma-separated strings for array fields.
function buildYamlObject(values: Record<string, unknown>, fields: SchemaField[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const fieldMap = new Map<string, SchemaField>();
    for (const f of fields) {
        if (f.type === 'oneof-group') {
            for (const variant of f.variants) {
                for (const sub of variant.fields) fieldMap.set(sub.name, sub);
            }
        } else {
            fieldMap.set(f.name, f);
        }
    }

    for (const [key, raw] of Object.entries(values)) {
        if (raw === '' || raw === undefined || raw === null) continue;

        const field = fieldMap.get(key);

        if (field?.type === 'array') {
            if (Array.isArray(raw) && raw.length > 0) {
                result[key] = raw;
            } else if (typeof raw === 'string' && raw.trim()) {
                result[key] = raw.split(',').map(s => s.trim()).filter(Boolean);
            }
            continue;
        }

        result[key] = raw;
    }

    return result;
}

// Returns the CSS class and label for the global config status badge
function getConfigStatus(configText: string, configStale: boolean, configHasErrors: boolean, configYamlValid: boolean) {
    const hasText = Boolean(configText) || !configYamlValid;
    if (!hasText) return {statusClass: null, statusLabel: null};
    if (!configYamlValid) return {statusClass: styles.statusError, statusLabel: 'YAML error'};
    if (configStale) return {statusClass: styles.statusError, statusLabel: 'Config outdated'};
    if (configHasErrors) return {statusClass: styles.statusWarning, statusLabel: 'Config has errors'};
    return {statusClass: styles.statusValid, statusLabel: 'Config valid'};
}

export const ConfigDesigner = () => {
    const [searchParams] = useSearchParams();

    // Read initial category from the URL query param, fall back to 'route'.
    const rawCat = searchParams.get('category') ?? '';
    const initialCategory = (DESIGNER_CATEGORIES as readonly string[]).includes(rawCat)
        ? rawCat as DesignerCategory
        : 'route';

    const [search, setSearch] = useState('');
    const [domain, setDomain] = useState('');
    const [activeTab, setActiveTab] = useState<'entries' | 'settings' | null>('entries');


    // Form state per category - switching categories preserves values for each.
    const {category, values, handleChange, handleCategorySwitch, switchCategoryForLoad, loadValues} = useFormByCategory(initialCategory);
    const {configManager, schema, schemaLoading, config, configText, configYamlValid, setConfig} = useConfigManager();
    const [designerSettings, setDesignerSettings] = useDesignerSettings();

    // Generate form fields from the live APISIX schema for the active category.
    const generator = useMemo(() => schema ? new SchemaFormGenerator(schema) : null, [schema]);
    const fields = useMemo(() => generator?.getFields(category) ?? [], [generator, category]);

    // The plain object built from current form values, used for preview and validation.
    const builtObject = useMemo(() => buildYamlObject(values, fields), [values, fields]);

    const yamlPreview = useMemo(() => {
        if (Object.keys(builtObject).length === 0) return '# Fill in a field...';
        return dump(builtObject, {indent: 2, noRefs: true, sortKeys: true});
    }, [builtObject]);

    // Schema validation errors for the current form values.
    const resolvedErrors = useMemo(() => {
        if (Object.keys(builtObject).length === 0) return [];
        return configManager.validateCategory(category, builtObject);
    }, [builtObject, configManager, category]);

    // Handles loading an existing config entry into the form for editing.
    const {editingEntry, handleLoadEntry, handleNewEntry, clearEditingEntry} = useEntryEditor({
        category,
        configManager,
        switchCategoryForLoad,
        loadValues,
        initialCategory,
        focusId: searchParams.get('focusId'),
        configText: configText ?? '',
        onDomainDetected: (d) => setDomain(d ?? ''),
    });

    // Extra validation: flag if the current id already exists in the config (duplicate check).
    const duplicateIdErrors = useMemo<ResolvedError[]>(() => {
        const idKey = getIdField(category);
        const currentId = builtObject[idKey];
        if (typeof currentId !== 'string' || !currentId) return [];

        const existingIds = configManager.getCategoryEntries(category);
        // When editing, exclude the entry being edited from the duplicate check.
        const idsToCheck = editingEntry
            ? existingIds.filter(id => id !== editingEntry.id)
            : existingIds;

        if (!idsToCheck.includes(currentId)) return [];

        return [{
            message: `${category} id "${currentId}" already exists in the config`,
            path: `/${idKey}`,
        }];
    }, [builtObject, category, configManager, editingEntry]);

    const allErrors = useMemo(
        () => [...resolvedErrors, ...duplicateIdErrors],
        [resolvedErrors, duplicateIdErrors]
    );

    // Handles appending or replacing entries in the global config YAML.
    const {handleAddToConfig, handleSaveEdit, confirmation} = useConfigEditor({
        builtObject,
        category,
        config: config as ApisixConfig | null,
        configText: configText ?? '',
        setConfig,
        editingEntry,
        onEditSaved: clearEditingEntry,
        domain: domain || undefined,
    });

    // Config status badge: reflects yaml validity, schema errors, or a clean state.
    const configStale = Boolean(configText) && !config;
    const configValidationLogs = useMemo(() => {
        if (!config || !schema) return [];
        return configManager.validate() ?? [];
    }, [config, schema, configManager]);
    const configHasErrors = configValidationLogs.some(l => l.type === 'error');
    const {statusClass, statusLabel} = getConfigStatus(configText ?? '', configStale, configHasErrors, configYamlValid);

    // Build override settings for the form renderer, injecting domain placeholder options if a domain is selected.
    const domains = designerSettings.domains;
    const baseOverrides = getMergedOverrides(designerSettings, category);
    const selectedDomainConfig = domains.find(d => d.name === domain);
    const overrideSettings = selectedDomainConfig
        ? {...baseOverrides, id: {...(baseOverrides.id as object ?? {}), placeHolderOptions: selectedDomainConfig.placeholders}}
        : baseOverrides;

    // Switching category manually also clears any in-progress edit.
    const handleManualCategorySwitch = useCallback((newCat: string) => {
        clearEditingEntry();
        handleCategorySwitch(newCat);
    }, [handleCategorySwitch, clearEditingEntry]);

    // Applies quick-fix actions from error logs: set a field value or focus a search term.
    const handleErrorAction = useCallback((action: DesignerAction) => {
        if (action.type === 'set-field') {
            const segments = action.field.replace(/^\//, '').split('/').filter(Boolean);
            if (segments.length <= 1) {
                handleChange(segments[0] ?? action.field, action.value);
            } else {
                const [topKey, ...rest] = segments;
                const updated = deepSet((values[topKey] as Record<string, unknown>) ?? {}, rest, action.value);
                handleChange(topKey, updated);
            }
        }
        if (action.type === 'set-search') setSearch(action.term);
    }, [handleChange, values]);

    const handleTabClick = (tab: 'entries' | 'settings') => {
        setActiveTab(prev => prev === tab ? null : tab);
    };

    const priorityList = designerSettings.priorityMap[category] ?? [];

    if (schemaLoading) return <div>Loading....</div>;
    if (!configManager || !schema) return <div>Config manager not available</div>;

    return (
        <div className="container">
            <div className={styles.pageHeader}>
                <div className={styles.pageHeaderTop}>
                    <h2>{category} designer</h2>
                    {statusClass && <span className={statusClass}>{statusLabel}</span>}
                    <Link to="/designer/settings" className={styles.settingsLink}>Settings</Link>
                </div>
                <PillSelect
                    label="Category"
                    options={DESIGNER_CATEGORIES.map(c => ({value: c, label: c.replace(/_/g, ' ')}))}
                    value={category}
                    onChange={c => handleManualCategorySwitch(c as DesignerCategory)}
                />
                {domains.length > 0 && (
                    <PillSelect
                        label="Domain"
                        options={[{value: '', label: 'none'}, ...domains.map(d => ({value: d.name, label: d.name}))]}
                        value={domain}
                        onChange={setDomain}
                    />
                )}
            </div>

            <div className={styles.layout}>
                <ConfigFormCard
                    category={category}
                    fields={fields}
                    values={values}
                    onChange={handleChange}
                    priorityList={priorityList}
                    overrideSettings={overrideSettings}
                    editingEntry={editingEntry}
                    allErrors={allErrors}
                    builtObject={builtObject}
                    search={search}
                    onSearchChange={setSearch}
                    onAddToConfig={handleAddToConfig}
                    onSaveEdit={handleSaveEdit}
                    onNewEntry={handleNewEntry}
                    confirmation={confirmation}
                />

                <div className={styles.rightColumn}>
                    <div className={`card ${styles.yamlPreviewCard}`}>
                        <div className="card-header">YAML Preview</div>
                        <pre className={styles.yamlPreviewContent}>
                            {yamlPreview.split('\n').map((line, i) => (
                                <div key={i}>
                                    {buildLineSegments(line, false).map((seg, j) => {
                                        let cls: string | undefined;
                                        switch (seg.type) {
                                            case 'comment':
                                                cls = styles.commentText;
                                                break;
                                            case 'key':
                                                cls = styles.keyText;
                                                break;
                                            case 'placeholder':
                                                cls = styles.placeholderText;
                                                break;
                                        }
                                        return <span key={j} className={cls}>{seg.text}</span>;
                                    })}
                                </div>
                            ))}
                        </pre>
                    </div>

                    <DesignerErrorLogs resolvedErrors={allErrors} onAction={handleErrorAction} />

                    <div className={styles.tabbedContainer}>
                        <div className={styles.tabNav}>
                            <button
                                className={`${styles.tabButton} ${activeTab === 'entries' ? styles.activeTabButton : ''}`}
                                onClick={() => handleTabClick('entries')}
                            >
                                Entries
                            </button>
                            <button
                                className={`${styles.tabButton} ${activeTab === 'settings' ? styles.activeTabButton : ''}`}
                                onClick={() => handleTabClick('settings')}
                            >
                                Settings
                            </button>
                        </div>
                        {activeTab && (
                            <div className={styles.tabContent}>
                                {activeTab === 'entries' && (
                                    <EntryList
                                        configManager={configManager}
                                        editingEntry={editingEntry}
                                        onLoad={handleLoadEntry}
                                    />
                                )}
                                {activeTab === 'settings' && (
                                    <DesignerSettings
                                        category={category}
                                        fields={fields}
                                        settings={designerSettings}
                                        onSettingsChange={setDesignerSettings}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};