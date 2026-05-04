import type {FieldProps} from '../SchemaFormRenderer';
import {useMemo, useState} from "react";

export interface IdFieldSettings {
    prefix?: string;
    template?: string;
    placeHolderOptions?: Record<string, string[]>;
}

type TemplatePart = { kind: 'static'; text: string } | { kind: 'dynamic'; name: string };

function parseTemplate(template: string): TemplatePart[] {
    const parts: TemplatePart[] = [];
    const placeholderRegex = /{([^}]+)}/g;

    let lastIndex = 0;
    let match = placeholderRegex.exec(template);

    while (match !== null) {
        if (match.index > lastIndex) {
            const staticText = template.slice(lastIndex, match.index);
            parts.push({ kind: 'static', text: staticText });
        }

        parts.push({ kind: 'dynamic', name: match[1] });

        lastIndex = placeholderRegex.lastIndex;
        match = placeholderRegex.exec(template);
    }

    if (lastIndex < template.length) {
        parts.push({ kind: 'static', text: template.slice(lastIndex) });
    }

    return parts;
}

export function IdField({field, value, onChange, settings}: FieldProps) {
    const s = settings as IdFieldSettings | undefined;

    if (s?.template) {
        return <TemplatedIdField field={field} value={value} onChange={onChange} template={s.template} placeHolderOptions={s.placeHolderOptions ?? {}} />;
    }

    // Legacy single-input mode
    const current = (value as string) ?? '';
    const hint = s?.prefix ? `prefix: ${s.prefix}` : '';

    return (
        <div style={{display: 'flex', gap: '0.5rem'}}>
            <input
                id={field.name}
                name={field.name}
                type="text"
                placeholder={hint ? `id (${hint})` : 'Enter id'}
                value={current}
                onChange={e => onChange?.(field.name, e.target.value || undefined)}
            />
        </div>
    );
}

function parseIdValue(existing: unknown, parts: TemplatePart[]): Record<string, string> {
    const empty: Record<string, string> = Object.fromEntries(
        parts.filter((p): p is Extract<TemplatePart, { kind: 'dynamic' }> => p.kind === 'dynamic')
             .map(p => [p.name, ''])
    );
    if (!existing || typeof existing !== 'string') return empty;

    const result = {...empty};
    let rem = existing;
    parts.forEach((part, i) => {
        if (part.kind === 'static') {
            if (rem.startsWith(part.text)) rem = rem.slice(part.text.length);
        } else {
            const nextStatic = parts.slice(i + 1).find(p => p.kind === 'static') as Extract<TemplatePart, { kind: 'static' }> | undefined;
            const endIdx = nextStatic ? rem.indexOf(nextStatic.text) : rem.length;
            if (endIdx !== -1) {
                result[part.name] = rem.slice(0, endIdx);
                rem = rem.slice(endIdx);
            }
        }
    });

    const reassembled = parts.map(p => p.kind === 'static' ? p.text : result[p.name] ?? '').join('');
    return reassembled === existing ? result : empty;
}

function TemplatedIdField({ field, value, onChange, template, placeHolderOptions }: {
    field: FieldProps['field'];
    value: unknown;
    onChange?: FieldProps['onChange'];
    template: string;
    placeHolderOptions: Record<string, string[]>;
}) {
    const parts = useMemo(() => parseTemplate(template), [template]);

    const [segments, setSegments] = useState<Record<string, string>>(() => parseIdValue(value, parts));
    const [syncedValue, setSyncedValue] = useState<unknown>(value);

    if (value !== syncedValue) {
        setSyncedValue(value);
        setSegments(parseIdValue(value, parts));
    }

    function handleSegmentChange(name: string, val: string) {
        const next = { ...segments, [name]: val };
        setSegments(next);
        const joined = parts.map(p => p.kind === 'static' ? p.text : next[(p as {kind:'dynamic';name:string}).name] ?? '').join('');
        setSyncedValue(joined);
        onChange?.(field.name, joined || undefined);
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexWrap: 'wrap' }}>
            {parts.map((part, i) => {
                if (part.kind === 'static') {
                    return <span key={i} style={{ color: 'var(--text-secondary)', userSelect: 'none' }}>{part.text}</span>;
                }
                const options = placeHolderOptions[part.name] ?? [];
                if (options.length > 0) {
                    return (
                        <select key={i} value={segments[part.name] ?? ''} onChange={e => handleSegmentChange(part.name, e.target.value)}>
                            <option value="">{part.name}…</option>
                            {options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    );
                }
                return (
                    <input key={i} type="text" placeholder={part.name} value={segments[part.name] ?? ''}
                        style={{ width: `${Math.max(part.name.length, 4) + 2}ch` }}
                        onChange={e => handleSegmentChange(part.name, e.target.value)} />
                );
            })}
        </div>
    );
}
