import yaml from 'js-yaml';
import {type ApisixConfig, type RawConfigValidation, type SchemaCatalog, SchemaValidator} from './SchemaValidation';
import { getDisplayId } from '../config/categoryDefinitions';
import {ValidationLog} from './ValidationLogger';
import ErrorResolver, {type ResolvedError} from './ErrorResolver';

export class ConfigManager {
    private validator: SchemaValidator;
    private errorResolver = new ErrorResolver();
    private config: ApisixConfig | null = null;
    private rawText: string = '';
    private validText: string = '';
    private yamlValid: boolean = true;

    constructor() {
        this.validator = new SchemaValidator();

        // two storage keys: 'raw' holds whatever the user typed, 'valid' holds the last
        // successfully parsed version so we can always show something useful in the UI
        const raw = localStorage.getItem('apisix-config-text-raw');
        const saved = localStorage.getItem('apisix-config-text');

        this.validText = saved ?? '';
        this.rawText = raw ?? saved ?? '';

        if (saved) {
            try { this.config = yaml.load(saved) as ApisixConfig; } catch { /* ok */ }
        }

        if (raw) {
            try { yaml.load(raw); this.yamlValid = true; } catch { this.yamlValid = false; }
        }
    }

    public setRawText(text: string): void {
        this.rawText = text;

        // clearing the editor resets everything, including both storage keys
        if (!text.trim()) {
            this.config = null;
            this.validText = '';
            this.yamlValid = true;
            localStorage.removeItem('apisix-config-text');
            localStorage.removeItem('apisix-config-text-raw');
            return;
        }

        localStorage.setItem('apisix-config-text-raw', text);

        try {
            this.config = yaml.load(text) as ApisixConfig;
            this.validText = text;
            this.yamlValid = true;
            localStorage.setItem('apisix-config-text', text);
        } catch {
            this.yamlValid = false;
            // keep this.config and this.validText at last valid values
        }
    }

    public getRawText(): string { return this.rawText; }
    public getValidText(): string { return this.validText; }
    public isYamlValid(): boolean { return this.yamlValid; }

    public getConfig(): ApisixConfig | null {
        return this.config;
    }

    public setSchema(schema: SchemaCatalog | null) {
        this.validator.setSchema(schema);
    }

    public getSchema(): SchemaCatalog | null {
        return this.validator.getSchema();
    }

    public validate(): ValidationLog[] {
        if (!this.config) return [];

        const schema = this.validator.getSchema();
        if (!schema) {
            return [new ValidationLog('warning', 'Schema catalog missing - no schema loaded. Check APISIX connection settings.')];
        }
        if (!schema.main) {
            return [new ValidationLog('warning', 'Schema catalog missing - schema was loaded but contains no main definitions.')];
        }

        this.validator.setConfig(this.config);

        let raw: RawConfigValidation;
        try {
            raw = this.validator.validateConfig();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return [new ValidationLog('error', `Validation failure: ${msg}`)];
        }

        // convert/sort raw AJV output into flat ValidationLog[] for the UI to render
        const logs: ValidationLog[] = [];

        if (raw.valid && raw.errorCollections.length === 0) {
            logs.push(new ValidationLog('success', 'Configuration is VALID'));
        }
        for (const err of raw.warningErrors) {
            logs.push(new ValidationLog('warning', err.message || 'Unknown warning', undefined, err));
        }
        for (const w of raw.warnings) {
            logs.push(new ValidationLog('warning', w.message, w.path));
        }
        for (const err of this.errorResolver.resolve(raw.errorCollections)) {
            logs.push(new ValidationLog('error', err.message, err.path, err.sourceError));
        }

        return logs;
    }

    // prefix the error paths with the category name so clicking an error scrolls to the right spot in the editor
    public validateCategory(category: string, data: Record<string, unknown>): ResolvedError[] {
        const collections = this.validator.validateCategory(category, data);
        return this.errorResolver.resolve(collections).map(err => ({
            ...err,
            path: err.path.startsWith('/') ? `${category}${err.path}` : err.path,
        }));
    }

    public setFillInDefaults(fillInDefaults: boolean) {
        this.validator.setFillInDefaults(fillInDefaults);
    }

    // try both plural ("routes") and singular ("route") key forms since the YAML can use either
    public getCategoryEntry(categoryName: string, displayId: string): Record<string, unknown> | null {
        if (!this.config) return null;
        let categoryData = (this.config as Record<string, unknown>)[categoryName + 's'];
        if (!Array.isArray(categoryData))
            categoryData = (this.config as Record<string, unknown>)[categoryName];
        if (!Array.isArray(categoryData)) return null;
        return categoryData.find(
            (e: Record<string, unknown>, i: number) => getDisplayId(categoryName, e, i) === displayId
        ) ?? null;
    }

    public getCategoryEntries(categoryName: string): string[] {
        if (!this.config) return [];

        // same plural/singular fallback as getCategoryEntry
        let categoryData = (this.config as Record<string, unknown>)[categoryName+'s'];

        if (!Array.isArray(categoryData)) {
            categoryData = (this.config as Record<string, unknown>)[categoryName];
            if (!Array.isArray(categoryData)) {
                return [];
            }
        }

        return categoryData.map(
            (e: Record<string, unknown>, i: number) => getDisplayId(categoryName, e, i)
        );
    }
}
