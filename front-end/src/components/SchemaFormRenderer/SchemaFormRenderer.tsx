import type {ComponentType} from 'react';
import type {SchemaField} from '../../actions/SchemaFormGenerator';
import styles from './SchemaFormRenderer.module.css';

export interface FieldProps {
    field: SchemaField;
    value?: unknown;
    onChange?: (name: string, value: unknown) => void;
}

// --- Individual field components ---

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

function ArrayField({field, value, onChange}: FieldProps) {
    const placeholder = field.description ?? `Enter ${field.name} (comma-separated)`;
    return (
        <input id={field.name} name={field.name} type="text" placeholder={placeholder}
               required={field.required}
               value={(value as string) ?? ''}
               onChange={e => onChange?.(field.name, e.target.value)}/>
    );
}

// --- Type → component map ---

const fieldComponents: Record<SchemaField['type'], ComponentType<FieldProps>> = {
    text: TextField,
    number: NumberField,
    checkbox: CheckboxField,
    select: SelectField,
    array: ArrayField,
};

// --- Renderer ---

interface SchemaFormRendererProps {
    fields: SchemaField[];
    values?: Record<string, unknown>;
    onChange?: (name: string, value: unknown) => void;
    overrides?: Record<string, ComponentType<FieldProps>>;
}

export function SchemaFormRenderer({fields, values, onChange, overrides}: SchemaFormRendererProps) {
    return (
        <>
            {fields.map(field => {
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
