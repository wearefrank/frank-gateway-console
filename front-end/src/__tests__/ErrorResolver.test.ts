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
// Block 8 — array data oneOf: leaf errors surface via the array-handling branch
// ---------------------------------------------------------------------------

describe('ErrorResolver — oneOf with array data', () => {
    const resolver = new ErrorResolver();

    it('surfaces leaf errors when oneOf error data is an array', () => {
        const err = makeError(
            'oneOf', '/nodes',
            {},
            '#/oneOf',
            {
                schema: [{ type: 'array' }, { type: 'object' }],
                data: [{ weight: 1 }],
            }
        );
        const leaf = makeError(
            'required', '/nodes/0',
            { missingProperty: 'host' },
            '#/oneOf/0/items/required'
        );
        const result = resolver.resolve([makeCollection([err, leaf])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toContain("missing required property 'host'");
    });
});

// ---------------------------------------------------------------------------
// Block 9 — anyOf with object data: drills into a structurally-matching
// "type: object" branch's leaf errors instead of showing "(unknown variant)"
// ---------------------------------------------------------------------------

describe('ErrorResolver — anyOf with object data (nodes map form)', () => {
    const resolver = new ErrorResolver();

    it('surfaces the specific leaf error (e.g. negative weight) instead of "no variant matched"', () => {
        const err = makeError(
            'anyOf', '/upstream/nodes',
            {},
            '#/properties/nodes/anyOf',
            {
                schema: [
                    { type: 'array', items: { required: ['host', 'weight'] } },
                    { type: 'object', patternProperties: { '.*': { type: 'integer', minimum: 0 } } },
                ],
                data: { 'host.docker.internal:3004': -1 },
            }
        );
        const leaf = makeError(
            'minimum', '/upstream/nodes/host.docker.internal:3004',
            { limit: 0 },
            '#/properties/nodes/anyOf/1/patternProperties/.*/minimum'
        );
        const result = resolver.resolve([makeCollection([err, leaf])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toBe("route: 'host.docker.internal:3004' must be >= 0");
        expect(result[0].message).not.toContain('unknown variant');
    });

    it('falls back to labelled (not "unknown variant") options when no branch has leaf errors to drill into', () => {
        const err = makeError(
            'anyOf', '/upstream/nodes',
            {},
            '#/properties/nodes/anyOf',
            {
                schema: [
                    { type: 'array', items: { required: ['host', 'weight'] } },
                    { type: 'object', patternProperties: { '.*': { type: 'integer', minimum: 0 } } },
                ],
                data: { 'host.docker.internal:3004': -1 },
            }
        );
        // no matching leaf errors supplied this time - forces the scoring/label fallback
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toContain('array of {host, weight}');
        expect(result[0].message).toContain('object (key: value map)');
        expect(result[0].message).not.toContain('unknown variant');
    });

    // mirrors the real APISIX route schema's mutual-exclusion guard for host/hosts
    // (and remote_addr/remote_addrs): oneOf [not-either, host, hosts]
    it('labels a "not" mutual-exclusion branch instead of "(unknown variant)"', () => {
        const err = makeError(
            'oneOf', '/route',
            {},
            '#/route/allOf/1/oneOf',
            {
                schema: [
                    { not: { anyOf: [{ required: ['host'] }, { required: ['hosts'] }] } },
                    { required: ['host'] },
                    { required: ['hosts'] },
                ],
                data: {},
            }
        );
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toContain('none of: host, hosts');
        expect(result[0].message).not.toContain('unknown variant');
    });

    // mirrors plugin _meta.error_response: oneOf [{type: "string"}, {type: "object"}] -
    // branches with no required/properties/items/patternProperties/not, just a bare type
    it('labels a bare-type branch by its type instead of "(unknown variant)"', () => {
        const err = makeError(
            'oneOf', '/error_response',
            {},
            '#/_meta/properties/error_response/oneOf',
            {
                schema: [{ type: 'string' }, { type: 'object' }],
                data: {},
            }
        );
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toContain('string');
        expect(result[0].message).toContain('object');
        expect(result[0].message).not.toContain('unknown variant');
    });

    // mirrors the gzip plugin's "types" field: anyOf [array-of-strings, {enum: ["*"]}] -
    // the enum branch has no type/required/properties of its own
    it('labels an enum-only branch by its allowed value(s) instead of "(unknown variant)"', () => {
        const err = makeError(
            'anyOf', '/types',
            {},
            '#/properties/types/anyOf',
            {
                schema: [
                    { type: 'array', items: { type: 'string' } },
                    { enum: ['*'] },
                ],
                data: {},
            }
        );
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toContain('value: *');
        expect(result[0].message).not.toContain('unknown variant');
    });
});

// ---------------------------------------------------------------------------
// Block 10 — schema-form "dependencies" (compiles to a bare "not" error)
// ---------------------------------------------------------------------------

describe('ErrorResolver — "not" from a schema-form dependencies entry', () => {
    const resolver = new ErrorResolver();

    // mirrors upstream.tls.dependencies: setting client_cert_id excludes client_cert/client_key
    it('names the triggering field and what it excludes, not the raw AJV message', () => {
        const err = makeError(
            'not', '/upstream/tls',
            {},
            '#/definitions/upstream/properties/tls/dependencies/client_cert_id/not',
            {
                schema: { required: ['client_cert', 'client_key'] },
                message: 'must NOT be valid',
            }
        );
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toBe(
            "route: 'client_cert_id' cannot be combined with: client_cert, client_key"
        );
        expect(result[0].message).not.toContain('must NOT be valid');
    });

    // mirrors response-rewrite.dependencies: body and filters exclude each other, each
    // producing its own "not" error - they must stay distinguishable, not identical
    it('produces distinct messages for each side of a two-way exclusion', () => {
        const bodyErr = makeError(
            'not', '/plugins/response-rewrite',
            {},
            '#/dependencies/body/not',
            { schema: { required: ['filters'] } }
        );
        const filtersErr = makeError(
            'not', '/plugins/response-rewrite',
            {},
            '#/dependencies/filters/not',
            { schema: { required: ['body'] } }
        );
        const result = resolver.resolve([makeCollection([bodyErr, filtersErr])]);
        expect(result).toHaveLength(2);
        expect(result[0].message).toContain("'body' cannot be combined with: filters");
        expect(result[1].message).toContain("'filters' cannot be combined with: body");
        expect(result[0].message).not.toBe(result[1].message);
    });

    it('falls back to the raw AJV message when the negated schema has no required/anyOf fields', () => {
        const err = makeError(
            'not', '/upstream/scheme',
            {},
            '#/properties/scheme/not',
            { schema: { enum: ['grpc'] }, message: 'must NOT be valid' }
        );
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toContain('must NOT be valid');
    });
});

// ---------------------------------------------------------------------------
// Block 11 — anyOf/oneOf with array data, no branch's type matches at all
// ---------------------------------------------------------------------------

describe('ErrorResolver — anyOf with array data and no matching branch type', () => {
    const resolver = new ErrorResolver();

    // mirrors ip-restriction.whitelist: a 4-branch anyOf that's all "type: string",
    // distinguished only by format/pattern - a wrong-typed item used to render as
    // "'1' must be string or string or string or string, got number"
    it('dedupes repeated types and describes an array item by index, not as a quoted field', () => {
        const err = makeError(
            'anyOf', '/whitelist/1',
            {},
            '#/properties/whitelist/items/anyOf',
            {
                schema: [
                    { type: 'string', format: 'ipv4' },
                    { type: 'string', pattern: 'ipv4-cidr' },
                    { type: 'string', format: 'ipv6' },
                    { type: 'string', pattern: 'ipv6-cidr' },
                ],
                data: 8080,
            }
        );
        const result = resolver.resolve([makeCollection([err], 'ip-restriction', 'ip-restriction')]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toBe('ip-restriction: item 1 must be string, got number');
    });

    it('still quotes a named field (non-numeric last path segment)', () => {
        const err = makeError(
            'anyOf', '/upstream/scheme',
            {},
            '#/properties/scheme/anyOf',
            {
                schema: [{ type: 'string' }, { type: 'integer' }],
                data: true,
            }
        );
        const result = resolver.resolve([makeCollection([err])]);
        expect(result).toHaveLength(1);
        expect(result[0].message).toBe("route: 'scheme' must be string or integer, got boolean");
    });
});
