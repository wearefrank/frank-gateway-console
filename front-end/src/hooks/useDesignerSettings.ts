import {useState} from 'react';

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

const STORAGE_KEY = 'designer-settings';

const DEFAULT_SETTINGS: DesignerSettings = {
    priorityMap: {
        route: ['id', 'uri', 'upstream_id'],
        upstream: ['id', 'name', 'nodes'],
        service: ['id', 'name'],
        consumer: ['username', 'plugins'],
        global_rule: ['id', 'plugins'],
    },
    overrideSettings: {global: {}, perCategory: {}},
    domains: [],
};

export function getMergedOverrides(settings: DesignerSettings, category: string): Record<string, unknown> {
    const {global, perCategory} = settings.overrideSettings;
    const categoryOverrides = perCategory[category] ?? {};
    const fieldNames = new Set([...Object.keys(global), ...Object.keys(categoryOverrides)]);
    const merged: Record<string, unknown> = {};
    for (const fieldName of fieldNames) {
        merged[fieldName] = {
            ...(global[fieldName] as object ?? {}),
            ...(categoryOverrides[fieldName] as object ?? {}),
        };
    }
    return merged;
}

export function withCategoryOverride(settings: DesignerSettings, category: string, fieldName: string, value: unknown): DesignerSettings {
    const existing = settings.overrideSettings.perCategory[category] ?? {};
    return {
        ...settings,
        overrideSettings: {
            ...settings.overrideSettings,
            perCategory: {
                ...settings.overrideSettings.perCategory,
                [category]: {...existing, [fieldName]: value},
            },
        },
    };
}

export function parsePlaceholders(template: string): string[] {
    return [...new Set([...template.matchAll(/\{([^}]+)}/g)].map(m => m[1]))];
}

function deserialize(json: string): DesignerSettings {
    const p = JSON.parse(json) as Partial<DesignerSettings>;

    const domains = (Array.isArray(p.domains) ? p.domains : []).map((d: unknown): DomainConfig => {
        if (typeof d === 'string') return { name: d, placeholders: {} };
        const name = (d as DomainConfig)?.name || 'unknown';
        const placeholders = Object.fromEntries(
            Object.entries((d as DomainConfig)?.placeholders ?? {}).map(
                ([k, v]) => [k, Array.isArray(v) ? v : [v as string]]
            )
        );
        return { name, placeholders };
    });

    return {
        priorityMap: p.priorityMap ?? DEFAULT_SETTINGS.priorityMap,
        overrideSettings: {
            global: p.overrideSettings?.global ?? {},
            perCategory: p.overrideSettings?.perCategory ?? {},
        },
        domains,
    };
}

function fromStorage(): DesignerSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? deserialize(raw) : DEFAULT_SETTINGS;
    } catch {
        return DEFAULT_SETTINGS;
    }
}

export function useDesignerSettings(): [DesignerSettings, (next: DesignerSettings) => void] {
    const [settings, setSettingsState] = useState<DesignerSettings>(fromStorage);

    function setSettings(next: DesignerSettings) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setSettingsState(next);
    }

    return [settings, setSettings];
}
