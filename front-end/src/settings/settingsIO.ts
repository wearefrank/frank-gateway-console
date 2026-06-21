import { type AppSettings, SETTINGS_DEFAULTS, deepMerge } from './AppSettings';

export function exportSettings(settings: AppSettings): string {
    const now = new Date();
    const exportedAt = now.toISOString();
    const datePart = exportedAt.slice(0, 10);
    // format the label for the filename (e.g. "file name" -> "-file-name")
    const formatedFileName = settings.meta.label.toLowerCase().match(/[a-z0-9]+/g)?.join('-');
    const labelPart = formatedFileName ? `-${formatedFileName}` : '';
    const exportable = { ...settings, meta: { ...settings.meta, exportedAt } };
    const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frank!gate-settings${labelPart}-${datePart}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return exportedAt;
}

export async function importSettings(file: File): Promise<AppSettings> {
    const text = await file.text();
    const parsed = JSON.parse(text) as Partial<AppSettings>;
    return deepMerge(SETTINGS_DEFAULTS, parsed);
}
