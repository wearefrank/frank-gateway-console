import {type ApisixConfig, type RawConfigValidation, type SchemaCatalog, SchemaValidator} from './SchemaValidation';
import { ValidationLog } from './ValidationLogger';
import ErrorResolver, { type ResolvedError } from './ErrorResolver';

export class ConfigManager {
    private validator: SchemaValidator;
    private errorResolver = new ErrorResolver();
    private config: ApisixConfig | null = null;

    constructor() {
        this.validator = new SchemaValidator();
    }

    public setConfig(config: ApisixConfig) {
        this.config = config;
    }

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

        if (!this.validator.getSchema()?.main) {
            return [new ValidationLog('warning', 'Schema catalog missing')];
        }

        this.validator.setConfig(this.config);

        let raw: RawConfigValidation;
        try {
            raw = this.validator.validateConfig();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return [new ValidationLog('error', `Validation failure: ${msg}`)];
        }

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
}
