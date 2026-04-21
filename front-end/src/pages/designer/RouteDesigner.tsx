import {useCallback, useMemo, useState} from 'react';
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
    const {category, values, handleChange, handleCategorySwitch} = useFormByCategory('route');
    const [domain, setDomain] = useState<string>('');
    const [added, setAdded] = useState<boolean>(false);
    const [search, setSearch] = useState<string>('');
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

    const handleAddToConfig = useCallback(() => {
        if (Object.keys(builtObject).length === 0) return;

        const key = category + 's';
        const existing = Array.isArray(config?.[key as keyof typeof config])
            ? [...(config[key as keyof typeof config] as unknown[])]
            : [];

        const newConfig = {...(config ?? {}), [key]: [...existing, builtObject]};
        setConfig(newConfig, dump(newConfig, {indent: 2, noRefs: true}));

        setAdded(true);
        setTimeout(() => setAdded(false), 2000);
    }, [builtObject, category, config, setConfig]);

    const handleErrorAction = useCallback((action: DesignerAction) => {
        if (action.type === 'set-field') handleChange(action.field, action.value);
        if (action.type === 'set-search') setSearch(action.term);
    }, [handleChange]);

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
                    onChange={c => handleCategorySwitch(c as DesignerCategory)}
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
                    <DesignerErrorLogs resolvedErrors={resolvedErrors} onAction={handleErrorAction} />

                    {/* Settings */}
                    <DesignerSettings
                        category={category}
                        fields={fields}
                        settings={designerSettings}
                        onSettingsChange={setDesignerSettings}
                    />
                </div>

                {/* Form Fields */}
                <div className={`card ${styles.formCard}`}>
                    <div className="card-header">{category} Configuration
                        <div className={styles.addToConfigRow}>
                            <button
                                className={styles.addButton}
                                onClick={handleAddToConfig}
                                disabled={resolvedErrors.length > 0 || Object.keys(builtObject).length === 0}
                            >
                                Add to Config
                            </button>
                            {added && <span className={styles.addedConfirmation}>Added!</span>}
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
