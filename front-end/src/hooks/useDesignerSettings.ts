import {useState} from 'react';

export interface DesignerOverrideSettings {
    global: Record<string, unknown>;
    perCategory: Record<string, Record<string, unknown>>;
}

export interface DomainConfig {
    name: string;
    placeholders: Record<string, string[]>;
}

interface DesignerSettingsData {
    priorityMap: Record<string, string[]>;
    overrideSettings: DesignerOverrideSettings;
    domains: DomainConfig[];
}

const STORAGE_KEY = 'designer-settings';

const DEFAULT_PRIORITY_MAP: Record<string, string[]> = {
    route:       ['id', 'uri', 'upstream_id'],
    upstream:    ['id', 'name', 'nodes'],
    service:     ['id', 'name'],
    consumer:    ['username', 'plugins'],
    global_rule: ['id', 'plugins'],
};

const DEFAULT_OVERRIDE_SETTINGS: DesignerOverrideSettings = {
    global: {},
    perCategory: {},
};

export class DesignerSettingsManager {

    private readonly priorityMap: Record<string, string[]>;
    private readonly overrideSettings: DesignerOverrideSettings;

    private readonly domains: DomainConfig[];

    constructor(data: DesignerSettingsData = { priorityMap: DEFAULT_PRIORITY_MAP, overrideSettings: DEFAULT_OVERRIDE_SETTINGS, domains: [] }) {
        this.priorityMap = data.priorityMap;
        this.overrideSettings = data.overrideSettings;
        this.domains = data.domains ?? [];
    }


    public getDomains(): DomainConfig[] {
        return this.domains;
    }

    public withDomains(domains: DomainConfig[]): DesignerSettingsManager {
        return new DesignerSettingsManager({ ...this.toData(), domains });
    }

    public getPriorityMap(): Record<string, string[]> {
        return this.priorityMap;
    }

    public getPriorityList(category: string): string[] {
        return this.priorityMap[category] ?? [];
    }

    public withPriorityMap(priorityMap: Record<string, string[]>): DesignerSettingsManager {
        return new DesignerSettingsManager({ ...this.toData(), priorityMap });
    }

    public getMergedOverrides(category: string): Record<string, unknown> {
        const { global, perCategory } = this.overrideSettings;
        const categoryOverrides = perCategory[category] ?? {};

        const fieldNames = new Set([
            ...Object.keys(global),
            ...Object.keys(categoryOverrides),
        ]);

        const merged: Record<string, unknown> = {};
        for (const fieldName of fieldNames) {
            merged[fieldName] = {
                ...(global[fieldName] as object ?? {}),
                ...(categoryOverrides[fieldName] as object ?? {}),
            };
        }

        return merged;
    }

    public withGlobalOverride(fieldName: string, settings: unknown): DesignerSettingsManager {
        return new DesignerSettingsManager({
            ...this.toData(),
            overrideSettings: {
                ...this.overrideSettings,
                global: { ...this.overrideSettings.global, [fieldName]: settings },
            },
        });
    }

    public withCategoryOverride(category: string, fieldName: string, settings: unknown): DesignerSettingsManager {
        const existing = this.overrideSettings.perCategory[category] ?? {};
        return new DesignerSettingsManager({
            ...this.toData(),
            overrideSettings: {
                ...this.overrideSettings,
                perCategory: {
                    ...this.overrideSettings.perCategory,
                    [category]: { ...existing, [fieldName]: settings },
                },
            },
        });
    }

    public serialize(): string {
        return JSON.stringify(this.toData());
    }

    public toData(): DesignerSettingsData {
        return {
            priorityMap: this.priorityMap,
            overrideSettings: this.overrideSettings,
            domains: this.domains,
        };
    }

    public static deserialize(json: string): DesignerSettingsManager {
        const parsed = JSON.parse(json) as Partial<DesignerSettingsData>;
        return new DesignerSettingsManager({
            priorityMap: parsed.priorityMap ?? DEFAULT_PRIORITY_MAP,
            overrideSettings: {
                global: parsed.overrideSettings?.global ?? {},
                perCategory: parsed.overrideSettings?.perCategory ?? {},
            },
            domains: (parsed.domains ?? []).map((d: unknown): DomainConfig => {
                if (typeof d === 'string') return { name: d, placeholders: {} };
                const dc = d as DomainConfig;
                // migrate old string values to string[]
                const placeholders: Record<string, string[]> = {};
                for (const [k, v] of Object.entries(dc.placeholders ?? {})) {
                    placeholders[k] = Array.isArray(v) ? v : [v as unknown as string];
                }
                return { name: dc.name, placeholders };
            }),
        });
    }

    public static fromStorage(): DesignerSettingsManager {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? DesignerSettingsManager.deserialize(raw) : new DesignerSettingsManager();
        } catch {
            return new DesignerSettingsManager();
        }
    }
}


// Hook function
export function useDesignerSettings(): [DesignerSettingsManager, (next: DesignerSettingsManager) => void] {
    const [manager, setManagerState] = useState<DesignerSettingsManager>(
        () => DesignerSettingsManager.fromStorage()
    );

    function setManager(next: DesignerSettingsManager) {
        localStorage.setItem(STORAGE_KEY, next.serialize());
        setManagerState(next);
    }

    return [manager, setManager];
}
