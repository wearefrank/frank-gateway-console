import {useCallback, useMemo, useState} from 'react';
import {useConfigManager} from '../../hooks/useConfigManager';
import {SchemaFormGenerator, type SchemaField} from '../../actions/SchemaFormGenerator';
import {SchemaFormRenderer} from '../../components/SchemaFormRenderer/SchemaFormRenderer';
import {dump} from 'js-yaml';
import type {ValidationLog} from '../../actions/ValidationLogger';
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

    const category = 'route';

    const {configManager, schema, schemaLoading} = useConfigManager();
    const [values, setValues] = useState<Record<string, unknown>>({});

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
    const fields = useMemo(() => generator?.getFields(category) ?? [], [generator]);

    const yamlPreview = useMemo(() => {
        const obj = buildYamlObject(values, fields);
        if (Object.keys(obj).length === 0) return '# Fill in a field...';
        return dump(obj, {indent: 2, noRefs: true, sortKeys: true});
    }, [values, fields]);

    const validationLogs: ValidationLog[] = useMemo(() => {
        const obj = buildYamlObject(values, fields);
        if (Object.keys(obj).length === 0) return [];
        return configManager.validator.validateCategory(category, obj);
    }, [values, fields, configManager]);

    const errors = useMemo(() => validationLogs.filter(l => l.type === 'error'), [validationLogs]);
    const warnings = useMemo(() => validationLogs.filter(l => l.type === 'warning'), [validationLogs]);

    if (schemaLoading) return <div>Loading....</div>;
    if (!configManager || !schema) return <div>Config manager not available</div>;

    return (
        <div className="container">
            <h2>{category} designer</h2>

            <div className={styles.layout}>
                <div className={styles.leftColumn}>
                    {/* YAML Preview */}
                    <div className={`card ${styles.yamlPreviewCard}`}>
                        <div className="card-header">YAML Preview</div>
                        <pre className={styles.yamlPreviewContent}>{yamlPreview}</pre>
                    </div>

                    {/* Validation Results */}
                    <div className={`card ${styles.validationCard}`}>
                        <div className="card-header">Validation</div>
                        <div className={styles.validationBody}>
                            {errors.length > 0 && errors.map((log, i) => (
                                <div key={`err-${i}`} className={styles.errorMessage}>
                                    {log.path && <strong>[{log.path}] </strong>}
                                    {log.formatErrorMessage()}
                                </div>
                            ))}
                            {warnings.length > 0 && warnings.map((log, i) => (
                                <div key={`warn-${i}`} className={styles.warningMessage}>
                                    {log.path && <strong>[{log.path}] </strong>}
                                    {log.formatErrorMessage()}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Form Fields */}
                <div className="card">
                    <div className="card-header">Route Configuration</div>
                    <form className={styles.routeForm} onSubmit={e => e.preventDefault()}>
                        <SchemaFormRenderer
                            fields={fields}
                            values={values}
                            onChange={handleChange}
                        />
                    </form>
                </div>
            </div>
        </div>
    );
};
