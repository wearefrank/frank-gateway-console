import Ajv, {type ErrorObject, type ValidateFunction} from 'ajv';
import addFormats from 'ajv-formats';
import type {DataValidationCxt} from "ajv/lib/types";

export interface ValidationLog {
    id: number;
    timestamp: string;
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
}

// Type aliases for better readability
export type JsonSchema = Record<string, unknown>;
export type PluginConfiguration = Record<string, unknown>;
export type ResourceConfiguration = Record<string, unknown>;

export interface ApisixConfig {
    routes?: ResourceConfiguration[];
    [key: string]: unknown; // fallback for unknown keys
}

interface PluginDef {
    schema?: JsonSchema;
    consumer_schema?: JsonSchema;
    [key: string]: unknown; // fallback for unknown keys
}

export interface SchemaCatalog {
    plugins?: Record<string, PluginDef>;
    stream_plugins?: Record<string, PluginDef>;
    main?: JsonSchema;
    [key: string]: unknown;
}

interface PluginValidator {
    (
        schema: JsonSchema,
        data: unknown,
        parentSchema?: unknown,
        dataCtx?: DataValidationCxt // Note the optional '?'
    ): boolean;
    errors?: Partial<ErrorObject>[];
}

export type AddLog = (type: ValidationLog['type'], message: string) => void;

export class SchemaValidator {
    private ajv: Ajv;
    private schema: SchemaCatalog | null = null;
    private config: ApisixConfig | null = null;
    private currentAddLog: AddLog | null = null;

    // cache of plugin schemas, keyed by plugin name
    private pluginSchemasCache: Map<string, ValidateFunction> = new Map();

    constructor() {
        this.ajv = new Ajv({
            allErrors: true,
            strict: 'log',
        });
        addFormats(this.ajv);

        this.addPluginDetection();
    }

    public addPluginDetection() {

        const validatePlugins: PluginValidator = (
            _schema: JsonSchema,
            data: unknown,
            _parentSchema: unknown,
            dataCtx?: DataValidationCxt,
        ) => {

            const path = dataCtx?.instancePath || '';
            const parentName = this.extractParentName(path);
            const resourceType = path.split('/')[1] || 'unknown resource';

            const pluginsData = (data || {}) as Record<string, PluginConfiguration>;

            const valid = Object.keys(pluginsData).every(pluginName => {
                return this.validatePluginConfig(pluginName, pluginsData[pluginName], resourceType, parentName);
            });

            if (!valid) {
                validatePlugins.errors = [{
                    keyword: 'detectPlugins',
                    message: 'One or more plugins have invalid configurations',
                    params: {'location': 'plugins'},
                    instancePath: path
                }];
            }

            if (valid && validatePlugins.errors) {
                validatePlugins.errors = undefined;
            }

            return valid;
        };

        this.ajv.addKeyword({
            keyword: 'detectPlugins',
            type: 'object',
            validate: validatePlugins,
            errors: true
        })
    }

    private validatePluginConfig(pluginName: string, pluginConfig: unknown, resourceType: string, parentName: string): boolean {
        const pluginSchema = this.findPluginSchema(pluginName, resourceType);

        if (!pluginSchema) {
            this.currentAddLog?.('warning', `Plugin '${pluginName}' in ${resourceType} '${parentName}' is unknown (no schema found).`);
            return true;
        }

        const cacheKey = `${resourceType}::${pluginName}`;
        let validate = this.pluginSchemasCache.get(cacheKey);

        if (!validate) {
            try {
                validate = this.ajv.compile(pluginSchema);
                this.pluginSchemasCache.set(cacheKey, validate);
            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                this.currentAddLog?.('warning', `Failed to compile schema for plugin '${pluginName}': ${errorMessage}`);
                return false;
            }
        }

        const valid = validate(pluginConfig);

        if (valid) {
            this.currentAddLog?.('info', `Plugin '${pluginName}' in ${resourceType} '${parentName}' is valid.`);
            return true;
        }

        // Errors in the validation have to be inserted here and this can only return true or false
        if (validate.errors) {
            validate.errors.map(err => {
                const path = err.instancePath || '';
                const message = err.message || 'Unknown error';
                this.currentAddLog?.('error', `Plugin '${pluginName}' in ${resourceType} '${parentName}': ${path} - ${message}`);
            });
        }

        this.currentAddLog?.('error', `Plugin '${pluginName}' in ${resourceType} '${parentName}' is invalid.`);
        return false;
    }

    private findPluginSchema(pluginName: string, resourceType: string): JsonSchema | null {
        if (!this.schema) return null;


        const plugins = this.schema.plugins;
        const streamPlugins = this.schema.stream_plugins;

        const pluginDef = plugins?.[pluginName] || streamPlugins?.[pluginName];

        if (!pluginDef) {
            return null;
        }

        let schema: JsonSchema | undefined = undefined;

        const isConsumerContext = resourceType === 'consumers' || resourceType === 'consumer_groups';
        if (isConsumerContext && pluginDef.consumer_schema) {
            schema = pluginDef.consumer_schema;
        } else {
            schema = pluginDef.schema;
        }

        if (schema) {
            this.fixSchemaTypes(schema);
            return schema;
        }

        return null;
    }


    private fixSchemaTypes(schema: JsonSchema) {
        if (!this.isJsonSchema(schema)) return;

        const numericKeys = ['minLength'];
        // const numericKeys = [];

        for (const key in schema) {
            if (numericKeys.includes(key) && typeof schema[key] === 'string') {
                const val = parseInt(schema[key] as string, 10);
                if (!isNaN(val)) {
                    schema[key] = val;
                }
            }

            if (this.isJsonSchema(schema[key])) {
                this.fixSchemaTypes(schema[key] as JsonSchema);
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

                if (resource.name) {
                    return `name: ${resource.name}`;
                } else if (resource.id) {
                    return `id: ${resource.id}`;
                }

                return `[${index}]`;
            }
        }

        return `${resourceType}[${indexStr}]`;
    }

    public setSchema(schema: SchemaCatalog | null) {
        this.schema = schema;
    }

    public setConfig(config: ApisixConfig) {
        this.config = config;
    }

    public getConfig(): ApisixConfig | null {
        return this.config;
    }

    public getSchema(): SchemaCatalog | null {
        return this.schema;
    }


    public validate(addLog: AddLog) {
        this.currentAddLog = addLog;
        try {
            if (!this.config) return;

            if (!this.schema?.main) {
                addLog('warning', 'Schema catalog missing');
                return;
            }

            const definitions = this.schema.main;

            if (!definitions || !this.isJsonSchema(definitions)) {
                addLog('warning', 'Schema definitions missing');
                return;
            }

            this.injectPluginDetectionProperties(definitions);

            // we get the propper plugin schema an give it to the validator
            const properties = this.buildValidationProperties(definitions);

            const validate = this.ajv.compile({
                type: 'object',
                properties,
                definitions,
                additionalProperties: false,
            });

            if (validate(this.config)) {
                addLog('success', 'Configuration is VALID');
            } else {
                this.handleValidationErrors(validate, addLog);

            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            addLog('error', `Validation failure: ${errorMessage}`);
        } finally {
            this.currentAddLog = null;
        }
    }

    private injectPluginDetectionProperties(definitions: JsonSchema | null) {
        if (!this.isJsonSchema(definitions)) return;

        interface DefinitionShape {
            properties?: {
                plugins?: {
                    detectPlugins?: boolean;
                    [key: string]: unknown;
                };
                [key: string]: unknown;
            };
            [key: string]: unknown;
        }


        Object.values(definitions).forEach((def: unknown) => {
            if (this.isJsonSchema(def)) {
                const typedDef = def as DefinitionShape;

                if (typedDef.properties?.plugins) {
                    typedDef.properties.plugins.detectPlugins = true;
                }
            }
        });
    }

    private buildValidationProperties(definitions: unknown): JsonSchema {
        const properties: JsonSchema = {};

        const config = this.config;

        if (!this.isJsonSchema(definitions) || !config) {
            return properties;
        }

        const defNames = Object.keys(definitions);

        defNames.forEach((defName: string) => {
            // some names are in plural
            const candidateKeys = [defName, `${defName}s`];

            candidateKeys.forEach((key) => {
                const cfgVal = config[key];
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

    private handleValidationErrors(validate: ValidateFunction, addLog: AddLog) {
        if (!validate.errors) return;
        validate.errors.forEach((err: ErrorObject) => {

            if (err.keyword === 'additionalProperties') {
                addLog('warning', `${this.formatAjvPathName(err)}: ${err.message}`);
            }

            addLog('error', `${this.formatAjvPathName(err)}: ${err.message}`);
        });
    }

    private formatAjvPathName(ErrorObj: ErrorObject): string {
        return ErrorObj.instancePath;
    }

    private isJsonSchema(def: unknown): def is JsonSchema {
        return (
            def !== null &&
            typeof def === 'object' &&
            !Array.isArray(def)
        );
    }
}