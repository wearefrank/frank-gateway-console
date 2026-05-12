import { describe, it, expect } from 'vitest';
import ErrorResolver from '../actions/ErrorResolver';
import type { AjvErrorCollection } from '../actions/ErrorResolver';
import type { ErrorObject } from 'ajv';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeError(
    keyword: string,
    instancePath = '',
    params: Record<string, unknown> = {},
    schemaPath = `#/${keyword}`,
    extra: Partial<ErrorObject> = {}
): ErrorObject {
    return {
        keyword,
        instancePath,
        schemaPath,
        params,
        message: `mock ${keyword}`,
        ...extra,
    } as ErrorObject;
}

function makeCollection(
    sourceErrors: ErrorObject[],
    parent = 'route',
    type = 'route'
): AjvErrorCollection {
    return { parent, type, sourceErrors };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ErrorResolver.resolve()', () => {
    const resolver = new ErrorResolver();

    it('returns [] for an empty collections array', () => {
        expect(resolver.resolve([])).toEqual([]);
    });

    it('returns [] when a collection has no errors', () => {
        const result = resolver.resolve([makeCollection([], 'route', 'route')]);
        expect(result).toEqual([]);
    });

    it('filters out detectPlugins keyword errors entirely', () => {
        const err = makeError('detectPlugins', '/routes/0/plugins/limit-count', { failedPlugin: 'limit-count' });
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toEqual([]);
    });

    it('resolves a direct "required" error', () => {
        const err = makeError('required', '/routes/0', { missingProperty: 'uri' });
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toContain("missing required property 'uri'");
    });

    it('resolves a direct "additionalProperties" error', () => {
        const err = makeError('additionalProperties', '/routes/0', { additionalProperty: 'badField' });
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toContain("unknown property 'badField'");
    });

    it('resolves a direct "type" error', () => {
        const err = makeError('type', '/routes/0/uri', { type: 'string' });
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toContain("must be string");
    });

    it('resolves a direct "enum" error', () => {
        const err = makeError('enum', '/routes/0/method', { allowedValues: ['GET', 'POST'] });
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toContain('GET');
        expect(result[0].message).toContain('POST');
    });

    it('resolves a direct "minimum" error', () => {
        const err = makeError('minimum', '/routes/0/count', { limit: 1 });
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toContain('>= 1');
    });

    it('resolves a direct "minLength" error', () => {
        const err = makeError('minLength', '/routes/0/name', { limit: 3 });
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toContain('at least 3 characters');
    });

    it('includes the parent name in the error message', () => {
        const err = makeError('required', '/routes/0', { missingProperty: 'uri' });
        const result = resolver.resolve([makeCollection([err], 'route')]);
        expect(result[0].message).toMatch(/^route:/);
    });

    it('resolved error has an errorObject reference back to the collection', () => {
        const err = makeError('required', '', { missingProperty: 'id' });
        const collection = makeCollection([err]);
        const result = resolver.resolve([collection]);
        expect(result[0].errorObject).toBe(collection);
    });

    it('resolves multiple errors from one collection', () => {
        const errors = [
            makeError('required', '/routes/0', { missingProperty: 'id' }),
            makeError('required', '/routes/0', { missingProperty: 'uri' }),
        ];
        const result = resolver.resolve([makeCollection(errors)]);
        expect(result).toHaveLength(2);
    });

    it('resolves errors from multiple collections', () => {
        const c1 = makeCollection([makeError('required', '/routes/0', { missingProperty: 'id' })], 'route');
        const c2 = makeCollection([makeError('required', '/upstreams/0', { missingProperty: 'nodes' })], 'upstream');
        const result = resolver.resolve([c1, c2]);
        expect(result).toHaveLength(2);
    });

    it('path starts with the plugin path when collection type is a full path', () => {
        const err = makeError('required', '', { missingProperty: 'count' });
        const collection = makeCollection([err], 'limit-count', '/routes/0/plugins/limit-count');
        const result = resolver.resolve([collection]);
        expect(result[0].path).toMatch(/^\/routes\/0\/plugins\/limit-count/);
    });

    it('resolves oneOf error and includes "no variant matched" when no branch matches', () => {
        const schema = [
            { required: ['url'], properties: { url: { type: 'string' } } },
            { required: ['ip'],  properties: { ip: { type: 'string' } } },
        ];
        const err = makeError(
            'oneOf',
            '/routes/0/upstream',
            {},
            '#/properties/upstream/oneOf',
            { schema, data: { port: 80 } }
        );
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toMatch(/no variant matched/i);
    });
});

// ---------------------------------------------------------------------------
// Block 1 — formatDirectError: missing keyword coverage
// ---------------------------------------------------------------------------

describe('ErrorResolver — formatDirectError missing keywords', () => {
    const resolver = new ErrorResolver();

    it('"maximum" → must be <= <limit>', () => {
        const err = makeError('maximum', '/routes/0/count', { limit: 100 });
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toContain("<= 100");
    });

    it('"minItems" → must have at least <N> items', () => {
        const err = makeError('minItems', '/routes/0/nodes', { limit: 2 });
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toContain("at least 2 items");
    });

    it('"pattern" → does not match required pattern', () => {
        const err = makeError('pattern', '/routes/0/id', {});
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toContain("does not match required pattern");
    });

    it('unknown keyword falls back to err.message', () => {
        const err = makeError('format', '/routes/0/uri', {});
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toContain('mock format');
    });
});

// ---------------------------------------------------------------------------
// Block 2 — resolveBranchErrors: if/then condition matches
// ---------------------------------------------------------------------------

describe('ErrorResolver — if/then branch (condition matches)', () => {
    const resolver = new ErrorResolver();

    it('surfaces the then-branch leaf with a "when" prefix in the message', () => {
        const wrapper = makeError(
            'if', '/upstream', {},
            '#/properties/upstream/if',
            {
                parentSchema: {
                    if:   { properties: { type: { const: 'roundrobin' } } },
                    then: { required: ['nodes'] },
                    properties: { type: { enum: ['roundrobin', 'chash'] } },
                },
                data: { type: 'roundrobin' },
            }
        );
        const leaf = makeError(
            'required', '/upstream',
            { missingProperty: 'nodes' },
            '#/properties/upstream/then/required',
            { data: { type: 'roundrobin' } }
        );
        const result = resolver.resolve([makeCollection([wrapper, leaf])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toBe("route: when 'type' is 'roundrobin', missing required property 'nodes'");
        expect(result[0].path).toBe('/upstream/nodes');
        expect(result[0].hint).toBeUndefined();
    });

    it('enum constraint: surfaces leaf when multi-value enum matches', () => {
        const wrapper = makeError(
            'if', '/upstream', {},
            '#/properties/upstream/if',
            {
                parentSchema: {
                    if: { properties: { type: { enum: ['roundrobin', 'chash'] } } },
                    then: { required: ['nodes'] },
                    properties: { type: { enum: ['roundrobin', 'chash'] } },
                },
                data: { type: 'roundrobin' },
            }
        );
        const leaf = makeError(
            'required', '/upstream',
            { missingProperty: 'nodes' },
            '#/properties/upstream/then/required'
        );
        const result = resolver.resolve([makeCollection([wrapper, leaf])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toContain("when 'type' is one of: roundrobin, chash");
    });
});

// ---------------------------------------------------------------------------
// Block 3 — resolveBranchErrors: if condition does NOT match (silent skip)
// ---------------------------------------------------------------------------

describe('ErrorResolver — if/then branch (condition no-match)', () => {
    const resolver = new ErrorResolver();

    it('returns [] when data does not satisfy the if condition', () => {
        const wrapper = makeError(
            'if', '/upstream', {},
            '#/properties/upstream/if',
            {
                parentSchema: {
                    if:   { properties: { type: { const: 'roundrobin' } } },
                    then: { required: ['nodes'] },
                },
                data: { type: 'chash' },   // does not match 'roundrobin'
            }
        );
        const leaf = makeError(
            'required', '/upstream',
            { missingProperty: 'nodes' },
            '#/properties/upstream/then/required'
        );
        const result = resolver.resolve([makeCollection([wrapper, leaf])]);
        expect(result).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Block 4 — resolveBranchErrors: vacuous (if-field absent from data)
// A dummy leaf is required to bypass the early-return guard:
//   if (ifThenLeaves.length === 0) return []
// ---------------------------------------------------------------------------

describe('ErrorResolver — if/then branch (vacuous — field absent)', () => {
    const resolver = new ErrorResolver();

    // A leaf under a completely different path — it bypasses the guard but is
    // never owned by the vacuous wrapper, so it does NOT add extra results.
    const dummyLeaf = makeError(
        'required', '/other', { missingProperty: 'x' }, '#/other/then/required'
    );

    it('enum with default — message includes default note and hint', () => {
        const wrapper = makeError(
            'if', '/upstream', {},
            '#/properties/upstream/if',
            {
                parentSchema: {
                    if: { properties: { type: { const: 'roundrobin' } } },
                    properties: { type: { enum: ['roundrobin', 'chash'], default: 'roundrobin' } },
                },
                data: {},   // 'type' absent → vacuous
            }
        );
        const result = resolver.resolve([makeCollection([wrapper, dummyLeaf])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toBe(
            "route: 'type' is required (default: 'roundrobin'), options: roundrobin, chash"
        );
        expect(result[0].path).toBe('/upstream/type');
        expect(result[0].hint).toEqual({
            field: '/upstream/type',
            type: 'direct',
            default: 'roundrobin',
        });
    });

    it('enum without default — message lists options, no hint', () => {
        const wrapper = makeError(
            'if', '/upstream', {},
            '#/properties/upstream/if',
            {
                parentSchema: {
                    if: { properties: { type: { const: 'roundrobin' } } },
                    properties: { type: { enum: ['roundrobin', 'chash'] } },
                },
                data: {},
            }
        );
        const result = resolver.resolve([makeCollection([wrapper, dummyLeaf])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toBe(
            "route: 'type' is required, options: roundrobin, chash"
        );
        expect(result[0].hint).toBeUndefined();
    });

    it('const on parent property — message lists single const value', () => {
        const wrapper = makeError(
            'if', '/upstream', {},
            '#/properties/upstream/if',
            {
                parentSchema: {
                    if: { properties: { type: { const: 'roundrobin' } } },
                    properties: { type: { const: 'roundrobin' } },
                },
                data: {},
            }
        );
        const result = resolver.resolve([makeCollection([wrapper, dummyLeaf])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toBe(
            "route: 'type' is required, options: roundrobin"
        );
        expect(result[0].hint).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Block 5 — resolveOneOfErrors: passingSchemas (multiple branches matched)
// ---------------------------------------------------------------------------

describe('ErrorResolver — oneOf passingSchemas', () => {
    const resolver = new ErrorResolver();

    it('message says "matches multiple variants" and lists all matching branches', () => {
        const err = makeError(
            'oneOf', '/upstream',
            { passingSchemas: [0, 1] },
            '#/properties/upstream/oneOf',
            {
                schema: [{ required: ['url'] }, { required: ['url', 'port'] }],
                data: { url: 'x' },
            }
        );
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toBe(
            'route: oneOf — matches multiple variants, pick one:\n| url\n| url, port'
        );
        expect(result[0].path).toBe('/upstream');
        expect(result[0].hint).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Block 6 — resolveOneOfErrors: scoring (best-match branch ranked first)
// ---------------------------------------------------------------------------

describe('ErrorResolver — oneOf scoring', () => {
    const resolver = new ErrorResolver();

    it('only the branch with most key-matches appears; hint has type "anyof"', () => {
        const err = makeError(
            'oneOf', '/upstream',
            {},
            '#/properties/upstream/oneOf',
            {
                schema: [
                    { required: ['url', 'name'] },   // 0 matches with data
                    { required: ['ip', 'port'] },    // 2 matches with data
                ],
                data: { ip: '1.2.3.4', port: 80 },
            }
        );
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toBe(
            'route: oneOf — no variant matched. Closest options:\n| ip, port'
        );
        expect(result[0].path).toBe('/upstream');
        expect(result[0].hint).toEqual({
            field: 'route',
            type: 'anyof',
            possibleOptions: [['ip', 'port']],
        });
    });

    it('tied branches both appear in the message', () => {
        const err = makeError(
            'oneOf', '/upstream',
            {},
            '#/properties/upstream/oneOf',
            {
                schema: [
                    { required: ['url', 'name'] },  // 1 match ('url')
                    { required: ['url', 'port'] },  // 1 match ('url')
                ],
                data: { url: 'x' },
            }
        );
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        // Both branches tied → both listed
        expect(result[0].message).toContain('url, name');
        expect(result[0].message).toContain('url, port');
    });
});

// ---------------------------------------------------------------------------
// Block 7 — anyOf treated identically to oneOf
// ---------------------------------------------------------------------------

describe('ErrorResolver — anyOf keyword', () => {
    const resolver = new ErrorResolver();

    it('anyOf error is classified and resolved like oneOf', () => {
        const err = makeError(
            'anyOf', '/upstream',
            {},
            '#/properties/upstream/anyOf',
            {
                schema: [
                    { required: ['url', 'name'] },
                    { required: ['ip', 'port'] },
                ],
                data: { ip: '1.2.3.4', port: 80 },
            }
        );
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toContain('anyOf');
        expect(result[0].message).toContain('no variant matched');
        expect(result[0].hint?.type).toBe('anyof');
    });
});

// ---------------------------------------------------------------------------
// Block 8 — array data oneOf: skipped due to dead-code guard
// The first check `if (!Array.isArray(schema) || !this.isObject(data)) continue`
// fires for array data, making the array-handling branch (line 93) unreachable.
// ---------------------------------------------------------------------------

describe('ErrorResolver — oneOf with array data (dead-code guard)', () => {
    const resolver = new ErrorResolver();

    it('produces [] when oneOf error data is an array (guard fires, error is skipped)', () => {
        const err = makeError(
            'oneOf', '/nodes',
            {},
            '#/oneOf',
            {
                schema: [{ type: 'array' }, { type: 'object' }],
                data: [{ weight: 1 }],   // array → !isObject(data) → continue
            }
        );
        const leaf = makeError(
            'required', '/nodes/0',
            { missingProperty: 'host' },
            '#/oneOf/0/items/required'
        );
        const result = resolver.resolve([makeCollection([err, leaf])]);
        // The oneOf error is skipped; the leaf is classified as ifThenLeaf
        // but resolveBranchErrors has no matching if-wrapper, so nothing surfaces.
        expect(result).toEqual([]);
    });
});
