import type {JsonSchema, SchemaCatalog} from "./SchemaValidation.ts";

// --- Discriminated union for field types ---

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
export interface ArrayField extends FieldBase { type: 'array' }

export type SchemaField = TextField | NumberField | CheckboxField | SelectField | ArrayField;

// --- Generator ---

export class SchemaFormGenerator {
    private readonly catalog: SchemaCatalog;

    constructor(catalog: SchemaCatalog) {
        this.catalog = catalog;
    }


    public getCategorySchema(category: string): JsonSchema | null {
        if (!this.catalog.main || !(category in this.catalog.main)) return null;
        return this.catalog.main[category] as JsonSchema;
    }

    public getFields(category: string, onlyKeys?: string[]): SchemaField[] {
        const categorySchema = this.getCategorySchema(category);
        console.log(categorySchema);
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
        console.log(name,schema.type, schema);

        const base: FieldBase = {
            name,
            required,
            description: schema.description,
            defaultValue: schema.default,
        };

        if (Array.isArray(schema.enum)) {
            return this.buildSelectField(base, schema.enum);
        }

        switch (schema.type) {
            case 'boolean':
                return this.buildCheckboxField(base);
            case 'integer':
            case 'number':
                return this.buildNumberField(base, schema);
            default:
                return this.buildTextField(base, schema);
        }
    }

    // --- Strict Return Types Below ---

    private buildSelectField(base: FieldBase, options: any[]): SelectField {
        return { ...base, type: 'select', options: options.map(String) };
    }

    private buildCheckboxField(base: FieldBase): CheckboxField {
        return { ...base, type: 'checkbox' };
    }

    private buildNumberField(base: FieldBase, schema: Record<string, any>): NumberField {
        return {
            ...base,
            type: 'number',
            // Only NumberField allows these properties
            minimum: schema.minimum,
            maximum: schema.maximum
        };
    }

    private buildTextField(base: FieldBase, schema: Record<string, any>): TextField {
        return {
            ...base,
            type: 'text',
            // Only TextField allows this property
            pattern: schema.pattern
        };
    }
}
