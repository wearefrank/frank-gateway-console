import { describe, it, expect } from 'vitest';
import { SchemaFormGenerator, type SelectField, type NumberField, type TextField, type CheckboxField, type ObjectField, type MapField, type PluginField, type ArrayField, type ObjectArrayField, type OneOfGroupField } from '../actions/SchemaFormGenerator';
import type { SchemaCatalog } from '../actions/SchemaValidation';

// ---------------------------------------------------------------------------
// getCategorySchema
// ---------------------------------------------------------------------------

describe('getCategorySchema', () => {
    it('returns null when the catalog has no main schema', () => {
        const gen = new SchemaFormGenerator({});
        expect(gen.getCategorySchema('route')).toBeNull();
    });

    it('returns null for an unknown category', () => {
        const gen = new SchemaFormGenerator({ main: { route: {} } });
        expect(gen.getCategorySchema('upstream')).toBeNull();
    });

    it('returns the schema for a known category', () => {
        const routeSchema = { type: 'object', properties: {} };
        const gen = new SchemaFormGenerator({ main: { route: routeSchema } });
        expect(gen.getCategorySchema('route')).toBe(routeSchema);
    });
});

// ---------------------------------------------------------------------------
// getFieldsFromSchema / getFields - basic field type mapping
// ---------------------------------------------------------------------------

describe('getFieldsFromSchema - field type mapping', () => {
    const gen = new SchemaFormGenerator({});

    it('returns an empty array when the schema has no properties', () => {
        expect(gen.getFieldsFromSchema({})).toHaveLength(0);
    });

    it('maps a string field to a text field', () => {
        const fields = gen.getFieldsFromSchema({
            properties: { name: { type: 'string', pattern: '^[a-z]+$' } },
        });
        expect(fields).toHaveLength(1);
        const field = fields[0] as TextField;
        expect(field.type).toBe('text');
        expect(field.name).toBe('name');
        expect(field.pattern).toBe('^[a-z]+$');
    });

    it('marks fields listed in "required" as required', () => {
        const fields = gen.getFieldsFromSchema({
            properties: { name: { type: 'string' } },
            required: ['name'],
        });
        expect(fields[0].required).toBe(true);
    });

    it('marks fields not listed in "required" as optional', () => {
        const fields = gen.getFieldsFromSchema({
            properties: { name: { type: 'string' } },
        });
        expect(fields[0].required).toBe(false);
    });

    it('maps a boolean field to a checkbox field', () => {
        const fields = gen.getFieldsFromSchema({ properties: { enabled: { type: 'boolean' } } });
        expect((fields[0] as CheckboxField).type).toBe('checkbox');
    });

    it('maps a number field with minimum/maximum', () => {
        const fields = gen.getFieldsFromSchema({
            properties: { timeout: { type: 'integer', minimum: 1, maximum: 100 } },
        });
        const field = fields[0] as NumberField;
        expect(field.type).toBe('number');
        expect(field.minimum).toBe(1);
        expect(field.maximum).toBe(100);
    });

    it('maps an enum field to a select field regardless of its declared type', () => {
        const fields = gen.getFieldsFromSchema({
            properties: { scheme: { type: 'string', enum: ['http', 'https'] } },
        });
        const field = fields[0] as SelectField;
        expect(field.type).toBe('select');
        expect(field.options).toEqual([
            { label: 'http', value: 'http' },
            { label: 'https', value: 'https' },
        ]);
    });

    it('carries description and defaultValue through', () => {
        const fields = gen.getFieldsFromSchema({
            properties: { retries: { type: 'integer', description: 'retry count', default: 3 } },
        });
        expect(fields[0].description).toBe('retry count');
        expect(fields[0].defaultValue).toBe(3);
    });

    it('defaults unknown/untyped schemas to a text field', () => {
        const fields = gen.getFieldsFromSchema({ properties: { anything: {} } });
        expect(fields[0].type).toBe('text');
    });
});

// ---------------------------------------------------------------------------
// object / map / plugin handling
// ---------------------------------------------------------------------------

describe('object field variants', () => {
    const gen = new SchemaFormGenerator({});

    it('recurses into a structured object with known properties', () => {
        const fields = gen.getFieldsFromSchema({
            properties: {
                timeout: {
                    type: 'object',
                    properties: { connect: { type: 'integer' } },
                },
            },
        });
        const field = fields[0] as ObjectField;
        expect(field.type).toBe('object');
        expect(field.fields).toHaveLength(1);
        expect(field.fields[0].name).toBe('connect');
    });

    it('treats patternProperties objects as a free-form map', () => {
        const fields = gen.getFieldsFromSchema({
            properties: {
                nodes: {
                    type: 'object',
                    patternProperties: { '.*': { type: 'integer' } },
                },
            },
        });
        const field = fields[0] as MapField;
        expect(field.type).toBe('map');
        expect(field.valueSchema).toEqual({ type: 'integer' });
    });

    it('treats additionalProperties-as-schema objects as a free-form map', () => {
        const fields = gen.getFieldsFromSchema({
            properties: {
                labels: { type: 'object', additionalProperties: { type: 'string' } },
            },
        });
        expect((fields[0] as MapField).type).toBe('map');
    });

    it('does not treat additionalProperties: false as a map', () => {
        const fields = gen.getFieldsFromSchema({
            properties: {
                fixed: { type: 'object', additionalProperties: false, properties: { a: { type: 'string' } } },
            },
        });
        expect(fields[0].type).toBe('object');
    });

    it('gives "plugins" its own special plugin field type carrying the full catalog', () => {
        const catalog: SchemaCatalog = { main: {}, plugins: { 'key-auth': {} } };
        const pluginGen = new SchemaFormGenerator(catalog);
        const fields = pluginGen.getFieldsFromSchema({
            properties: { plugins: { type: 'object' } },
        });
        const field = fields[0] as PluginField;
        expect(field.type).toBe('plugin');
        expect(field.schema).toBe(catalog);
    });

    it('returns an empty-fields object when an object schema has no properties at all', () => {
        const fields = gen.getFieldsFromSchema({ properties: { misc: { type: 'object' } } });
        expect((fields[0] as ObjectField).fields).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// array handling
// ---------------------------------------------------------------------------

describe('array field variants', () => {
    const gen = new SchemaFormGenerator({});

    it('maps an array of objects to object-array with recursed itemFields', () => {
        const fields = gen.getFieldsFromSchema({
            properties: {
                nodes: {
                    type: 'array',
                    items: { type: 'object', properties: { host: { type: 'string' } } },
                },
            },
        });
        const field = fields[0] as ObjectArrayField;
        expect(field.type).toBe('object-array');
        expect(field.itemFields).toHaveLength(1);
        expect(field.itemFields[0].name).toBe('host');
    });

    it('maps an array of primitives to a plain array field carrying its schema', () => {
        const fields = gen.getFieldsFromSchema({
            properties: { tags: { type: 'array', items: { type: 'string' } } },
        });
        const field = fields[0] as ArrayField;
        expect(field.type).toBe('array');
    });
});

// ---------------------------------------------------------------------------
// anyOf / oneOf collapsing and inline grouping
// ---------------------------------------------------------------------------

describe('anyOf/oneOf field collapsing', () => {
    const gen = new SchemaFormGenerator({});

    it('collapses a nullable union (type + null) to the meaningful type', () => {
        const fields = gen.getFieldsFromSchema({
            properties: {
                name: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            },
        });
        expect(fields[0].type).toBe('text');
    });

    it('builds an inline oneof-group when variants are structurally different', () => {
        const fields = gen.getFieldsFromSchema({
            properties: {
                upstream: {
                    anyOf: [
                        { type: 'string' },
                        { type: 'object', properties: { nodes: { type: 'object' } } },
                    ],
                },
            },
        });
        const field = fields[0] as OneOfGroupField;
        expect(field.type).toBe('oneof-group');
        expect(field.inline).toBe(true);
        expect(field.variants).toHaveLength(2);
    });

    it('collapses to the first variant when all variants share the same field type', () => {
        // string | integer both collapse to a single 'text' field type in this generator
        const fields = gen.getFieldsFromSchema({
            properties: {
                value: { anyOf: [{ type: 'string' }, { type: 'integer' }] },
            },
        });
        expect(fields).toHaveLength(1);
        expect(fields[0].type).toBe('text');
    });
});

// ---------------------------------------------------------------------------
// getFields - category-level behavior (onlyKeys, oneOf group injection)
// ---------------------------------------------------------------------------

describe('getFields', () => {
    it('returns an empty array for an unknown category', () => {
        const gen = new SchemaFormGenerator({ main: {} });
        expect(gen.getFields('route')).toHaveLength(0);
    });

    it('filters to onlyKeys when provided, skipping missing keys', () => {
        const gen = new SchemaFormGenerator({
            main: {
                route: {
                    properties: { uri: { type: 'string' }, name: { type: 'string' } },
                },
            },
        });
        const fields = gen.getFields('route', ['uri', 'does_not_exist']);
        expect(fields.map(f => f.name)).toEqual(['uri']);
    });

    it('skips oneOf group injection when onlyKeys is given', () => {
        const gen = new SchemaFormGenerator({
            main: {
                route: {
                    properties: { uri: { type: 'string' }, uris: { type: 'array', items: { type: 'string' } } },
                    oneOf: [{ required: ['uri'] }, { required: ['uris'] }],
                },
            },
        });
        const fields = gen.getFields('route', ['uri', 'uris']);
        expect(fields.every(f => f.type !== 'oneof-group')).toBe(true);
    });

    it('replaces mutually-exclusive oneOf fields with a single oneof-group block', () => {
        const gen = new SchemaFormGenerator({
            main: {
                route: {
                    properties: {
                        uri: { type: 'string' },
                        uris: { type: 'array', items: { type: 'string' } },
                        name: { type: 'string' },
                    },
                    oneOf: [{ required: ['uri'] }, { required: ['uris'] }],
                },
            },
        });
        const fields = gen.getFields('route');
        const group = fields.find(f => f.type === 'oneof-group') as OneOfGroupField | undefined;
        expect(group).toBeDefined();
        expect(group!.variants.map(v => v.fieldNames[0]).sort()).toEqual(['uri', 'uris']);
        // "name" is untouched and still present as its own field
        expect(fields.some(f => f.name === 'name' && f.type === 'text')).toBe(true);
        // uri/uris no longer appear as standalone (non-group) fields - only inside the group
        expect(fields.some(f => f.type === 'text' && (f.name === 'uri' || f.name === 'uris'))).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// getOneOfGroups
// ---------------------------------------------------------------------------

describe('getOneOfGroups', () => {
    it('returns null for an unknown category', () => {
        const gen = new SchemaFormGenerator({ main: {} });
        expect(gen.getOneOfGroups('route')).toBeNull();
    });

    it('returns null when there is no oneOf/anyOf at all', () => {
        const gen = new SchemaFormGenerator({ main: { route: { properties: {} } } });
        expect(gen.getOneOfGroups('route')).toBeNull();
    });

    it('extracts groups from a top-level oneOf', () => {
        const gen = new SchemaFormGenerator({
            main: { route: { oneOf: [{ required: ['uri'] }, { required: ['uris'] }] } },
        });
        const groups = gen.getOneOfGroups('route');
        expect(groups).toHaveLength(1);
        expect(groups![0].map(g => g.exclusiveFields)).toEqual([['uri'], ['uris']]);
    });

    it('collects groups from each entry of an allOf wrapper', () => {
        const gen = new SchemaFormGenerator({
            main: {
                route: {
                    allOf: [
                        { oneOf: [{ required: ['uri'] }, { required: ['uris'] }] },
                        { oneOf: [{ required: ['a'] }, { required: ['b'] }] },
                    ],
                },
            },
        });
        const groups = gen.getOneOfGroups('route');
        expect(groups).toHaveLength(2);
    });

    it('returns null when oneOf variants share all their required fields (no exclusivity)', () => {
        const gen = new SchemaFormGenerator({
            main: { route: { oneOf: [{ required: ['a', 'b'] }, { required: ['a', 'b'] }] } },
        });
        expect(gen.getOneOfGroups('route')).toBeNull();
    });

    it('returns null when there is only a single oneOf variant', () => {
        const gen = new SchemaFormGenerator({
            main: { route: { oneOf: [{ required: ['a'] }] } },
        });
        expect(gen.getOneOfGroups('route')).toBeNull();
    });
});
