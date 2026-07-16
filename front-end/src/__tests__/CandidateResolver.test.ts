import { describe, it, expect } from 'vitest';
import { resolveCandidates } from '../pages/yamlEditor/components/CandidateResolver';
import type { CursorContext } from '../pages/yamlEditor/components/CursorContext';
import type { SchemaCatalog, ApisixConfig } from '../actions/SchemaValidation';
import type { CursorLocation } from '../pages/yamlEditor/components/CursorLocation';

function loc(overrides: Partial<CursorLocation> = {}): CursorLocation {
    return {
        indent: 4,
        category: 'route',
        schemaPath: [],
        existingKeys: new Set(),
        markerIndent: 2,
        isEntryMarkerLine: false,
        isUnderIndentedField: false,
        valuePositionKey: null,
        ...overrides,
    };
}

describe('resolveCandidates', () => {
    it('returns no candidates for an "unknown" context', () => {
        const context: CursorContext = { kind: 'unknown' };
        expect(resolveCandidates(context, {}, null)).toHaveLength(0);
    });

    describe('kind: category', () => {
        it('suggests every category not already present in the config', () => {
            const context: CursorContext = { kind: 'category' };
            const config: ApisixConfig = { routes: [] };
            const candidates = resolveCandidates(context, {}, config);
            expect(candidates.some(c => c.label === 'routes')).toBe(false);
            expect(candidates.some(c => c.label === 'upstreams')).toBe(true);
        });

        it('suggests all categories when config is undefined', () => {
            const context: CursorContext = { kind: 'category' };
            const candidates = resolveCandidates(context, {}, undefined);
            expect(candidates.length).toBeGreaterThan(0);
        });
    });

    describe('kind: key', () => {
        const catalog: SchemaCatalog = {
            main: {
                route: {
                    properties: {
                        uri: { type: 'string' },
                        upstream_id: { type: 'string' },
                    },
                },
            },
        };

        it('suggests keys from the category schema, excluding existing keys', () => {
            const context: CursorContext = {
                kind: 'key',
                category: 'route',
                location: loc({ existingKeys: new Set(['uri']) }),
            };
            const candidates = resolveCandidates(context, catalog, null);
            expect(candidates.map(c => c.label)).toEqual(['upstream_id']);
        });

        it('returns no candidates when the category has no schema', () => {
            const context: CursorContext = { kind: 'key', category: 'unknown_cat', location: loc() };
            expect(resolveCandidates(context, catalog, null)).toHaveLength(0);
        });

        it('inserts a newline + indent for object-typed key candidates', () => {
            const objCatalog: SchemaCatalog = {
                main: { route: { properties: { timeout: { type: 'object' } } } },
            };
            const context: CursorContext = { kind: 'key', category: 'route', location: loc({ indent: 4 }) };
            const candidates = resolveCandidates(context, objCatalog, null);
            expect(candidates[0].insertText).toBe('timeout:\n    ');
        });
    });

    describe('kind: value', () => {
        it('offers enum values for an enum-typed field', () => {
            const catalog: SchemaCatalog = {
                main: { route: { properties: { scheme: { type: 'string', enum: ['http', 'https'] } } } },
            };
            const context: CursorContext = {
                kind: 'value', category: 'route', location: loc(), schemaPath: ['scheme'],
            };
            const candidates = resolveCandidates(context, catalog, null);
            expect(candidates.map(c => c.label)).toEqual(['http', 'https']);
        });

        it('offers true/false for a boolean field', () => {
            const catalog: SchemaCatalog = {
                main: { route: { properties: { enabled: { type: 'boolean' } } } },
            };
            const context: CursorContext = {
                kind: 'value', category: 'route', location: loc(), schemaPath: ['enabled'],
            };
            const candidates = resolveCandidates(context, catalog, null);
            expect(candidates.map(c => c.label)).toEqual(['true', 'false']);
        });

        it('returns no candidates when the value schema path cannot be resolved', () => {
            const catalog: SchemaCatalog = { main: { route: { properties: {} } } };
            const context: CursorContext = {
                kind: 'value', category: 'route', location: loc(), schemaPath: ['missing'],
            };
            expect(resolveCandidates(context, catalog, null)).toHaveLength(0);
        });
    });

    describe('kind: plugin-name', () => {
        it('suggests plugin names not already used', () => {
            const catalog: SchemaCatalog = { plugins: { 'key-auth': {}, 'jwt-auth': {} } };
            const context: CursorContext = {
                kind: 'plugin-name', category: 'route', location: loc({ existingKeys: new Set(['key-auth']) }),
            };
            const candidates = resolveCandidates(context, catalog, null);
            expect(candidates.map(c => c.label)).toEqual(['jwt-auth']);
        });
    });

    describe('kind: plugin-key / plugin-value', () => {
        const catalog: SchemaCatalog = {
            plugins: {
                'limit-count': {
                    schema: { properties: { count: { type: 'integer' }, policy: { type: 'string', enum: ['local', 'redis'] } } },
                },
            },
        };

        it('suggests keys from the plugin schema', () => {
            const context: CursorContext = {
                kind: 'plugin-key', category: 'route', location: loc(), pluginName: 'limit-count',
            };
            const candidates = resolveCandidates(context, catalog, null);
            expect(candidates.map(c => c.label).sort()).toEqual(['count', 'policy']);
        });

        it('returns no candidates for an unknown plugin', () => {
            const context: CursorContext = {
                kind: 'plugin-key', category: 'route', location: loc(), pluginName: 'does-not-exist',
            };
            expect(resolveCandidates(context, catalog, null)).toHaveLength(0);
        });

        it('suggests enum values for a plugin field', () => {
            const context: CursorContext = {
                kind: 'plugin-value', category: 'route', location: loc(), pluginName: 'limit-count', schemaPath: ['policy'],
            };
            const candidates = resolveCandidates(context, catalog, null);
            expect(candidates.map(c => c.label)).toEqual(['local', 'redis']);
        });

        it('uses consumer_schema instead of schema when category is consumer', () => {
            const consumerCatalog: SchemaCatalog = {
                plugins: {
                    'key-auth': {
                        schema: { properties: { route_field: { type: 'string' } } },
                        consumer_schema: { properties: { key: { type: 'string' } } },
                    },
                },
            };
            const context: CursorContext = {
                kind: 'plugin-key', category: 'consumer', location: loc(), pluginName: 'key-auth',
            };
            const candidates = resolveCandidates(context, consumerCatalog, null);
            expect(candidates.map(c => c.label)).toEqual(['key']);
        });
    });

    describe('kind: reference', () => {
        it('builds candidates from existing entries in the target category', () => {
            const context: CursorContext = {
                kind: 'reference', category: 'route', field: 'upstream_id', targetCategory: 'upstream',
            };
            const config: ApisixConfig = { upstreams: [{ id: 'up-1' }, { id: 'up-2', name: 'named-upstream' }] };
            const candidates = resolveCandidates(context, {}, config);
            expect(candidates.map(c => c.label)).toEqual(['up-1', 'up-2']);
        });

        it('returns no candidates when config is missing', () => {
            const context: CursorContext = {
                kind: 'reference', category: 'route', field: 'upstream_id', targetCategory: 'upstream',
            };
            expect(resolveCandidates(context, {}, null)).toHaveLength(0);
        });

        it('skips entries with no usable id value', () => {
            const context: CursorContext = {
                kind: 'reference', category: 'route', field: 'upstream_id', targetCategory: 'upstream',
            };
            const config: ApisixConfig = { upstreams: [{ name: 'no-id' }] };
            expect(resolveCandidates(context, {}, config)).toHaveLength(0);
        });
    });
});
