import {type ApisixConfig, type SchemaCatalog, SchemaValidator} from './SchemaValidation';
import { type ValidationLog } from './ValidationLogger';

export class ConfigManager {
    public validator: SchemaValidator;
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

    public setSchema(schema: any) {
        this.validator.setSchema(schema);
    }

    public getSchema(): SchemaCatalog | null {
        return this.validator.getSchema();
    }

    public validate(): ValidationLog[] {
        if (!this.config) return [];

        this.validator.setConfig(this.config);
        return this.validator.validateConfig();
    }

    public setFillInDefaults(fillInDefaults: boolean) {
        this.validator.setFillInDefaults(fillInDefaults);
    }
}
