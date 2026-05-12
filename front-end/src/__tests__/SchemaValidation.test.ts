import { describe, it, expect } from 'vitest';
import { SchemaValidator } from '../actions/SchemaValidation';
import type { SchemaCatalog, ApisixConfig } from '../actions/SchemaValidation';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSchema(overrides: Record<string, unknown> = {}): SchemaCatalog {
    return {
        main: {
            route: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    uri: { type: 'string' },
                    plugins: { type: 'object' },
                },
                required: ['id', 'uri'],
                additionalProperties: false,
            },
            ...overrides,
        },
        plugins: {
            'limit-count': {
                schema: {
                    type: 'object',
                    properties: { count: { type: 'integer' } },
                    required: ['count'],
                },
            },
            'jwt-auth': {
                schema: {
                    type: 'object',
                    properties: { key: { type: 'string' } },
                },
                consumer_schema: {
                    type: 'object',
                    properties: { key: { type: 'string' } },
                    required: ['key'],
                },
            },
        },
    };
}

const validConfig: ApisixConfig = {
    routes: [{ id: 'r1', uri: '/test' }],
};

const invalidConfig: ApisixConfig = {
    // uri should be a string, not a number
    routes: [{ id: 'r1', uri: 123 }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SchemaValidator — getters/setters', () => {
    it('getConfig returns null initially', () => {
        const v = new SchemaValidator();
        expect(v.getConfig()).toBeNull();
    });

    it('setConfig / getConfig round-trips', () => {
        const v = new SchemaValidator();
        v.setConfig(validConfig);
        expect(v.getConfig()).toBe(validConfig);
    });

    it('getSchema returns null initially', () => {
        const v = new SchemaValidator();
        expect(v.getSchema()).toBeNull();
    });

    it('setSchema / getSchema round-trips', () => {
        const v = new SchemaValidator();
        const s = makeSchema();
        v.setSchema(s);
        expect(v.getSchema()).toBe(s);
    });
});

describe('SchemaValidator.validateConfig() — guard clauses', () => {
    it('returns valid:false when no config is set', () => {
        const v = new SchemaValidator();
        v.setSchema(makeSchema());
        const result = v.validateConfig();
        expect(result.valid).toBe(false);
    });

    it('returns valid:false when no schema is set', () => {
        const v = new SchemaValidator();
        v.setConfig(validConfig);
        const result = v.validateConfig();
        expect(result.valid).toBe(false);
    });

    it('returns valid:false when schema has no main', () => {
        const v = new SchemaValidator();
        v.setConfig(validConfig);
        v.setSchema({ plugins: {} });
        const result = v.validateConfig();
        expect(result.valid).toBe(false);
    });
});

describe('SchemaValidator.validateConfig() — valid config', () => {
    it('returns valid:true for a well-formed config', () => {
        const v = new SchemaValidator();
        v.setSchema(makeSchema());
        v.setConfig(validConfig);
        const result = v.validateConfig();
        expect(result.valid).toBe(true);
        expect(result.errorCollections).toHaveLength(0);
    });
});

describe('SchemaValidator.validateConfig() — schema errors', () => {
    it('returns valid:false and puts errors in errorCollections for wrong type', () => {
        const v = new SchemaValidator();
        v.setSchema(makeSchema());
        v.setConfig(invalidConfig);
        const result = v.validateConfig();
        expect(result.valid).toBe(false);
        expect(result.errorCollections.length).toBeGreaterThan(0);
    });

    it('places additionalProperties errors in warningErrors, not errorCollections', () => {
        const v = new SchemaValidator();
        v.setSchema(makeSchema());
        // unknown field triggers additionalProperties
        v.setConfig({ routes: [{ id: 'r1', uri: '/x', unknownField: true }] });
        const result = v.validateConfig();
        expect(result.warningErrors.length).toBeGreaterThan(0);
        const hasAdditionalPropInErrors = result.errorCollections.some(c =>
            c.sourceErrors.some(e => e.keyword === 'additionalProperties')
        );
        expect(hasAdditionalPropInErrors).toBe(false);
    });
});

describe('SchemaValidator.validateConfig() — plugin validation', () => {
    it('passes and adds a warning when plugin has no schema', () => {
        const v = new SchemaValidator();
        v.setSchema(makeSchema());
        v.setConfig({
            routes: [{ id: 'r1', uri: '/x', plugins: { 'unknown-plugin': {} } }],
        });
        const result = v.validateConfig();
        expect(result.valid).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0].message).toMatch(/unknown/i);
    });

    it('passes when a known plugin config is valid', () => {
        const v = new SchemaValidator();
        v.setSchema(makeSchema());
        v.setConfig({
            routes: [{ id: 'r1', uri: '/x', plugins: { 'limit-count': { count: 5 } } }],
        });
        const result = v.validateConfig();
        expect(result.valid).toBe(true);
        expect(result.errorCollections).toHaveLength(0);
    });

    it('returns errors in errorCollections when a known plugin config is invalid', () => {
        const v = new SchemaValidator();
        v.setSchema(makeSchema());
        // 'count' is required but missing
        v.setConfig({
            routes: [{ id: 'r1', uri: '/x', plugins: { 'limit-count': {} } }],
        });
        const result = v.validateConfig();
        expect(result.valid).toBe(false);
        const pluginError = result.errorCollections.find(c => c.parent === 'limit-count');
        expect(pluginError).toBeDefined();
    });
});

describe('SchemaValidator — consumer_schema vs schema', () => {
    it('uses consumer_schema for consumers context', () => {
        const schema = makeSchema({
            consumer: {
                type: 'object',
                properties: {
                    username: { type: 'string' },
                    plugins: { type: 'object' },
                },
                required: ['username'],
                additionalProperties: false,
            },
        });
        const v = new SchemaValidator();
        v.setSchema(schema);
        // jwt-auth consumer_schema requires 'key'; omitting it should produce error
        v.setConfig({
            consumers: [{ username: 'alice', plugins: { 'jwt-auth': {} } }],
        });
        const result = v.validateConfig();
        expect(result.valid).toBe(false);
        const pluginError = result.errorCollections.find(c => c.parent === 'jwt-auth');
        expect(pluginError).toBeDefined();
    });

    it('uses regular schema for non-consumer context', () => {
        const v = new SchemaValidator();
        v.setSchema(makeSchema());
        // jwt-auth regular schema does NOT require 'key', so empty config is valid
        v.setConfig({
            routes: [{ id: 'r1', uri: '/x', plugins: { 'jwt-auth': {} } }],
        });
        const result = v.validateConfig();
        expect(result.valid).toBe(true);
    });
});

describe('SchemaValidator.validateCategory()', () => {
    it('returns [] when no schema is set', () => {
        const v = new SchemaValidator();
        const errors = v.validateCategory('route', { id: 'r1', uri: '/x' });
        expect(errors).toEqual([]);
    });

    it('returns [] for valid data', () => {
        const v = new SchemaValidator();
        v.setSchema(makeSchema());
        const errors = v.validateCategory('route', { id: 'r1', uri: '/x' });
        expect(errors).toEqual([]);
    });

    it('returns errors for invalid data', () => {
        const v = new SchemaValidator();
        v.setSchema(makeSchema());
        // uri is required but missing
        const errors = v.validateCategory('route', { id: 'r1' });
        expect(errors.length).toBeGreaterThan(0);
    });

    it('returns [] for an unknown category name', () => {
        const v = new SchemaValidator();
        v.setSchema(makeSchema());
        const errors = v.validateCategory('nonexistent', { foo: 'bar' });
        expect(errors).toEqual([]);
    });
});

describe('SchemaValidator — setFillInDefaults', () => {
    // applySchemaDefaults is called per-plugin (not per-route), so we test it
    // via a plugin schema that has a required field with a default value.

    it('injects plugin defaults before validation when enabled', () => {
        const schema: SchemaCatalog = {
            main: {
                route: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        uri: { type: 'string' },
                        plugins: { type: 'object' },
                    },
                    required: ['id', 'uri'],
                    additionalProperties: false,
                },
            },
            plugins: {
                'my-plugin': {
                    schema: {
                        type: 'object',
                        properties: {
                            count: { type: 'integer', default: 10 },
                        },
                        required: ['count'],
                    },
                },
            },
        };

        const v = new SchemaValidator();
        v.setSchema(schema);
        v.setFillInDefaults(true);
        // 'count' is required but missing — the default (10) should be injected
        v.setConfig({ routes: [{ id: 'r1', uri: '/x', plugins: { 'my-plugin': {} } }] });
        const result = v.validateConfig();
        expect(result.valid).toBe(true);
    });

    it('fails plugin validation when fill-in defaults is disabled and required field is missing', () => {
        const schema: SchemaCatalog = {
            main: {
                route: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        uri: { type: 'string' },
                        plugins: { type: 'object' },
                    },
                    required: ['id', 'uri'],
                    additionalProperties: false,
                },
            },
            plugins: {
                'my-plugin': {
                    schema: {
                        type: 'object',
                        properties: {
                            count: { type: 'integer', default: 10 },
                        },
                        required: ['count'],
                    },
                },
            },
        };

        const v = new SchemaValidator();
        v.setSchema(schema);
        v.setFillInDefaults(false);
        v.setConfig({ routes: [{ id: 'r1', uri: '/x', plugins: { 'my-plugin': {} } }] });
        const result = v.validateConfig();
        expect(result.valid).toBe(false);
    });
});
