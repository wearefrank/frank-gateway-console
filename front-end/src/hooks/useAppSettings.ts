import { useState } from 'react';
import { type AppSettings, SETTINGS_DEFAULTS, deepMerge } from '../settings/AppSettings';

const STORAGE_KEY = 'app-settings';

function load(): AppSettings {
    try {
        return deepMerge(SETTINGS_DEFAULTS, JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'));
    } catch {
        return SETTINGS_DEFAULTS;
    }
}

export function useAppSettings(): [AppSettings, (next: AppSettings) => void] {
    const [settings, setSettingsState] = useState<AppSettings>(load);

    function setSettings(next: AppSettings) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setSettingsState(next);
    }

    return [settings, setSettings];
}
