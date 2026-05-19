import {type ChangeEvent, type ComponentType, useMemo, useState} from 'react';
import {type SchemaField, SchemaFormGenerator} from '../../actions/SchemaFormGenerator';
import type {JsonSchema, SchemaCatalog} from '../../actions/SchemaValidation';
import styles from './SchemaFormRenderer.module.css';
import {CollapsibleSection} from "./CollapsibleSection/CollapsibleSection.tsx";
import {fieldMatchesSearch} from "./FieldMatchesSearch.tsx";

export interface FieldProps {
    field: SchemaField;
    value?: unknown;
    onChange?: (name: string, value: unknown) => void;
    searchTerm?: string;
    settings?: unknown;
}

// --- field components ---

function TextField({field, value, onChange}: FieldProps) {
    if (field.type !== 'text') return null;
    const placeholder = field.defaultValue != null
        ? String(field.defaultValue)
        : field.description ?? `Enter ${field.name}`;
    return (
        <input id={field.name} name={field.name} type="text" placeholder={placeholder}
               pattern={field.pattern} required={field.required}
               value={(value as string) ?? ''}
               onChange={e => onChange?.(field.name, e.target.value || undefined)}/>
    );
}

function NumberField({field, value, onChange}: FieldProps) {
    if (field.type !== 'number') return null;
    const placeholder = field.defaultValue != null
        ? String(field.defaultValue)
        : field.description ?? `Enter ${field.name}`;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;

        // Allow clearing the field
        if (raw === '') {
            onChange?.(field.name, undefined);
            return;
        }

        // Reject non-numeric input (does allow for a '.')
        if (!/^-?\d*\.?\d*$/.test(raw)) return;

        const num = Number(raw);
        if (isNaN(num)) return;

        // Clamp to min/max bounds
        if (field.minimum != null && num < field.minimum) {
            onChange?.(field.name, field.minimum);
            return;
        }
        if (field.maximum != null && num > field.maximum) {
            onChange?.(field.name, field.maximum);
            return;
        }

        onChange?.(field.name, num);
    };

    return (
        <input
            id={field.name}
            name={field.name}
            type="text"
            inputMode="numeric"
            placeholder={placeholder}
            required={field.required}
            value={(value as string) ?? ''}
            onChange={handleChange}
        />
    );
}

function CheckboxField({field, value, onChange}: FieldProps) {
    if (field.type !== 'checkbox') return null;
    return (
        <input id={field.name} name={field.name} type="checkbox" required={field.required}
               checked={(value as boolean) ?? field.defaultValue ?? false}
               onChange={e => onChange?.(field.name, e.target.checked)}/>
    );
}

function SelectField({field, value, onChange}: FieldProps) {
    if (field.type !== 'select') return null;
    const placeholder = field.description ?? `Enter ${field.name}`;
    const defaultLabel = field.defaultValue != null
        ? `-- select (default: ${field.defaultValue}) --`
        : '-- select --';

    const selectedIndex = field.options.findIndex(opt => opt.value === value);
    const selectValue = selectedIndex !== -1 ? String(selectedIndex) : '';

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const idx = e.target.value;
        if (idx === '') {
            onChange?.(field.name, undefined);
            return;
        }
        onChange?.(field.name, field.options[Number(idx)].value);
    };

    return (
        <>
            <div className={styles.selectDescription}>{placeholder}</div>
            <select id={field.name} name={field.name} required={field.required}
                    value={selectValue}
                    onChange={handleChange}>
                <option value="">{defaultLabel}</option>
                {field.options.map((opt, idx) => <option key={opt.label} value={idx}>{opt.label}</option>)}
            </select>
        </>
    );
}

function ArrayTextInput({field, value, onChange}: FieldProps) {
    const [entries, setEntries] = useState<{ id: number; value: string }[]>(() =>
        Array.isArray(value) ? value.map((v, i) => ({ id: i, value: String(v) })) : []
    );
    const [inputValue, setInputValue] = useState<string>('');
    const [syncedValue, setSyncedValue] = useState<unknown>(value);

    if (value !== syncedValue) {
        setSyncedValue(value);
        const loaded = Array.isArray(value) ? value.map((v, i) => ({ id: i, value: String(v) })) : [];
        setEntries(loaded);
    }

    if (field.type !== 'array') return null;

    const commitEntry = (val: string) => {
        if (!val) return;
        handleAdd(val);
        setInputValue('');
    };

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val.slice(-1) === ',') {
            commitEntry(val.slice(0, -1));
        } else {
            setInputValue(val);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            commitEntry(inputValue);
        }
    };

    function handleAdd(name: string) {
        const newId = Math.max(-1, ...entries.map(e => e.id)) + 1;
        const updated = [...entries, { id: newId, value: name }];
        setEntries(updated);
        onChange?.(field.name, updated.map(e => e.value));
    }

    function handleDelete(id: number) {
        const updated = entries.filter(entry => entry.id !== id);
        setEntries(updated);

        if (updated.length === 0) {
            onChange?.(field.name, undefined);
            return
        }

        onChange?.(field.name, updated.map(e => e.value));
    }

    const placeholder = field.description ?? `Enter ${field.name} (comma-separated)`;
    return (
        <>
            <div className={styles.selectDescription}>(type: ',' or press enter)</div>
            <input id={field.name} name={field.name} type="text" placeholder={placeholder}
                   required={field.required}
                   value={inputValue}
                   onChange={handleChange}
                   onKeyDown={handleKeyDown}/>
            <div className={styles.toggleGroup}>
                {entries.map(entry =>
                    <button key={entry.id} type="button" className={styles.toggle} onClick={() => handleDelete(entry.id)}>
                        {entry.value}
                    </button>
                )}
            </div>
        </>
    );
}

function ArrayEnumToggle({field, value, onChange}: FieldProps) {
    const [entries, setEntries] = useState<unknown[]>([]);
    if (field.type !== 'array') return null;

    const items = field.schema.items as { enum: unknown[] };
    const selected = new Set<unknown>(Array.isArray(value) ? (value as unknown[]) : entries);

    function handleToggle(item: unknown) {
        const next = new Set(selected);
        if (next.has(item)) next.delete(item);
        else next.add(item);
        const updated = [...next];
        setEntries(updated);
        onChange?.(field.name, updated);
    }

    return (
        <div className={styles.toggleGroup}>
            {items.enum.map(item => (
                <button
                    key={String(item)}
                    type="button"
                    className={selected.has(item) ? styles.toggleActive : styles.toggle}
                    onClick={() => handleToggle(item)}
                >
                    {String(item)}
                </button>
            ))}
        </div>
    );
}

function ArrayField({field, value, onChange}: FieldProps) {
    if (field.type !== 'array') return null;

    if (!('items' in field.schema) || field.schema.items == null) {
        return <ArrayTextInput field={field} value={value} onChange={onChange}/>;
    }

    const items = field.schema.items;

    if (typeof items === 'object' && 'enum' in items && Array.isArray(items.enum)) {
        return <ArrayEnumToggle field={field} value={value} onChange={onChange}/>;
    }

    return <ArrayTextInput field={field} value={value} onChange={onChange}/>;
}

function ArrayObjectField({field, value, onChange, searchTerm}: FieldProps) {
    if (field.type !== 'object-array') return null;

    const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

    function handleItemChange(index: number, name: string, val: unknown) {
        const updated = items.map((item, i) => {
            if (i !== index) return item;
            if (val === undefined) {
                const rest = {...item};
                delete rest[name];
                return rest;
            }
            return {...item, [name]: val};
        });
        onChange?.(field.name, updated.length > 0 ? updated : undefined);
    }

    function handleAdd() {
        onChange?.(field.name, [...items, {}]);
    }

    function handleDelete(index: number) {
        const updated = items.filter((_, i) => i !== index);
        onChange?.(field.name, updated.length > 0 ? updated : undefined);
    }

    return (
        <div className={styles.mapField}>
            {items.map((item, i) => {
                const previewKey = field.itemFields.find(f => typeof item[f.name] === 'string')?.name;
                const previewLabel = previewKey ? String(item[previewKey]) : `item ${i + 1}`;
                return (
                    <CollapsibleSection key={i} collapsePreviewNames={[previewLabel]}>
                        <div className={styles.pluginHeader}>
                            <span/>
                            <button type="button" className={styles.mapDelete} onClick={() => handleDelete(i)}>×</button>
                        </div>
                        <SchemaFormRenderer
                            fields={field.itemFields}
                            values={item}
                            onChange={(name, val) => handleItemChange(i, name, val)}
                            searchTerm={searchTerm}
                        />
                    </CollapsibleSection>
                );
            })}
            <button type="button" className={styles.addButton} onClick={handleAdd}>
                + Add {field.name.replace(/_/g, ' ')}
            </button>
        </div>
    );
}

function MapField({field, value, onChange}: FieldProps) {
    const [entries, setEntries] = useState<{id: number; key: string; val: string}[]>(() =>
        (value && typeof value === 'object' && !Array.isArray(value))
            ? Object.entries(value as Record<string, unknown>).map(([k, v], i) => ({ id: i, key: k, val: String(v) }))
            : []
    );
    const [syncedValue, setSyncedValue] = useState<unknown>(value);

    if (value !== syncedValue) {
        setSyncedValue(value);
        const loaded = (value && typeof value === 'object' && !Array.isArray(value))
            ? Object.entries(value as Record<string, unknown>).map(([k, v], i) => ({ id: i, key: k, val: String(v) }))
            : [];
        setEntries(loaded);
    }

    if (field.type !== 'map') return null;

    function emit(updated: {id: number; key: string; val: string}[]) {
        if (updated.length === 0) {
            onChange?.(field.name, undefined)
            return;
        }
        onChange?.(field.name, Object.fromEntries(updated.map(e => [e.key, e.val])));
    }

    function handleAdd() {
        const newId = Math.max(-1, ...entries.map(e => e.id)) + 1;
        const updated = [...entries, {id: newId, key: '', val: ''}];
        setEntries(updated);
        emit(updated);
    }

    function handleChange(id: number, part: 'key' | 'val', v: string) {
        const updated = entries.map(e => e.id === id ? {...e, [part]: v} : e);
        setEntries(updated);
        emit(updated);
    }

    function handleDelete(id: number) {
        const updated = entries.filter(e => e.id !== id);
        setEntries(updated);
        emit(updated);
    }

    return (
        <div className={styles.mapField}>
            {entries.map(entry => (
                <div key={entry.id} className={styles.mapRow}>
                    <input type="text" placeholder="key" value={entry.key}
                           onChange={e => handleChange(entry.id, 'key', e.target.value)}/>
                    <span className={styles.mapSeparator}>:</span>
                    <input type="text" placeholder="value" value={entry.val}
                           onChange={e => handleChange(entry.id, 'val', e.target.value)}/>
                    <button type="button" className={styles.mapDelete}
                            onClick={() => handleDelete(entry.id)}>×</button>
                </div>
            ))}
            <button type="button" className={styles.addButton} onClick={handleAdd}>+ Add entry</button>
        </div>
    );
}

function ObjectField({field, value, onChange, searchTerm}: FieldProps) {
    if (field.type !== 'object') return null;

    const objValue = (value as Record<string, unknown>) ?? {};

    const handleNestedChange = (name: string, val: unknown) => {
        if (val === undefined) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [name]: _, ...rest } = objValue;
            onChange?.(field.name, Object.keys(rest).length > 0 ? rest : undefined);
        } else {
            onChange?.(field.name, { ...objValue, [name]: val });
        }
    };

    if (field.fields.length === 0) {
        return <div className={styles.selectDescription}>No properties defined</div>;
    }

    const fieldNames = field.fields.map(entry => entry.name).sort();

    return (
        <CollapsibleSection collapsePreviewNames={fieldNames} forceOpen={!!searchTerm}>
            {field.description &&
                <div className={styles.selectDescription}>{field.description}</div>
            }
            <SchemaFormRenderer
                fields={field.fields}
                values={objValue}
                onChange={handleNestedChange}
                searchTerm={searchTerm}

            />
        </CollapsibleSection>
    );
}

function PluginField({ field, value, onChange, searchTerm }: FieldProps) {
    const [inputValue, setInputValue] = useState('');

    const objValue = (value as Record<string, unknown>) ?? {};

    const [activePlugins, setActivePlugins] = useState<string[]>(
        () => Object.keys(objValue)
    );

    const [pluginValues, setPluginValues] = useState<Record<string, Record<string, unknown>>>(
        () => objValue as Record<string, Record<string, unknown>>
    );

    const [syncedValue, setSyncedValue] = useState<unknown>(value);
    if (value !== syncedValue) {
        setSyncedValue(value);
        const newObjValue = (value as Record<string, unknown>) ?? {};
        setActivePlugins(Object.keys(newObjValue));
        setPluginValues(newObjValue as Record<string, Record<string, unknown>>);
    }

    if (!('schema' in field) || typeof field.schema.plugins !== 'object' || !field.schema.plugins) {
        return <div>No schema</div>;
    }

    const catalog = field.schema as unknown as SchemaCatalog;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const generator = useMemo(() => new SchemaFormGenerator(catalog), [catalog]);
    const pluginDefs = catalog.plugins ?? {};

    const keys = Object.keys(pluginDefs);
    const listId = `datalist-${field.name}`;

    // for disabling/enabling the button
    const isValidPlugin = keys.includes(inputValue) && !activePlugins.includes(inputValue);

    // update the nested values
    function emitAll(plugins: string[], values: Record<string, Record<string, unknown>>) {
        if (plugins.length === 0) {
            onChange?.(field.name, undefined);
            return;
        }
        onChange?.(field.name, Object.fromEntries(plugins.map(name => [name, values[name] ?? {}])));
    }

    function handleAddPlugin() {
        const updated = [...activePlugins, inputValue];
        setActivePlugins(updated);
        emitAll(updated, pluginValues);
        setInputValue('');
    }

    function handleRemovePlugin(name: string) {
        const updated = activePlugins.filter(p => p !== name);
        const updatedValues = { ...pluginValues };
        delete updatedValues[name];


        setActivePlugins(updated);
        setPluginValues(updatedValues);
        emitAll(updated, updatedValues);
    }

    function handlePluginChange(pluginName: string, fieldName: string, value: unknown) {
        const updatedValues = {
            ...pluginValues,
            [pluginName]: { ...pluginValues[pluginName], [fieldName]: value }
        };
        setPluginValues(updatedValues);
        emitAll(activePlugins, updatedValues);
    }

    function getPluginFields(pluginName: string): SchemaField[] {
        const def = pluginDefs[pluginName];

        const schema = (def?.schema ?? def) as JsonSchema;

        if (!schema || typeof schema !== 'object') return [];

        return generator.getFieldsFromSchema(schema);
    }

    return (
        <div>
            <div className={styles.mapRow}>
                <input
                    id={field.name}
                    type="text"
                    list={listId}
                    value={inputValue}
                    placeholder={field.description ?? "Select plugin..."}
                    onChange={e => setInputValue(e.target.value)}
                />
                <datalist id={listId}>
                    {keys.map(key => (
                        <option key={key} value={key} />
                    ))}
                </datalist>
                <button type="button" onClick={handleAddPlugin} disabled={!isValidPlugin}>
                    Add Plugin
                </button>
            </div>
            {activePlugins.map(name => {
                const fields = getPluginFields(name);
                return (
                    <CollapsibleSection key={name} collapsePreviewNames={[name]}>
                        <div className={styles.pluginHeader}>
                            <span className={styles.fieldLabel}>{name}</span>
                            <button type="button" className={styles.mapDelete}
                                    onClick={() => handleRemovePlugin(name)}>×</button>
                        </div>
                        {fields.length > 0 ? (
                            <SchemaFormRenderer
                                fields={fields}
                                values={pluginValues[name] ?? {}}
                                onChange={(fieldName, value) => handlePluginChange(name, fieldName, value)}
                                searchTerm={searchTerm}
                            />
                        ) : (
                            <div className={styles.selectDescription}>No configurable properties</div>
                        )}
                    </CollapsibleSection>
                );
            })}
        </div>
    );
}

// --- Type -> component map ---

const fieldComponents: Record<SchemaField['type'], ComponentType<FieldProps>> = {
    object: ObjectField,
    'object-array': ArrayObjectField,
    map: MapField,
    text: TextField,
    number: NumberField,
    checkbox: CheckboxField,
    select: SelectField,
    array: ArrayField,
    plugin: PluginField,
};

// --- Renderer ---

interface SchemaFormRendererProps {
    fields: SchemaField[];
    values?: Record<string, unknown>;
    onChange?: (name: string, value: unknown) => void;
    overrides?: Record<string, ComponentType<FieldProps>>;
    overrideSettings?: Record<string, unknown>;
    searchTerm?: string;
    priorityList?: string[];
}

export function SchemaFormRenderer({fields, values, onChange, overrides, overrideSettings, searchTerm, priorityList = []}: SchemaFormRendererProps) {

    if (!values) {
        return
    }

    const visibleFields = searchTerm
        ? fields.filter(f => fieldMatchesSearch(f, searchTerm, values[f.name]))
        : fields;

    const sortedFields = visibleFields.sort((a, b) => {
        const indexA = priorityList.indexOf(a.name);
        const indexB = priorityList.indexOf(b.name);

        // Sort them according to their order in the priorityList
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;

        // a is priority item, move it to the top
        if (indexA !== -1) return -1;

        // b is priority item, move it to the top
        if (indexB !== -1) return 1;

        // sort them alphabetically
        return a.name.localeCompare(b.name);
    });

    return (
        <>
            {sortedFields.map(field => {
                const override = overrides?.[field.name];
                const Component = override ?? fieldComponents[field.type] ?? TextField;
                const settings = override ? overrideSettings?.[field.name] : undefined;
                return (
                    <div key={field.name} className={styles.fieldGroup}>
                        <label htmlFor={field.name} className={styles.fieldLabel}>
                            {field.name} {priorityList.includes(field.name) && <span className={"text-muted"}> - Pinned</span>}
                            {field.required && <span className={styles.required}>*</span>}
                        </label>
                        <Component field={field} value={values?.[field.name]} onChange={onChange} searchTerm={searchTerm} settings={settings}/>
                    </div>
                );
            })}
        </>
    );
}
