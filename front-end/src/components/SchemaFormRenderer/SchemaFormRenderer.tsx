import {useState, type ComponentType, type ChangeEvent, useRef} from 'react';
import type {SchemaField} from '../../actions/SchemaFormGenerator';
import styles from './SchemaFormRenderer.module.css';

export interface FieldProps {
    field: SchemaField;
    value?: unknown;
    onChange?: (name: string, value: unknown) => void;
}

// --- field components ---

function TextField({field, value, onChange}: FieldProps) {
    if (field.type !== 'text') return null;
    const placeholder = field.description ?? `Enter ${field.name}`;
    return (
        <input id={field.name} name={field.name} type="text" placeholder={placeholder}
               pattern={field.pattern} required={field.required}
               value={(value as string) ?? ''}
               onChange={e => onChange?.(field.name, e.target.value)}/>
    );
}

function NumberField({field, value, onChange}: FieldProps) {
    if (field.type !== 'number') return null;
    const placeholder = field.description ?? `Enter ${field.name}`;
    return (
        <input id={field.name} name={field.name} type="number" placeholder={placeholder}
               required={field.required} min={field.minimum} max={field.maximum}
               value={(value as string) ?? ''}
               onChange={e => onChange?.(field.name, e.target.value === '' ? '' : Number(e.target.value))}/>
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
    return (
        <>
            <div className={styles.selectDescription}>{placeholder}</div>
            <select id={field.name} name={field.name} required={field.required}
                    value={(value as string) ?? field.defaultValue ?? ''}
                    onChange={e => onChange?.(field.name, e.target.value)}>
                <option value="">-- select --</option>
                {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
        </>
    );
}

function ArrayTextInput({field, value, onChange}: FieldProps) {
    const [entries, setEntries] = useState<{ id: number; value: string }[]>([]);
    const nextId = useRef(0);
    const [inputValue, setInputValue] = useState<string>((value as string) ?? '');

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
        const updated = [...entries, { id: nextId.current++, value: name }];
        setEntries(updated);
        onChange?.(field.name, updated.map(e => e.value));
    }

    function handleDelete(id: number) {
        const updated = entries.filter(entry => entry.id !== id);
        setEntries(updated);
        onChange?.(field.name, updated.map(e => e.value));
    }

    const placeholder = field.description ?? `Enter ${field.name} (comma-separated)`;
    return (
        <>
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

    console.log(field.name, field.schema);
    if (!('items' in field.schema) || field.schema.items == null) {
        return <ArrayTextInput field={field} value={value} onChange={onChange}/>;
    }

    const items = field.schema.items;

    if (typeof items === 'object' && 'enum' in items && Array.isArray(items.enum)) {
        return <ArrayEnumToggle field={field} value={value} onChange={onChange}/>;
    }

    return <ArrayTextInput field={field} value={value} onChange={onChange}/>;
}

function MapField({field, onChange}: FieldProps) {
    const [entries, setEntries] = useState<{id: number; key: string; val: string}[]>([]);
    const nextId = useRef(0);

    if (field.type !== 'map') return null;

    function emit(updated: {id: number; key: string; val: string}[]) {
        onChange?.(field.name, Object.fromEntries(updated.map(e => [e.key, e.val])));
    }

    function handleAdd() {
        const updated = [...entries, {id: nextId.current++, key: '', val: ''}];
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

function ObjectField({field, value, onChange}: FieldProps) {
    if (field.type !== 'object') return null;

    const objValue = (value as Record<string, unknown>) ?? {};

    const handleNestedChange = (name: string, val: unknown) => {
        onChange?.(field.name, { ...objValue, [name]: val });
    };

    if (field.fields.length === 0) {
        return <div className={styles.selectDescription}>No properties defined</div>;
    }

    return (
        <div className={styles.objectField}>
            {field.description &&
                <div className={styles.selectDescription}>{field.description}</div>
            }
            <SchemaFormRenderer fields={field.fields} values={objValue} onChange={handleNestedChange}/>
        </div>
    );
}

function PluginField({ field, onChange }: FieldProps) {
    const [inputValue, setInputValue] = useState('');
    const [activePlugins, setActivePlugins] = useState<string[]>([]);

    if (!('schema' in field) || typeof field.schema.plugins !== 'object' || !field.schema.plugins) {
        return <div>No schema</div>;
    }

    const keys = Object.keys(field.schema.plugins);
    const listId = `datalist-${field.name}`;
    const isValidPlugin = keys.includes(inputValue) && !activePlugins.includes(inputValue);

    function handleAddPlugin() {
        const updated = [...activePlugins, inputValue];
        setActivePlugins(updated);
        onChange?.(field.name, Object.fromEntries(updated.map(name => [name, {}])));
        setInputValue('');
    }

    return (
        <div>
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
            <button onClick={handleAddPlugin} disabled={!isValidPlugin}>
                Add Plugin
            </button>
            {activePlugins.length > 0 && (
                <ul>
                    {activePlugins.map(name => <li key={name}>{name}</li>)}
                </ul>
            )}
        </div>
    );
}

// --- Type -> component map ---

const fieldComponents: Record<SchemaField['type'], ComponentType<FieldProps>> = {
    object: ObjectField,
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
}

export function SchemaFormRenderer({fields, values, onChange, overrides}: SchemaFormRendererProps) {
    const sortedFields = fields.sort((a, b) => a.name.localeCompare(b.name));

    return (
        <>
            {sortedFields.map(field => {
                const Component = overrides?.[field.name] ?? fieldComponents[field.type] ?? TextField;
                return (
                    <div key={field.name} className={styles.fieldGroup}>
                        <label htmlFor={field.name} className={styles.fieldLabel}>
                            {field.name}
                            {field.required && <span className={styles.required}>*</span>}
                        </label>
                        <Component field={field} value={values?.[field.name]} onChange={onChange}/>
                    </div>
                );
            })}
        </>
    );
}
