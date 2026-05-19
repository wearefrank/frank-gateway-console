export type { DesignerOverrideSettings, DomainConfig, DesignerSettings } from '../settings/AppSettings';
import type { DesignerSettings } from '../settings/AppSettings';
import { useAppSettings } from './useAppSettings';

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

export function useDesignerSettings(): [DesignerSettings, (next: DesignerSettings) => void] {
    const [appSettings, setAppSettings] = useAppSettings();

    function setSettings(next: DesignerSettings) {
        setAppSettings({ ...appSettings, designer: next });
    }

    return [appSettings.designer, setSettings];
}
