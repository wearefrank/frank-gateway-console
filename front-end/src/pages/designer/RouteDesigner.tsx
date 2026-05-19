import {useCallback, useMemo, useState, Fragment} from 'react';
import type {ResolvedError} from '../../actions/ErrorResolver';
import {Link} from 'react-router-dom';
import {useConfigManager} from '../../hooks/useConfigManager';
import {SchemaFormGenerator, type SchemaField} from '../../actions/SchemaFormGenerator';
import {SchemaFormRenderer} from '../../components/SchemaFormRenderer/SchemaFormRenderer';
import {IdField} from '../../components/SchemaFormRenderer/IdField/IdField';
import {useDesignerSettings, getMergedOverrides} from '../../hooks/useDesignerSettings';
import {useFormByCategory} from '../../hooks/useFormByCategory';
import {DesignerSettings} from './DesignerSettings';
import {DesignerErrorLogs, type DesignerAction} from './DesignerErrorLogs';
import {PillSelect} from '../../components/PillSelect/PillSelect';
import {dump} from 'js-yaml';
import styles from './RouteDesigner.module.css';

export const DESIGNER_CATEGORIES = [
    'route', 'upstream', 'service', 'consumer', 'global_rule', 'ssl', 'plugin_config'
] as const;

export type DesignerCategory = typeof DESIGNER_CATEGORIES[number];

function deepSet(obj: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
    const [head, ...rest] = path;
    if (rest.length === 0) {
        return {...obj, [head]: value};
    }
    return {...obj, [head]: deepSet((obj[head] as Record<string, unknown>) ?? {}, rest, value)};
}

function buildYamlObject(values: Record<string, unknown>, fields: SchemaField[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const fieldMap = new Map(fields.map(f => [f.name, f]));

    for (const [key, raw] of Object.entries(values)) {
        if (raw === '' || raw === undefined || raw === null) continue;

        const field = fieldMap.get(key);

        // Array fields: split comma-separated string into array
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

export const RouteDesigner = () => {
    const {category, values, handleChange, handleCategorySwitch, loadValues} = useFormByCategory('route');
    const [domain, setDomain] = useState<string>('');
    const [confirmation, setConfirmation] = useState<string>('');
    const [search, setSearch] = useState<string>('');
    const [editingEntry, setEditingEntry] = useState<{category: string; id: string} | null>(null);
    const [designerSettings, setDesignerSettings] = useDesignerSettings();

    const {configManager, schema, schemaLoading, config, setConfig} = useConfigManager();

    const generator = useMemo(() => schema ? new SchemaFormGenerator(schema) : null, [schema]);
    const fields = useMemo(() => generator?.getFields(category) ?? [], [generator, category]);
    const builtObject = useMemo(() => buildYamlObject(values, fields), [values, fields]);

    const yamlPreview = useMemo(() => {
        if (Object.keys(builtObject).length === 0) return '# Fill in a field...';
        return dump(builtObject, {indent: 2, noRefs: true, sortKeys: true});
    }, [builtObject]);

    const resolvedErrors = useMemo(() => {
        if (Object.keys(builtObject).length === 0) return [];
        return configManager.validateCategory(category, builtObject);
    }, [builtObject, configManager, category]);

    const duplicateIdErrors = useMemo<ResolvedError[]>(() => {
        const idKey = category === 'consumer' ? 'username' : 'id';
        const currentId = builtObject[idKey];
        if (typeof currentId !== 'string' || !currentId) return [];

        const existingIds = configManager.getCategoryEntries(category);
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

    const handleAddToConfig = useCallback(() => {
        if (Object.keys(builtObject).length === 0) return;

        const key = category + 's';
        const existing = Array.isArray(config?.[key as keyof typeof config])
            ? [...(config[key as keyof typeof config] as unknown[])]
            : [];

        // bunch of fallbacks in case there is no config
        const newConfig = {...(config ?? {}), [key]: [...existing, builtObject]};
        setConfig(newConfig, dump(newConfig, {indent: 2, noRefs: true}));

        setConfirmation('Added!');
        setTimeout(() => setConfirmation(''), 2000);
    }, [builtObject, category, config, setConfig]);

    const handleSaveEdit = useCallback(() => {
        if (!editingEntry || Object.keys(builtObject).length === 0) return;

        const categoryKey = (editingEntry.category + 's') as keyof typeof config;
        const idKey = editingEntry.category === 'consumer' ? 'username' : 'id';

        // we just update over the key
        const currentList = (config?.[categoryKey] as Record<string, unknown>[]) || [];
        const updatedList = currentList.map(item =>
            item[idKey] === editingEntry.id ? builtObject : item
        );

        const newConfig = { ...config, [categoryKey]: updatedList };
        setConfig(newConfig, dump(newConfig, { indent: 2, noRefs: true }));

        setEditingEntry(null);
        setConfirmation('Saved!');
        setTimeout(() => setConfirmation(''), 2000);
    }, [editingEntry, builtObject, config, setConfig]);

    const handleLoadEntry = useCallback((cat: string, id: string) => {
        const entry = configManager.getCategoryEntry(cat, id);
        if (!entry) return;

        if (cat !== category) handleCategorySwitch(cat);

        loadValues(entry);
        setEditingEntry({category: cat, id});
    }, [category, configManager, handleCategorySwitch, loadValues]);

    const handleNewEntry = useCallback(() => {
        setEditingEntry(null);
        loadValues({});
    }, [loadValues]);

    const handleManualCategorySwitch = useCallback((newCat: string) => {
        setEditingEntry(null);
        handleCategorySwitch(newCat);
    }, [handleCategorySwitch]);

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

    if (schemaLoading) return <div>Loading....</div>;
    if (!configManager || !schema) return <div>Config manager not available</div>;

    const priorityList = designerSettings.priorityMap[category] ?? [];
    const baseOverrides = getMergedOverrides(designerSettings, category);
    const selectedDomainConfig = designerSettings.domains.find(d => d.name === domain);
    const overrideSettings = selectedDomainConfig
        ? {...baseOverrides, id: {...(baseOverrides.id as object ?? {}), placeHolderOptions: selectedDomainConfig.placeholders}}
        : baseOverrides;

    const domains = designerSettings.domains;


    return (
        <div className="container">
            <div className={styles.pageHeader}>
                <div className={styles.pageHeaderTop}>
                    <h2>{category} designer</h2>
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
                <div className={styles.leftColumn}>
                    {/* YAML Preview */}
                    <div className={`card ${styles.yamlPreviewCard}`}>
                        <div className="card-header">YAML Preview</div>
                        <pre className={styles.yamlPreviewContent}>{yamlPreview}</pre>
                    </div>

                    {/* Validation Results */}
                    <DesignerErrorLogs resolvedErrors={allErrors} onAction={handleErrorAction} />

                    {/* Settings */}
                    <DesignerSettings
                        category={category}
                        fields={fields}
                        settings={designerSettings}
                        onSettingsChange={setDesignerSettings}
                    />

                    <div className={`card`}>
                        <div className={`card-title`}>
                            Entries per category
                        </div>
                        {DESIGNER_CATEGORIES.map((cat) => {
                            const entries = configManager.getCategoryEntries(cat);
                            if (entries.length === 0) return null;
                            return (
                                <Fragment key={cat}>
                                    <div className={'card-header'}>{cat}</div>
                                    <div className={styles.pillList}>
                                        {entries.map((entry) => {
                                            const isActive = editingEntry?.category === cat && editingEntry?.id === entry;
                                            return (
                                                <button
                                                    key={entry}
                                                    className={`${styles.pill}${isActive ? ` ${styles.pillActive}` : ''}`}
                                                    onClick={() => handleLoadEntry(cat, entry)}
                                                    type="button"
                                                >
                                                    {entry}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </Fragment>
                            );
                        })}
                    </div>
                </div>
                {/* Form Fields */}
                <div className={`card ${styles.formCard}`}>
                    <div className="card-header">{category} Configuration
                        <div className={styles.headerActionRow}>
                            {editingEntry ? (
                                <>
                                    <button
                                        className={styles.addButton}
                                        onClick={handleSaveEdit}
                                        disabled={allErrors.length > 0 || Object.keys(builtObject).length === 0}
                                    >
                                        Save Changes
                                    </button>
                                    <button className={styles.newButton} onClick={handleNewEntry} type="button">
                                        New
                                    </button>
                                </>
                            ) : (
                                <button
                                    className={styles.addButton}
                                    onClick={handleAddToConfig}
                                    disabled={allErrors.length > 0 || Object.keys(builtObject).length === 0}
                                >
                                    Add to Config
                                </button>
                            )}
                            {confirmation && <span className={styles.addedConfirmation}>{confirmation}</span>}
                        </div>
                        <input type="search"
                               placeholder="search for a field"
                               onChange={e => setSearch(e.target.value)}
                               value={search}
                        />
                    </div>
                    <form className={styles.routeForm} onSubmit={e => e.preventDefault()}>
                        <SchemaFormRenderer
                            fields={fields}
                            values={values}
                            onChange={handleChange}
                            searchTerm={search}
                            priorityList={priorityList}
                            overrides={{id: IdField}}
                            overrideSettings={overrideSettings}
                        />
                    </form>
                </div>
            </div>
        </div>
    );
};
