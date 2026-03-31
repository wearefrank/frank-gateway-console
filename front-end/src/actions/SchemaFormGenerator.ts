import type {JsonSchema, SchemaCatalog} from "./SchemaValidation.ts";


interface FieldBase {
    name: string;
    required: boolean;
    description?: string;
    defaultValue?: unknown;
}

export interface TextField extends FieldBase { type: 'text'; pattern?: string }
export interface NumberField extends FieldBase { type: 'number'; minimum?: number; maximum?: number }
export interface CheckboxField extends FieldBase { type: 'checkbox' }
export interface SelectField extends FieldBase { type: 'select'; options: string[] }
export interface ArrayField extends FieldBase { type: 'array'; schema: JsonSchema }
export interface ObjectField extends FieldBase { type: 'object'; fields: SchemaField[] }
export interface MapField extends FieldBase { type: 'map'; valueSchema?: JsonSchema }
export interface PluginField extends FieldBase { type: 'plugin'; schema: JsonSchema }

// combination of above-defined interfaces
export type SchemaField = TextField | NumberField | CheckboxField | SelectField | ArrayField | ObjectField | MapField | PluginField;

// --- Generator ---

export class SchemaFormGenerator {
    private readonly schema: SchemaCatalog;

    constructor(catalog: SchemaCatalog) {
        this.schema = catalog;
    }


    public getCategorySchema(category: string): JsonSchema | null {
        if (!this.schema.main || !(category in this.schema.main)) return null;
        return this.schema.main[category] as JsonSchema;
    }

    public getFieldsFromSchema(schema: JsonSchema): SchemaField[] {
        if (!schema.properties) return [];
        const properties = schema.properties as Record<string, Record<string, any>>;
        const requiredFields = new Set<string>(
            Array.isArray(schema.required) ? schema.required : []
        );
        return Object.keys(properties).map(name =>
            this.buildField(name, properties[name], requiredFields.has(name))
        );
    }

    public getFields(category: string, onlyKeys?: string[]): SchemaField[] {
        const categorySchema = this.getCategorySchema(category);
        if (!categorySchema?.properties) {
            return [];
        }

        const properties = categorySchema.properties as Record<string, Record<string, any>>;

        // get required fields
        const requiredFields = new Set<string>(
            Array.isArray(categorySchema.required) ? categorySchema.required : []
        );

        const keysToMap = onlyKeys
            ? onlyKeys.filter(key => key in properties)
            : Object.keys(properties);

        return keysToMap.map(name =>
            this.buildField(name, properties[name], requiredFields.has(name))
        );
    }

    private buildField(name: string, schema: Record<string, any>, required: boolean): SchemaField {
        const base: FieldBase = {
            name,
            required,
            description: schema.description,
            defaultValue: schema.default,
        };

        // if enum is set with available opts
        if (Array.isArray(schema.enum)) {
            return this.buildSelectField(base, schema.enum);
        }

        switch (schema.type) {
            case 'array':
                return this.buildArrayField(base, schema);
            case 'boolean':
                return this.buildCheckboxField(base);
            case 'integer':
            case 'number':
                return this.buildNumberField(base, schema);
            case 'object':
                return this.buildObjectField(base, schema);
            default:
                return this.buildTextField(base, schema);
        }
    }

    // --- return types ---

    private buildSelectField(base: FieldBase, options: unknown[]): SelectField {
        return { ...base, type: 'select', options: options.map(String) };
    }

    private buildCheckboxField(base: FieldBase): CheckboxField {
        return { ...base, type: 'checkbox' };
    }

    private buildNumberField(base: FieldBase, schema: Record<string, any>): NumberField {
        return {
            ...base,
            type: 'number',
            minimum: schema.minimum,
            maximum: schema.maximum
        };
    }

    private buildTextField(base: FieldBase, schema: Record<string, any>): TextField {
        return {
            ...base,
            type: 'text',
            pattern: schema.pattern
        };
    }

    private buildObjectField(base: FieldBase, schema: Record<string, any>): ObjectField | MapField | PluginField {

        if (base.name === 'plugins') {
            return {
                ...base,
                type: 'plugin',
                schema: this.schema,
            };
        }

        // patternProperties or additionalProperties (as a schema, not false) → free-form key→value map
        if (schema.patternProperties || (schema.additionalProperties && schema.additionalProperties !== false)) {
            const valueSchema = schema.patternProperties
                ? Object.values(schema.patternProperties)[0] as JsonSchema
                : schema.additionalProperties;
            return { ...base, type: 'map', valueSchema };
        }

        // structured object with known properties → recurse
        if (schema.properties) {
            const properties = schema.properties as Record<string, Record<string, any>>;
            const requiredFields = new Set<string>(
                Array.isArray(schema.required) ? schema.required : []
            );
            const fields = Object.keys(properties).map(name =>
                this.buildField(name, properties[name], requiredFields.has(name))
            );
            return { ...base, type: 'object', fields };
        }

        return { ...base, type: 'object', fields: [] };
    }

    private buildArrayField(base: FieldBase, schema: Record<string, unknown>): ArrayField {
        return { ...base, type: 'array', schema: schema };
    }
}
