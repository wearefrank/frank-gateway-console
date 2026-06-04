import type {JsonSchema, SchemaCatalog} from "./SchemaValidation.ts";

type SchemaNode = Record<string, unknown>;

interface FieldBase {
    name: string;
    required: boolean;
    description?: string;
    defaultValue?: unknown;
}

// each field type carries only the extra data that its renderer actually needs —
// e.g. a select needs options, a number needs min/max, a map doesn't need either
export interface TextField extends FieldBase { type: 'text'; pattern?: string }
export interface NumberField extends FieldBase { type: 'number'; minimum?: number; maximum?: number }
export interface CheckboxField extends FieldBase { type: 'checkbox' }
export interface SelectOption { label: string; value: unknown }
export interface SelectField extends FieldBase { type: 'select'; options: SelectOption[] }
export interface ArrayField extends FieldBase { type: 'array'; schema: JsonSchema }
export interface ObjectArrayField extends FieldBase { type: 'object-array'; itemFields: SchemaField[] }
export interface ObjectField extends FieldBase { type: 'object'; fields: SchemaField[] }
export interface MapField extends FieldBase { type: 'map'; valueSchema?: JsonSchema }
export interface PluginField extends FieldBase { type: 'plugin'; schema: JsonSchema }
export interface OneOfGroupVariant { label: string; fields: SchemaField[]; fieldNames: string[] }
export interface OneOfGroupField extends FieldBase { type: 'oneof-group'; variants: OneOfGroupVariant[]; inline: boolean; keyword: 'oneOf' | 'anyOf' }

export type SchemaField = TextField | NumberField | CheckboxField | SelectField | ArrayField | ObjectArrayField | ObjectField | MapField | PluginField | OneOfGroupField;

export interface OneOfGroup {
    label: string;
    exclusiveFields: string[];
}

export interface OneOfDimension {
    keyword: 'oneOf' | 'anyOf';
    groups: OneOfGroup[];
}

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
        const properties = schema.properties as Record<string, SchemaNode>;
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

        const properties = categorySchema.properties as Record<string, SchemaNode>;

        // get required fields
        const requiredFields = new Set<string>(
            Array.isArray(categorySchema.required) ? categorySchema.required : []
        );

        // onlyKeys lets callers request a subset (e.g. for the settings priority list preview)
        // we filter instead of just mapping so missing keys don't produce undefined entries
        const keysToMap = onlyKeys
            ? onlyKeys.filter(key => key in properties)
            : Object.keys(properties);

        const allFields = keysToMap.map(name =>
            this.buildField(name, properties[name], requiredFields.has(name))
        );

        // When onlyKeys is given (e.g. settings preview) skip group injection
        if (onlyKeys) return allFields;

        // Detect oneOf/anyOf groups and replace each set of exclusive fields with a group block
        const dimensions = this.getOneOfGroups(category);
        if (!dimensions) return allFields;

        const allExclusive = new Set(dimensions.flatMap(d => d.flatMap(g => g.exclusiveFields)));

        // Build one OneOfGroupField per independent dimension
        const groupFields = new Map<string, OneOfGroupField>();
        for (const dimension of dimensions) {
            const variants: OneOfGroupVariant[] = dimension.map(g => ({
                label: g.label,
                fieldNames: g.exclusiveFields,
                fields: g.exclusiveFields
                    .filter(name => name in properties)
                    .map(name => this.buildField(name, properties[name] as SchemaNode, requiredFields.has(name))),
            }));
            const groupName = dimension.find(g => g.exclusiveFields.length > 0)?.exclusiveFields[0] ?? '__oneof_group';
            groupFields.set(groupName, { name: groupName, type: 'oneof-group', inline: false, required: false, variants });
        }

        // Replace each exclusive field with its group block (injected once, at the position of its first field)
        const injected = new Set<string>();
        const result: SchemaField[] = [];
        for (const field of allFields) {
            if (!allExclusive.has(field.name)) {
                result.push(field);
                continue;
            }
            for (const [groupName, groupField] of groupFields) {
                if (!injected.has(groupName) && groupField.variants.some(v => v.fieldNames.includes(field.name))) {
                    result.push(groupField);
                    injected.add(groupName);
                    break;
                }
            }
        }
        return result;
    }

    private buildField(name: string, schema: SchemaNode, required: boolean): SchemaField {
        const base: FieldBase = {
            name,
            required,
            description: typeof schema.description === 'string' ? schema.description : undefined,
            defaultValue: schema.default,
        };

        // if enum is set with available opts
        if (Array.isArray(schema.enum)) {
            return this.buildSelectField(base, schema.enum);
        }

        if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
            const variants = (schema.anyOf ?? schema.oneOf) as SchemaNode[];
            const meaningful = variants.filter(v => v && v.type !== 'null' && Object.keys(v).length > 0);
            if (meaningful.length <= 1) {
                const chosen = meaningful[0] ?? variants[0];
                return this.buildField(name, { ...schema, ...chosen, anyOf: undefined, oneOf: undefined }, required);
            }
            return this.buildInlineAnyOf(base, meaningful);
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

    private buildSelectField(base: FieldBase, options: unknown[]): SelectField {
        return { ...base, type: 'select', options: options.map(v => ({ label: String(v), value: v })) };
    }

    private buildCheckboxField(base: FieldBase): CheckboxField {
        return { ...base, type: 'checkbox' };
    }

    private buildNumberField(base: FieldBase, schema: SchemaNode): NumberField {
        return {
            ...base,
            type: 'number',
            minimum: typeof schema.minimum === 'number' ? schema.minimum : undefined,
            maximum: typeof schema.maximum === 'number' ? schema.maximum : undefined,
        };
    }

    private buildTextField(base: FieldBase, schema: SchemaNode): TextField {
        return {
            ...base,
            type: 'text',
            pattern: typeof schema.pattern === 'string' ? schema.pattern : undefined,
        };
    }

    private buildObjectField(base: FieldBase, schema: SchemaNode): ObjectField | MapField | PluginField {

        // plugins is a special case the renderer needs the full catalog to look up each plugin's
        if (base.name === 'plugins') {
            return {
                ...base,
                type: 'plugin',
                schema: this.schema,
            };
        }

        // patternProperties or additionalProperties (as a schema, not false) → free-form key→value map
        if (schema.patternProperties || (schema.additionalProperties && schema.additionalProperties !== false)) {
            const patternProps = schema.patternProperties as SchemaNode | undefined;
            const valueSchema = patternProps
                ? Object.values(patternProps)[0] as JsonSchema
                : schema.additionalProperties as JsonSchema;
            return { ...base, type: 'map', valueSchema };
        }

        // structured object with known properties → recurse
        if (schema.properties) {
            const properties = schema.properties as Record<string, SchemaNode>;
            const requiredFields = new Set<string>(
                Array.isArray(schema.required) ? schema.required : []
            );
            const fields = Object.keys(properties).map(name =>
                this.buildField(name, properties[name], requiredFields.has(name))
            );
            return { ...base, type: 'object', fields };
        }

        // no properties defined, we still return an object type so the renderer can show something
        return { ...base, type: 'object', fields: [] };
    }

    public getOneOfGroups(category: string): OneOfGroup[][] | null {
        const schema = this.getCategorySchema(category);
        if (!schema) return null;

        const all: OneOfGroup[][] = [];

        // Check top-level oneOf/anyOf
        const topGroups = this.extractGroupsFromNode(schema as SchemaNode);
        if (topGroups) all.push(topGroups);

        // APISIX schemas wrap multiple independent constraints in allOf — collect all of them
        if (Array.isArray(schema.allOf)) {
            for (const node of schema.allOf as SchemaNode[]) {
                const groups = this.extractGroupsFromNode(node);
                if (groups) all.push(groups);
            }
        }

        return all.length > 0 ? all : null;
    }

    private extractGroupsFromNode(node: SchemaNode): OneOfGroup[] | null {
        const variants = (node.oneOf ?? node.anyOf) as SchemaNode[] | undefined;
        if (!Array.isArray(variants) || variants.length <= 1) return null;

        const variantRequired: string[][] = variants.map(v =>
            Array.isArray(v.required) ? (v.required as string[]) : []
        );

        const groups: OneOfGroup[] = variantRequired.map((required, i) => {
            const exclusive = required.filter(f =>
                variantRequired.every((other, j) => j === i || !other.includes(f))
            );
            return {
                label: exclusive.join(' + ') || 'none',
                exclusiveFields: exclusive,
            };
        });

        const hasExclusions = groups.some(g => g.exclusiveFields.length > 0);
        return hasExclusions ? groups : null;
    }

    private buildInlineAnyOf(base: FieldBase, meaningful: SchemaNode[]): SchemaField {
        const builtFields = meaningful.map(v =>
            this.buildField(base.name, { ...v, anyOf: undefined, oneOf: undefined }, base.required)
        );

        // Only surface a toggle when at least one variant is structurally different
        // (object, map, array). Pure type unions like string|integer collapse to the first.
        const structuralTypes = new Set(['object', 'object-array', 'map', 'array']);
        const fieldTypes = new Set(builtFields.map(f => f.type));
        const hasStructuralVariant = builtFields.some(f => structuralTypes.has(f.type));
        if (!hasStructuralVariant || fieldTypes.size <= 1) {
            return builtFields[0];
        }

        const variants: OneOfGroupVariant[] = meaningful.map((v, i) => ({
            label: this.getVariantLabel(v, i),
            fieldNames: [base.name],
            fields: [builtFields[i]],
        }));
        return { ...base, type: 'oneof-group', inline: true, variants };
    }

    private getVariantLabel(v: SchemaNode, index: number): string {
        if (typeof v.title === 'string') return v.title;
        if (typeof v.type === 'string') return v.type;
        if (v.properties) return 'object';
        return `Option ${index + 1}`;
    }

    private pickBestVariant(variants: SchemaNode[]): SchemaNode {
        const arrayVariant = variants.find(v => v.type === 'array');
        if (arrayVariant) return arrayVariant;

        const objectWithProps = variants.find(v => v.type === 'object' && v.properties);
        if (objectWithProps) return objectWithProps;
        return variants[0];
    }

    private buildArrayField(base: FieldBase, schema: SchemaNode): ArrayField | ObjectArrayField {
        const items = schema.items as SchemaNode | undefined;

        if (items?.type === 'object') {
            return { ...base, type: 'object-array', itemFields: this.getFieldsFromSchema(items as JsonSchema) };
        }
        return { ...base, type: 'array', schema };
    }
}
