import {type ApisixConfig, SchemaValidator, type AddLog } from './SchemaValidation';

export class ConfigManager {
    private validator: SchemaValidator;
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

    public getSchema(): any | null {
        return this.validator.getSchema();
    }

    public validate(addLog: AddLog) {
        if (!this.config) return

        this.validator.setConfig(this.config);
        this.validator.validate(addLog);
    }
}
