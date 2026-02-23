import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export interface ValidationLog {
    id: number;
    timestamp: string;
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
}

export interface ApisixConfig {
    routes?: any[];
    [key: string]: any;
}

export type AddLog = (type: ValidationLog['type'], message: string) => void;

export class SchemaValidator {
    private ajv: Ajv;
    private schema: any | null = null;
    private config: ApisixConfig | null = null;
    private currentAddLog: AddLog | null = null;

    constructor() {
        this.ajv = new Ajv({
            allErrors: true,
            strict: 'log',
        });
        addFormats(this.ajv);

        this.addPluginDetection();
    }

    public addPluginDetection() {
        this.ajv.addKeyword({
            keyword: 'detectPlugins',
            type: 'object',
            validate: (_schema: any, data: any, _parentSchema: any, dataPath: any) => {
                const path = dataPath?.instancePath || '';
                const parentName = this.extractParentName(path);
                const resourceType = path.split('/')[1] || 'unknown resource';

                Object.keys(data).forEach(pluginName => {
                    this.validatePluginConfig(pluginName, data[pluginName], resourceType, parentName);
                });

                return true;
            },
        })
    }

    private validatePluginConfig(pluginName: string, pluginConfig: any, resourceType: string, parentName: string) {
        const pluginSchema = this.findPluginSchema(pluginName);

        if (!pluginSchema) {
            this.currentAddLog?.('warning', `Plugin '${pluginName}' in ${resourceType} '${parentName}' is unknown (no schema found).`);
            return;
        }

        try {
            const validate = this.ajv.compile(pluginSchema);
            const valid = validate(pluginConfig);

            if (valid) {
                this.currentAddLog?.('info', `Plugin '${pluginName}' in ${resourceType} '${parentName}' is valid.`);
            } else {
                validate.errors?.forEach(err => {
                    const errorPath = `${resourceType}/${parentName}/plugins/${pluginName}${err.instancePath}`;
                    this.currentAddLog?.('error', `${errorPath}: ${err.message}`);
                });
            }
        } catch (err: any) {
            this.currentAddLog?.('warning', `Failed to compile schema for plugin '${pluginName}': ${err.message}`);
        }
    }

    private findPluginSchema(pluginName: string): any | null {
        if (!this.schema || !this.schema.plugins) {
            return null;
        }
        // plugin schema's can be found next to main in the root of the schema json
        const pluginDef = this.schema.plugins[pluginName];
        const schema = pluginDef ? pluginDef.schema : null;

        if (schema) {
            // Seems to be only in plugin schema's
            // Issue: "minLength" must be integer, but some schemas might have it as string "1"
            this.fixSchemaTypes(schema);
        }

        return schema;
    }

    private fixSchemaTypes(schema: any) {
        if (!schema || typeof schema !== 'object') return;

        const numericKeys = ['minLength', 'maxLength', 'minItems', 'maxItems'];

        for (const key in schema) {
            if (numericKeys.includes(key) && typeof schema[key] === 'string') {
                const val = parseInt(schema[key], 10);
                if (!isNaN(val)) {
                    schema[key] = val;
                }
            }

            if (typeof schema[key] === 'object') {
                this.fixSchemaTypes(schema[key]);
            }
        }
    }

    private extractParentName(path: string): string {
        if (!path) return 'unknown path';

        const parts = path.split('/').filter(Boolean);
        const pluginsIndex = parts.indexOf('plugins');

        if (pluginsIndex < 2) return 'root';

        const resourceType = parts[pluginsIndex - 2];
        const indexStr = parts[pluginsIndex - 1];
        const index = parseInt(indexStr, 10);

        const resourceList = this.config?.[resourceType];
        if (Array.isArray(resourceList)) {
            const resource = resourceList[index];
            if (resource) {
                return resource.name || resource.id || `[index:${index}]`;
            }
        }

        return `${resourceType}[${indexStr}]`;
    }

    public setSchema(schema: any) {
        this.schema = schema;
    }

    public setConfig(config: ApisixConfig) {
        this.config = config;
    }

    public getConfig(): ApisixConfig | null {
        return this.config;
    }

    public getSchema(): any | null {
        return this.schema;
    }


    public validate(addLog: AddLog) {
        this.currentAddLog = addLog;
        try {
            if (!this.schema?.main) {
                addLog('warning', 'Schema catalog missing');
                return;
            }

            if (!this.config) return;

            const definitions = this.schema.main;
            this.injectPluginDetectionProperties(definitions);

            const properties = this.buildValidationProperties(definitions);

            const validate = this.ajv.compile({
                type: 'object',
                properties,
                definitions,
                additionalProperties: true
            });

            if (validate(this.config)) {
                addLog('success', 'Configuration is VALID');
            } else {
                this.handleValidationErrors(validate, addLog);
            }
        } catch (err: any) {
            addLog('error', `Validation failure: ${err.message}`);
        } finally {
            this.currentAddLog = null;
        }
    }

    private injectPluginDetectionProperties(definitions: any) {
        if (!definitions) return;
        Object.values(definitions).forEach((def: any) => {
            if (def?.properties?.plugins) {
                def.properties.plugins.detectPlugins = true;
            }
        });
    }

    private buildValidationProperties(definitions: any): any {
        const properties: any = {};
        if (!definitions || !this.config) return properties;

        const defNames = Object.keys(definitions);
        defNames.forEach((defName: string) => {
            // some names are in plural
            const candidateKeys = [defName, `${defName}s`];
            candidateKeys.forEach((key) => {
                const cfgVal = (this.config as any)[key];
                if (Array.isArray(cfgVal)) {
                    properties[key] = {
                        type: 'array',
                        items: { $ref: `#/definitions/${defName}` }
                    };
                }
            });
        });
        return properties;
    }

    private handleValidationErrors(validate: any, addLog: AddLog) {
        if (!validate.errors) return;
        validate.errors.forEach((err: any) => {
            addLog('error', `${this.formatAjvPath(err.instancePath)}: ${err.message}`);
        });
    }

    private formatAjvPath(path: string): string {
        if (!path || path === '' || path === '/') return 'root';
        return path.substring(1).replace(/\//g, '.');
    }
}