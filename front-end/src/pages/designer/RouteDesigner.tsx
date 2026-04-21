import {useCallback, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {useConfigManager} from '../../hooks/useConfigManager';
import {SchemaFormGenerator, type SchemaField} from '../../actions/SchemaFormGenerator';
import {SchemaFormRenderer} from '../../components/SchemaFormRenderer/SchemaFormRenderer';
import {IdField} from '../../components/SchemaFormRenderer/IdField/IdField';
import {useDesignerSettings} from '../../hooks/useDesignerSettings';
import {DesignerSettings} from './DesignerSettings';
import {dump} from 'js-yaml';
import type {ResolvedError} from '../../actions/ErrorResolver';
import styles from './RouteDesigner.module.css';


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

    const [category, setCategory] = useState<string>('route');
    const [domain, setDomain] = useState<string>('');
    const [added, setAdded] = useState<boolean>(false);
    const [designerSettings, setDesignerSettings] = useDesignerSettings();

    const {configManager, schema, schemaLoading, config, setConfig} = useConfigManager();
    const [values, setValues] = useState<Record<string, unknown>>({});

    const [categoryValMap, setCategoryValMap] = useState<Record<string, Record<string, unknown>>>({});

    const handleCategorySwitch = useCallback((newCategory: string) => {
        setCategoryValMap(prev => ({ ...prev, [category]: values }));
        setValues(categoryValMap[newCategory] ?? {});
        setCategory(newCategory);
    }, [category, values, categoryValMap]);

    const handleChange = useCallback((name: string, value: unknown) => {
        setValues(prev => {
            if (value === undefined) {
                const { [name]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [name]: value };
        });
    }, []);

    const generator = useMemo(() => schema ? new SchemaFormGenerator(schema) : null, [schema]);
    const fields = useMemo(() => generator?.getFields(category) ?? [], [generator, category]);

    // search
    const [search, setSearch] = useState('');


    const yamlPreview = useMemo(() => {
        const obj = buildYamlObject(values, fields);

        // if nothing is set
        if (Object.keys(obj).length === 0) return '# Fill in a field...';

        return dump(obj, {indent: 2, noRefs: true, sortKeys: true});
    }, [values, fields]);

    const resolvedErrors: ResolvedError[] = useMemo(() => {
        const obj = buildYamlObject(values, fields);
        if (Object.keys(obj).length === 0) return [];
        return configManager.validateCategory(category, obj);
    }, [values, fields, configManager, category]);

    const handleAddToConfig = useCallback(() => {
        const obj = buildYamlObject(values, fields);
        if (Object.keys(obj).length === 0) return;

        const key = category + 's';
        let newConfig: Record<string, unknown> = config ? { ...config } : {};

        let existing: unknown[] = [];
        if (Array.isArray(newConfig[key])) {
            existing = [...newConfig[key]];
        }

        newConfig = {
            ...newConfig,
            [key]: [...existing, obj]
        };

        setConfig(newConfig, dump(newConfig, { indent: 2, noRefs: true }));

        setAdded(true);
        setTimeout(() => setAdded(false), 2000);
    }, [values, fields, category, config, setConfig]);

    const handleErrorAction = useCallback((action: DesignerAction) => {
        if (action.type === 'set-field') handleChange(action.field, action.value);
        if (action.type === 'set-search') setSearch(action.term);
    }, [handleChange]);

    if (schemaLoading) return <div>Loading....</div>;
    if (!configManager || !schema) return <div>Config manager not available</div>;


    const priorityList = designerSettings.getPriorityList(category);
    const baseOverrides = designerSettings.getMergedOverrides(category);
    const selectedDomainConfig = designerSettings.getDomains().find(d => d.name === domain);
    const overrideSettings = selectedDomainConfig
        ? {
            ...baseOverrides,
            id: { ...(baseOverrides['id'] as object ?? {}), placeHolderOptions: selectedDomainConfig.placeholders },
          }
        : baseOverrides;

    return (
        <div className="container">
            <div className={styles.pageHeader}>
                <h2>{category} designer</h2>
                <div className={styles.categoryRow}>
                    <label htmlFor="category-input">Category</label>
                    <select name="category-input" id="category-input"
                            onChange={e => handleCategorySwitch(e.target.value)}
                            className={styles.categoryInput}>
                        <option value="route">Routes</option>
                        <option value="upstream">Upstreams</option>
                        <option value="service">Services</option>
                        <option value="consumer">Consumers</option>
                        <option value="global_rule">global rules</option>
                        <option value="ssl">ssl</option>
                        <option value="plugin_config">plugin config</option>
                    </select>
                </div>
                <div className={styles.categoryRow}>
                    <label htmlFor="domain-input">Domain</label>
                    <select name="domain-input" id="domain-input"
                            value={domain}
                            onChange={e => setDomain(e.target.value)}
                            className={styles.categoryInput}>
                        <option value="">— none —</option>
                        {designerSettings.getDomains().map(d => (
                            <option key={d.name} value={d.name}>{d.name}</option>
                        ))}
                    </select>
                </div>
                <Link to="/designer/settings" className={styles.settingsLink}>Settings</Link>
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
                                disabled={resolvedErrors.length > 0 || Object.keys(buildYamlObject(values, fields)).length === 0}
                            >
                                Add to Config
                            </button>
                            {added && <span className={styles.addedConfirmation}>Added!</span>}
                        </div>
                        <input type={"search"}
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
                            overrides={{ id: IdField }}
                            overrideSettings={overrideSettings}
                        />
                    </form>
                </div>
            </div>
        </div>
    );
};

type DesignerAction =
    | { type: 'set-field'; field: string; value: unknown }
    | { type: 'set-search'; term: string };

interface DesignerErrorLogProps {
    resolvedErrors: ResolvedError[];
    onAction: (action: DesignerAction) => void;
}

export const DesignerErrorLogs = ({resolvedErrors, onAction} : DesignerErrorLogProps) => {
    return (
        <div className={`card ${styles.validationCard}`}>
            <div className="card-header">Validation</div>
            <div className={styles.validationBody}>
                {resolvedErrors.map((err, i) => (
                    <div key={`err-${i}`} className={styles.errorMessage}>
                        {err.path && <strong>[{err.path}] </strong>}
                        {err.message}
                        <ErrorActions error={err} onAction={onAction} />
                    </div>
                ))}
            </div>
        </div>
    );
};

interface ErrorActionsProps {
    error: ResolvedError;
    onAction: (action: DesignerAction) => void;
}

const ErrorActions = ({ error, onAction }: ErrorActionsProps) => {
    const { hint } = error;
    if (!hint) return null;

    if (hint.type === 'anyof' && Array.isArray(hint.possibleOptions)) {
        return (
            <div className={styles.errorActions}>
                {hint.possibleOptions.map((variant: string[], i) => (
                    <button
                        key={i}
                        className={styles.actionButton}
                        onClick={() => onAction({ type: 'set-search', term: variant.join(" ") })}
                    >
                        Use: {variant.join(', ')}
                    </button>
                ))}
            </div>
        );
    }

    return (
        <div className={styles.errorActions}>
            {hint.default !== undefined && (
                <button
                    className={styles.actionButton}
                    onClick={() => onAction({ type: 'set-field', field: hint.field, value: hint.default })}
                >
                    Apply default: {String(hint.default)}
                </button>
            )}
        </div>
    );
};