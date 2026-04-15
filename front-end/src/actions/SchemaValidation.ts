import Ajv, {type ErrorObject, type ValidateFunction} from 'ajv';
import addFormats from 'ajv-formats';
import type {DataValidationCxt} from "ajv/lib/types";
import { getResourceType } from './ValidationLogger';
import type {AjvErrorCollection} from "./ErrorResolver.ts";

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
    [key: string]: unknown; // fallback for unknown keys
}

export interface RawConfigValidation {
    valid: boolean;
    errorCollections: AjvErrorCollection[];
    warningErrors: ErrorObject[];
    warnings: Array<{ message: string; path: string }>;
}

interface PluginValidator {
    (
        schema: JsonSchema,
        data: unknown,
        parentSchema?: unknown,
        dataCtx?: DataValidationCxt
    ): boolean;
    errors?: Partial<ErrorObject>[];
}

export class SchemaValidator {
    private ajv: Ajv;
    private schema: SchemaCatalog | null = null;
    private config: ApisixConfig | null = null;
    private pluginErrorBatch: AjvErrorCollection[] = [];
    private pluginWarningBatch: Array<{ message: string; path: string }> = [];
    private fillInDefaults: boolean = false;

    // cache of plugin schemas, keyed by plugin name
    private pluginSchemasCache: Map<string, ValidateFunction> = new Map();

    constructor() {
        this.ajv = new Ajv({
            allErrors: true,
            strict: false,
            verbose: true,
            // useDefaults: 'empty',
        });
        addFormats(this.ajv);

        this.addPluginDetection();
    }

    public validateConfig(): RawConfigValidation {
        this.pluginErrorBatch = [];
        this.pluginWarningBatch = [];

        if (!this.config) {
            return { valid: false, errorCollections: [], warningErrors: [], warnings: [] };
        }

        if (!this.schema?.main) {
            return { valid: false, errorCollections: [], warningErrors: [], warnings: [] };
        }

        const definitions = this.schema.main;

        if (!definitions || !this.isJsonSchema(definitions)) {
            return { valid: false, errorCollections: [], warningErrors: [], warnings: [] };
        }

        this.injectPluginDetectionProperties(definitions);

        // we get the proper plugin schema and give it to the validator
        const properties = this.buildValidationProperties(definitions);

        const validate = this.ajv.compile({
            type: 'object',
            properties,
            definitions,
            additionalProperties: false,
        });

        const payloadToValidate = structuredClone(this.config);

        if (validate(payloadToValidate)) {
            return { valid: true, errorCollections: [...this.pluginErrorBatch], warningErrors: [], warnings: [...this.pluginWarningBatch] };
        }

        const warningErrors: ErrorObject[] = [];
        const schemaErrors: ErrorObject[] = [];

        for (const err of (validate.errors ?? [])) {
            if (err.keyword === 'additionalProperties') {
                warningErrors.push(err);
            } else {
                schemaErrors.push(err);
            }
        }

        const errorCollections: AjvErrorCollection[] = [];
        if (schemaErrors.length > 0) {
            errorCollections.push({ type: 'root', parent: 'config', sourceErrors: schemaErrors });
        }
        errorCollections.push(...this.pluginErrorBatch);

        return { valid: false, errorCollections, warningErrors, warnings: [...this.pluginWarningBatch] };
    }

    public addPluginDetection() {

        const validatePlugins: PluginValidator = (
            _schema: JsonSchema,
            data: unknown,
            _parentSchema: unknown,
            dataCtx?: DataValidationCxt,
        ) => {
            const path = dataCtx?.instancePath || '';
            const pluginsData = (data || {}) as Record<string, PluginConfiguration>;

            let allPluginsValid = true;
            const customAjvErrors: Partial<ErrorObject>[] = [];

            // Iterate over ALL plugins without short-circuiting
            Object.keys(pluginsData).forEach(pluginName => {
                const pluginPath = `${path}/${pluginName}`;

                // validatePluginConfig handles the granular logging to your UI Logger
                const pluginIsValid = this.validatePluginConfig(
                    pluginName,
                    pluginsData[pluginName],
                    pluginPath
                );

                if (!pluginIsValid) {
                    allPluginsValid = false;

                    // Construct a precise AJV error for this specific plugin
                    customAjvErrors.push({
                        keyword: 'detectPlugins',
                        message: `Configuration for plugin '${pluginName}' is invalid.`,
                        params: { failedPlugin: pluginName },
                        // Point the instancePath directly to the failing plugin in the JSON tree
                        instancePath: pluginPath
                    });
                }
            });

            // Fulfill the AJV custom keyword contract
            if (!allPluginsValid) {
                validatePlugins.errors = customAjvErrors;
            } else {
                validatePlugins.errors = undefined; // Must be explicitly cleared on success
            }

            return allPluginsValid;
        };

        this.ajv.addKeyword({
            keyword: 'detectPlugins',
            type: 'object',
            validate: validatePlugins,
            errors: true
        })
    }

    public validateCategory(categoryName: string, data: Record<string, unknown>): AjvErrorCollection[] {
        this.pluginErrorBatch = [];
        this.pluginWarningBatch = [];

        if (!this.schema?.main) return [];

        const definitions = this.schema.main;
        const categorySchema = definitions[categoryName] as JsonSchema | undefined;

        if (!categorySchema || !this.isJsonSchema(categorySchema)) return [];

        this.injectPluginDetectionProperties({ [categoryName]: categorySchema });

        try {
            const validate = this.ajv.compile({
                ...categorySchema,
                definitions,
            });

            const payload = structuredClone(data);
            const collections: AjvErrorCollection[] = [];
            if (!validate(payload) && validate.errors) {
                collections.push({ type: categoryName, parent: categoryName, sourceErrors: [...validate.errors] });
            }
            return [...collections, ...this.pluginErrorBatch];
        } catch {
            return [];
        }
    }

    private validatePluginConfig(pluginName: string, pluginConfig: unknown, pluginPath: string): boolean {
        const resourceType = getResourceType(pluginPath) || 'unknown';
        const pluginSchema = this.findPluginSchema(pluginName, resourceType);

        if (!pluginSchema) {
            this.pluginWarningBatch.push({ message: 'Plugin is unknown (no schema found).', path: pluginPath });
            return true;
        }

        this.applySchemaDefaults(pluginSchema, pluginConfig);

        const cacheKey = `${resourceType}::${pluginName}`;
        let validate = this.pluginSchemasCache.get(cacheKey);

        if (!validate) {
            try {
                validate = this.ajv.compile(pluginSchema);
                this.pluginSchemasCache.set(cacheKey, validate);
            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                this.pluginWarningBatch.push({ message: `Failed to compile schema: ${errorMessage}`, path: pluginPath });
                return false;
            }
        }

        const valid = validate(pluginConfig);

        if (valid) {
            return true;
        }

        if (validate.errors) {
            this.pluginErrorBatch.push({
                type: pluginPath,
                parent: pluginName,
                sourceErrors: [...validate.errors],
            });
        }

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

    private applySchemaDefaults(schema: JsonSchema, config: unknown) {
        // a solution to https://github.com/ajv-validator/ajv/issues/127
        // https://ajv.js.org/guide/modifying-data.html#assigning-defaults
        if (!this.fillInDefaults) {
            return;
        }

        if (!this.isJsonSchema(schema) || typeof config !== 'object' || config === null) return;

        const configObj = config as Record<string, unknown>;

        if (this.isJsonSchema(schema.properties)) {
            for (const [key, propDef] of Object.entries(schema.properties)) {
                if (this.isJsonSchema(propDef)) {
                    // Inject default if value is completely missing or an empty string
                    if (propDef.default !== undefined) {
                        if (configObj[key] === undefined || configObj[key] === null || configObj[key] === '') {
                            configObj[key] = propDef.default;
                        }
                    }

                    // Recurse into nested configuration objects
                    if (propDef.type === 'object' && configObj[key]) {
                        this.applySchemaDefaults(propDef as JsonSchema, configObj[key]);
                    }
                }
            }
        }
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

    public setFillInDefaults(fillInDefaults: boolean) {
        this.fillInDefaults = fillInDefaults;
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

    private isJsonSchema(def: unknown): def is JsonSchema {
        return (
            def !== null &&
            typeof def === 'object' &&
            !Array.isArray(def)
        );
    }
}