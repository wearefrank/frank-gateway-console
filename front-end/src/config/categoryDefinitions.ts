export interface CategoryDefinition {
    label: string;
    color: string;
    idField: string;
    fallbackFields: string[];
    referenceableFields: string[]; // fields whose values other resources copy as reference IDs
}

export const CATEGORY_DEFINITIONS: Record<string, CategoryDefinition> = {
    route:         { label: 'Route',         color: '#3b82f6', idField: 'id',       fallbackFields: ['name', 'uri', 'uris', 'host'], referenceableFields: ['id']       },
    upstream:      { label: 'Upstream',      color: '#22c55e', idField: 'id',       fallbackFields: ['name', 'host'],                referenceableFields: ['id']       },
    service:       { label: 'Service',       color: '#f97316', idField: 'id',       fallbackFields: ['name'],                        referenceableFields: ['id']       },
    consumer:      { label: 'Consumer',      color: '#8b5cf6', idField: 'username', fallbackFields: [],                              referenceableFields: ['username'] },
    global_rule:   { label: 'Global Rule',   color: '#ef4444', idField: 'id',       fallbackFields: [],                              referenceableFields: []           },
    plugin_config: { label: 'Plugin Config', color: '#f59e0b', idField: 'id',       fallbackFields: ['name'],                        referenceableFields: ['id']       },
    ssl:           { label: 'SSL',           color: '#94a3b8', idField: 'id',       fallbackFields: ['snis', 'cert'],                referenceableFields: []           },
};

export const CATEGORY_COLOR: Record<string, string> = Object.fromEntries(
    Object.entries(CATEGORY_DEFINITIONS).map(([k, v]) => [k, v.color]),
);

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
    Object.entries(CATEGORY_DEFINITIONS).map(([k, v]) => [k, v.label]),
);


export function getIdField(category: string): string {
    return CATEGORY_DEFINITIONS[category]?.idField ?? 'id';
}

export function getDisplayId(category: string, entry: Record<string, unknown>, index?: number): string {
    const def = CATEGORY_DEFINITIONS[category];
    const raw = entry[def?.idField ?? 'id'];
    if (raw !== undefined && raw !== null && String(raw).trim() !== '') return String(raw);

    for (const field of (def?.fallbackFields ?? [])) {
        const val = entry[field];
        if (val === undefined || val === null) continue;
        const str = Array.isArray(val) ? String(val[0]) : String(val);
        if (str.trim() !== '') return str;
    }

    for (const val of Object.values(entry)) {
        if (typeof val === 'string' && val.trim() !== '') return val;
    }

    return `#${index ?? 0}`;
}
