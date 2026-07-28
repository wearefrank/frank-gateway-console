import { describe, it, expect } from 'vitest';
import { resolveCandidates } from '../pages/yamlEditor/components/providers/CandidateResolver';
import { resolveCursorContext, type CursorContext } from '../pages/yamlEditor/components/providers/CursorContext';
import { CATEGORY_DEFINITIONS } from '../config/categoryDefinitions';
import type { SchemaCatalog, ApisixConfig } from '../actions/SchemaValidation';
import type { CursorLocation } from '../pages/yamlEditor/components/providers/CursorLocation';

function loc(overrides: Partial<CursorLocation> = {}): CursorLocation {
    return {
        indent: 4,
        category: 'route',
        schemaPath: [],
        existingKeys: new Set(),
        existingValues: new Map(),
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
                kind: 'plugin-key', category: 'route', location: loc(), pluginName: 'limit-count', schemaPath: [],
            };
            const candidates = resolveCandidates(context, catalog, null);
            expect(candidates.map(c => c.label).sort()).toEqual(['count', 'policy']);
        });

        it('returns no candidates for an unknown plugin', () => {
            const context: CursorContext = {
                kind: 'plugin-key', category: 'route', location: loc(), pluginName: 'does-not-exist', schemaPath: [],
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

        it('includes properties only defined under if/then/else branches', () => {
            const conditionalCatalog: SchemaCatalog = {
                plugins: {
                    'limit-count': {
                        schema: {
                            properties: { count: { type: 'integer' }, policy: { type: 'string', enum: ['local', 'redis'] } },
                            if: { properties: { policy: { const: 'redis' } } },
                            then: { properties: { redis_host: { type: 'string' } } },
                            else: { properties: { local_only_field: { type: 'string' } } },
                        },
                    },
                },
            };
            const context: CursorContext = {
                kind: 'plugin-key', category: 'route', location: loc(), pluginName: 'limit-count', schemaPath: [],
            };
            const candidates = resolveCandidates(context, conditionalCatalog, null);
            expect(candidates.map(c => c.label).sort()).toEqual(['count', 'local_only_field', 'policy', 'redis_host']);
        });

        describe('if/then/else filtering based on an already-typed discriminator', () => {
            const discriminatedCatalog: SchemaCatalog = {
                plugins: {
                    'limit-count': {
                        schema: {
                            properties: { count: { type: 'integer' }, policy: { type: 'string', enum: ['local', 'redis'] } },
                            if: { properties: { policy: { const: 'redis' } } },
                            then: { properties: { redis_host: { type: 'string' } } },
                            else: { properties: { local_only_field: { type: 'string' } } },
                        },
                    },
                },
            };

            it('only offers "then" fields when the sibling discriminator matches the if condition', () => {
                const context: CursorContext = {
                    kind: 'plugin-key',
                    category: 'route',
                    location: loc({ existingValues: new Map([['policy', 'redis']]) }),
                    pluginName: 'limit-count',
                    schemaPath: [],
                };
                const candidates = resolveCandidates(context, discriminatedCatalog, null);
                expect(candidates.map(c => c.label).sort()).toEqual(['count', 'policy', 'redis_host']);
            });

            it('only offers "else" fields when the sibling discriminator does not match the if condition', () => {
                const context: CursorContext = {
                    kind: 'plugin-key',
                    category: 'route',
                    location: loc({ existingValues: new Map([['policy', 'local']]) }),
                    pluginName: 'limit-count',
                    schemaPath: [],
                };
                const candidates = resolveCandidates(context, discriminatedCatalog, null);
                expect(candidates.map(c => c.label).sort()).toEqual(['count', 'local_only_field', 'policy']);
            });

            it('offers both branches when the discriminator has not been typed yet', () => {
                const context: CursorContext = {
                    kind: 'plugin-key', category: 'route', location: loc(), pluginName: 'limit-count', schemaPath: [],
                };
                const candidates = resolveCandidates(context, discriminatedCatalog, null);
                expect(candidates.map(c => c.label).sort()).toEqual(['count', 'local_only_field', 'policy', 'redis_host']);
            });

            it('offers both branches when the discriminator key is typed but its value is still empty', () => {
                // Regression: "policy: " (colon typed, value not yet typed) used to be read as
                // an empty-string sibling value, which compared as a real (never-matching)
                // value instead of "not typed yet" - hiding both branches instead of neither.
                const context: CursorContext = {
                    kind: 'plugin-key',
                    category: 'route',
                    location: loc({ existingValues: new Map([['policy', '']]) }),
                    pluginName: 'limit-count',
                    schemaPath: [],
                };
                const candidates = resolveCandidates(context, discriminatedCatalog, null);
                expect(candidates.map(c => c.label).sort()).toEqual(['count', 'local_only_field', 'policy', 'redis_host']);
            });

            it('requires every field of a multi-field if condition to match before selecting "then"', () => {
                const multiFieldCatalog: SchemaCatalog = {
                    plugins: {
                        'limit-count': {
                            schema: {
                                properties: {},
                                if: { properties: { policy: { const: 'redis' }, key_type: { const: 'var' } } },
                                then: { properties: { redis_host: { type: 'string' } } },
                                else: { properties: { local_only_field: { type: 'string' } } },
                            },
                        },
                    },
                };
                const contextWith = (values: [string, string][]): CursorContext => ({
                    kind: 'plugin-key', category: 'route', location: loc({ existingValues: new Map(values) }), pluginName: 'limit-count', schemaPath: [],
                });

                // Both fields match -> "then" only.
                expect(resolveCandidates(contextWith([['policy', 'redis'], ['key_type', 'var']]), multiFieldCatalog, null).map(c => c.label))
                    .toEqual(['redis_host']);

                // One field mismatches -> "else" only, regardless of the other field.
                expect(resolveCandidates(contextWith([['policy', 'redis'], ['key_type', 'constant']]), multiFieldCatalog, null).map(c => c.label))
                    .toEqual(['local_only_field']);

                // Only one of the two fields typed so far, and it matches: current behavior
                // treats this as a full match rather than waiting for the second field, since
                // no typed field has mismatched yet. Documenting this as the known behavior.
                expect(resolveCandidates(contextWith([['policy', 'redis']]), multiFieldCatalog, null).map(c => c.label))
                    .toEqual(['redis_host']);
            });
        });

        it('includes properties nested under allOf branches, with own properties taking precedence', () => {
            const allOfCatalog: SchemaCatalog = {
                plugins: {
                    'limit-count': {
                        schema: {
                            properties: { count: { type: 'integer', description: 'own' } },
                            allOf: [
                                { properties: { count: { type: 'integer', description: 'shadowed' }, redis_host: { type: 'string' } } },
                                { then: { properties: { nested_field: { type: 'string' } } } },
                            ],
                        },
                    },
                },
            };
            const context: CursorContext = {
                kind: 'plugin-key', category: 'route', location: loc(), pluginName: 'limit-count', schemaPath: [],
            };
            const candidates = resolveCandidates(context, allOfCatalog, null);
            expect(candidates.map(c => c.label).sort()).toEqual(['count', 'nested_field', 'redis_host']);
            expect(candidates.find(c => c.label === 'count')?.description).toBe('own');
        });

        it('walks into a nested value path whose parent is defined only under a then branch', () => {
            const conditionalCatalog: SchemaCatalog = {
                plugins: {
                    'limit-count': {
                        schema: {
                            properties: { policy: { type: 'string', enum: ['local', 'redis'] } },
                            then: {
                                properties: {
                                    redis: { properties: { mode: { type: 'string', enum: ['on', 'off'] } } },
                                },
                            },
                        },
                    },
                },
            };
            const context: CursorContext = {
                kind: 'plugin-value', category: 'route', location: loc(), pluginName: 'limit-count', schemaPath: ['redis', 'mode'],
            };
            const candidates = resolveCandidates(context, conditionalCatalog, null);
            expect(candidates.map(c => c.label)).toEqual(['on', 'off']);
        });

        it('offers no candidates walking into a then-only path when the discriminator does not match', () => {
            const conditionalCatalog: SchemaCatalog = {
                plugins: {
                    'limit-count': {
                        schema: {
                            properties: { policy: { type: 'string', enum: ['local', 'redis'] } },
                            if: { properties: { policy: { const: 'redis' } } },
                            then: {
                                properties: {
                                    redis: { properties: { mode: { type: 'string', enum: ['on', 'off'] } } },
                                },
                            },
                        },
                    },
                },
            };
            const context: CursorContext = {
                kind: 'plugin-value',
                category: 'route',
                location: loc({ existingValues: new Map([['policy', 'local']]) }),
                pluginName: 'limit-count',
                schemaPath: ['redis', 'mode'],
            };
            const candidates = resolveCandidates(context, conditionalCatalog, null);
            expect(candidates).toHaveLength(0);
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
                kind: 'plugin-key', category: 'consumer', location: loc(), pluginName: 'key-auth', schemaPath: [],
            };
            const candidates = resolveCandidates(context, consumerCatalog, null);
            expect(candidates.map(c => c.label)).toEqual(['key']);
        });
    });

    describe('full pipeline: real YAML text through resolveCursorContext', () => {
        // Regression coverage for a bug where plugin-key completions always resolved to
        // nothing in the real editor: resolveCandidates used context.location.schemaPath
        // (the full document path, still prefixed with "plugins"/pluginName) instead of a
        // path scoped to the plugin's own schema. Hand-built CursorContext objects elsewhere
        // in this file never caught it because they never exercised resolveCursorContext.
        // Fixture mirrors the real limit-count plugin's shape: a top-level if/then/else where
        // "else" itself nests its own if/then (redis vs. redis-cluster vs. neither).
        const catalog: SchemaCatalog = {
            plugins: {
                'limit-count': {
                    schema: {
                        properties: { count: { type: 'integer' }, policy: { type: 'string', enum: ['local', 'redis', 'redis-cluster'] } },
                        if: { properties: { policy: { enum: ['redis'] } } },
                        then: { properties: { redis_host: { type: 'string' } } },
                        else: {
                            if: { properties: { policy: { enum: ['redis-cluster'] } } },
                            then: { properties: { redis_cluster_nodes: { type: 'array' } } },
                        },
                    },
                },
            },
        };

        function candidatesForPolicy(policyLine: string): string[] {
            const lines = [
                'routes:',
                '  - id: r1',
                '    uri: /foo',
                '    plugins:',
                '      limit-count:',
                '        count: 2',
                ...(policyLine ? [`        ${policyLine}`] : []),
                '        ',
            ];
            const text = lines.join('\n');
            const context = resolveCursorContext(text, lines.length, lines[lines.length - 1].length + 1, CATEGORY_DEFINITIONS);
            return resolveCandidates(context, catalog, null).map(c => c.label).sort();
        }

        it('resolves to a non-empty plugin-key context once other fields are already typed', () => {
            const context = resolveCursorContext(
                ['routes:', '  - id: r1', '    plugins:', '      limit-count:', '        count: 2', '        '].join('\n'),
                6, 9, CATEGORY_DEFINITIONS,
            );
            expect(context.kind).toBe('plugin-key');
        });

        it('offers only the redis branch fields when policy: redis is already typed', () => {
            // "count" and "policy" are already-typed siblings, so existingKeys filters them out.
            expect(candidatesForPolicy('policy: redis')).toEqual(['redis_host']);
        });

        it('offers only the redis-cluster branch fields when policy: redis-cluster is already typed', () => {
            expect(candidatesForPolicy('policy: redis-cluster')).toEqual(['redis_cluster_nodes']);
        });

        it('offers neither redis branch when policy: local is already typed', () => {
            expect(candidatesForPolicy('policy: local')).toEqual([]);
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
