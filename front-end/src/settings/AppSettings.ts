export interface DesignerOverrideSettings {
    global: Record<string, unknown>;
    perCategory: Record<string, Record<string, unknown>>;
}

export interface DomainConfig {
    name: string;
    placeholders: Record<string, string[]>;
}

export interface DesignerSettings {
    priorityMap: Record<string, string[]>;
    overrideSettings: DesignerOverrideSettings;
    domains: DomainConfig[];
}

export const DEFAULT_DESIGNER_SETTINGS: DesignerSettings = {
    priorityMap: {
        route: ['id', 'uri', 'upstream_id'],
        upstream: ['id', 'name', 'nodes'],
        service: ['id', 'name'],
        consumer: ['username', 'plugins'],
        global_rule: ['id', 'plugins'],
    },
    overrideSettings: { global: {}, perCategory: {} },
    domains: [],
};

export function deepMerge<T extends object>(defaults: T, loaded: Partial<T>): T {
    const result = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof T)[]) {
        const loadedVal = loaded[key];
        const defaultVal = defaults[key];
        if (loadedVal === undefined) continue;
        const isPlainObject = typeof defaultVal === 'object' && defaultVal !== null && !Array.isArray(defaultVal);
        result[key] = isPlainObject
            ? deepMerge(defaultVal as object, loadedVal as Partial<object>) as T[keyof T]
            : loadedVal as T[keyof T];
    }
    return result;
}

// Add new settings here - type and defaults are derived automatically.
export const SETTINGS_DEFAULTS = {
    meta: {
        label: '',
        exportedAt: '',
    },
    ui: {
        configViewMode: 'yaml' as 'yaml' | 'json',
        configFillDefault: false,
    },
    designer: DEFAULT_DESIGNER_SETTINGS,
};

export type AppSettings = typeof SETTINGS_DEFAULTS;
