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

                // Iterate over each plugin found in the data object
                Object.keys(data).forEach(pluginName => {
                    const pluginConfig = data[pluginName];

                    const pluginSchema = this.findPluginSchema(pluginName);

                    if (!pluginSchema) {

                        if (this.currentAddLog) {
                            this.currentAddLog('warning', `Plugin '${pluginName}' in ${resourceType} '${parentName}' is unknown (no schema found).`);
                        }

                        return; // skip validation for unknown plugins otherwise it will just skip
                    }

                    // validate the plugin configuration against its schema, some plugins put minLength as "1" but should be fixed in findPluginSchema
                    try {
                        const validatePlugin = this.ajv.compile(pluginSchema);
                        const valid = validatePlugin(pluginConfig);

                        if (!valid) {
                            if (this.currentAddLog) {
                                validatePlugin.errors?.forEach(err => {
                                    const errorPath = `${resourceType}/${parentName}/plugins/${pluginName}${err.instancePath}`;
                                    this.currentAddLog('error', `${errorPath}: ${err.message}`);
                                });
                            }
                        } else {
                            if (this.currentAddLog) {
                                this.currentAddLog('info', `Plugin '${pluginName}' in ${resourceType} '${parentName}' is valid.`);
                            }
                        }
                    } catch (err: any) {
                        if (this.currentAddLog) {
                            this.currentAddLog('warning', `Failed to compile schema for plugin '${pluginName}': ${err.message}`);
                        }
                    }
                });

                return true;
            },
        })
    }

    private findPluginSchema(pluginName: string): any | null {
        if (!this.schema || !this.schema.plugins) {
            return null;
        }
        // plugin schema's can be found next to main in the root of the schema
        const pluginDef = this.schema.plugins[pluginName];
        const schema = pluginDef ? pluginDef.schema : null;

        if (schema) {
            // Fix known schema issues
            // Issue: "minLength" must be integer, but some schemas might have it as string "1"
            this.fixSchemaTypes(schema);
        }

        return schema;
    }

    private fixSchemaTypes(schema: any) {
        if (!schema || typeof schema !== 'object') return;

        for (const key in schema) {
            if (key === 'minLength' || key === 'maxLength' || key === 'minItems' || key === 'maxItems') {
                if (typeof schema[key] === 'string') {
                    const val = parseInt(schema[key], 10);
                    if (!isNaN(val)) {
                        schema[key] = val;
                    }
                }
            }

            // recursive for nested objects
            if (typeof schema[key] === 'object') {
                this.fixSchemaTypes(schema[key]);
            }
        }
    }

    private extractParentName(path: string): string {
        if (!path) return 'unknown path';

        // can't see parents but we can get them from the path
        const parts = path.split('/').filter(p => p);

        // Find where "plugins" is in the path
        const pluginsIndex = parts.indexOf('plugins');

        if (pluginsIndex >= 2) {
            const resourceType = parts[pluginsIndex - 2]; // e.g. "routes"
            const indexStr = parts[pluginsIndex - 1]; // not the id, only index in JSON
            const index = parseInt(indexStr, 10);

            // Try to look up the actual object in the config to get its name or ID
            // TODO: doesn't seem to work for consumers
            if (this.config && this.config[resourceType] && Array.isArray(this.config[resourceType])) {
                const resource = this.config[resourceType][index];
                if (resource) {
                    return resource.name || resource.id || `[index:${index}]`;
                }
            }

            return `${resourceType}[${indexStr}]`;
        }

        return 'root';
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

            if (!this.config) {
                return;
            }

            const definitions = this.schema.main;

            // Inject 'detectPlugins' keyword to trigger detection in resources that have a plugins field
            if (definitions) {
                Object.values(definitions).forEach((def: any) => {
                    if (def?.properties?.plugins) {
                        // We modify the schema object in memory to include our custom keyword
                        def.properties.plugins.detectPlugins = true;
                    }
                });
            }

            const properties: any = {};
            // Dynamically build properties based on schema definitions and the current config,
            // avoiding hard-coded resource lists.
            if (definitions && this.config) {
                const defNames = Object.keys(definitions);
                defNames.forEach((defName: string) => {
                    const candidateKeys = [defName, `${defName}s`];
                    candidateKeys.forEach((key) => {
                        const cfgVal = (this.config as any)[key];
                        if (Array.isArray(cfgVal)) {
                            properties[key] = { type: 'array', items: { $ref: `#/definitions/${defName}` } };
                        }
                    });
                });
            }

            const validate = this.ajv.compile({
                type: 'object',
                properties,
                definitions,
                additionalProperties: true
            });

            if (!validate(this.config)) {
                validate.errors?.forEach(err => {
                    addLog('error', `${this.formatAjvPath(err.instancePath)}: ${err.message}`);
                });
            } else {
                addLog('success', 'Configuration is VALID');
            }
        } catch (err: any) {
            addLog('error', `Validation failure: ${err.message}`);
        } finally {
            this.currentAddLog = null;
        }
    }

    private formatAjvPath(path: string): string {
        if (!path || path === '' || path === '/') return 'root';
        return path.substring(1).replace(/\//g, '.');
    }
}