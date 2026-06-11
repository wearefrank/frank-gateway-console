import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import { ConfigManager } from '../actions/ConfigManager';
import type { SchemaCatalog } from '../actions/SchemaValidation';

// ---------------------------------------------------------------------------
// localStorage mock — test environment is "node" so there is no DOM
// ---------------------------------------------------------------------------

const storage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
    getItem:    (key: string): string | null => storage[key] ?? null,
    setItem:    (key: string, val: string)   => { storage[key] = val; },
    removeItem: (key: string)                => { delete storage[key]; },
});

beforeEach(() => {
    Object.keys(storage).forEach(k => delete storage[k]);
});

afterAll(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSchema(): SchemaCatalog {
    return {
        main: {
            route: {
                type: 'object',
                properties: {
                    id:      { type: 'string' },
                    uri:     { type: 'string' },
                    plugins: { type: 'object' },
                },
                required: ['id', 'uri'],
                additionalProperties: false,
            },
            upstream: {
                type: 'object',
                properties: {
                    id:   { type: 'string' },
                    name: { type: 'string' },
                },
                required: ['id'],
                additionalProperties: false,
            },
            consumer: {
                type: 'object',
                properties: {
                    username: { type: 'string' },
                    plugins:  { type: 'object' },
                },
                required: ['username'],
                additionalProperties: false,
            },
        },
        plugins: {},
    };
}

// Two routes, one upstream (plural key), one consumer
const VALID_YAML = [
    'routes:',
    '  - id: route-1',
    '    uri: /api/v1',
    '  - id: route-2',
    '    uri: /api/v2',
    'upstreams:',
    '  - id: upstream-1',
    'consumers:',
    '  - username: alice',
].join('\n');

// Syntactically broken YAML (unclosed flow sequence)
const INVALID_YAML_SYNTAX = 'routes:\n  - id: route-1\n    uri: [unclosed';

// Syntactically valid YAML but fails schema validation (uri is required)
const VALID_YAML_SCHEMA_INVALID = 'routes:\n  - id: route-1';

// ---------------------------------------------------------------------------
// Group 1: Constructor and localStorage integration
// ---------------------------------------------------------------------------

describe('ConfigManager — constructor localStorage integration', () => {
    it('starts with empty state when localStorage is empty', () => {
        const m = new ConfigManager();
        expect(m.getRawText()).toBe('');
        expect(m.getValidText()).toBe('');
        expect(m.isYamlValid()).toBe(true);
        expect(m.getConfig()).toBeNull();
    });

    it('restores validText and config from "apisix-config-text" key', () => {
        storage['apisix-config-text'] = VALID_YAML;
        const m = new ConfigManager();
        expect(m.getValidText()).toBe(VALID_YAML);
        expect(m.getConfig()).not.toBeNull();
    });

    it('uses "apisix-config-text-raw" as rawText when present, keeping validText from the valid key', () => {
        storage['apisix-config-text']     = VALID_YAML;
        storage['apisix-config-text-raw'] = INVALID_YAML_SYNTAX;
        const m = new ConfigManager();
        expect(m.getRawText()).toBe(INVALID_YAML_SYNTAX);
        expect(m.isYamlValid()).toBe(false);
        expect(m.getValidText()).toBe(VALID_YAML);
    });

    it('falls back rawText to the valid key when the raw key is absent', () => {
        storage['apisix-config-text'] = VALID_YAML;
        const m = new ConfigManager();
        expect(m.getRawText()).toBe(VALID_YAML);
    });
});

// ---------------------------------------------------------------------------
// Group 2: setRawText — YAML parsing and localStorage writes
// ---------------------------------------------------------------------------

describe('ConfigManager — setRawText', () => {
    it('parses valid YAML and updates config, validText, and both storage keys', () => {
        const m = new ConfigManager();
        m.setRawText(VALID_YAML);
        expect(m.getRawText()).toBe(VALID_YAML);
        expect(m.getValidText()).toBe(VALID_YAML);
        expect(m.isYamlValid()).toBe(true);
        expect(m.getConfig()).not.toBeNull();
        expect(storage['apisix-config-text']).toBe(VALID_YAML);
        expect(storage['apisix-config-text-raw']).toBe(VALID_YAML);
    });

    it('keeps previous config and validText when given syntactically invalid YAML', () => {
        const m = new ConfigManager();
        m.setRawText(VALID_YAML);
        const configBefore = m.getConfig();

        m.setRawText(INVALID_YAML_SYNTAX);
        expect(m.getRawText()).toBe(INVALID_YAML_SYNTAX);
        expect(m.isYamlValid()).toBe(false);
        expect(m.getConfig()).toBe(configBefore);
        expect(m.getValidText()).toBe(VALID_YAML);
        // raw key is overwritten; valid key retains the last good value
        expect(storage['apisix-config-text-raw']).toBe(INVALID_YAML_SYNTAX);
        expect(storage['apisix-config-text']).toBe(VALID_YAML);
    });

    it('clears all state and removes both storage keys when given an empty string', () => {
        const m = new ConfigManager();
        m.setRawText(VALID_YAML);
        m.setRawText('');
        expect(m.getRawText()).toBe('');
        expect(m.getValidText()).toBe('');
        expect(m.isYamlValid()).toBe(true);
        expect(m.getConfig()).toBeNull();
        expect(storage['apisix-config-text']).toBeUndefined();
        expect(storage['apisix-config-text-raw']).toBeUndefined();
    });

    it('clears all state when a whitespace-only string is set', () => {
        const m = new ConfigManager();
        m.setRawText(VALID_YAML);
        m.setRawText('   \n   ');
        expect(m.getConfig()).toBeNull();
    });

    it('overwrites a previous valid config when a new valid config is set', () => {
        const m = new ConfigManager();
        m.setRawText(VALID_YAML);
        const newYaml = 'routes:\n  - id: route-x\n    uri: /other';
        m.setRawText(newYaml);
        expect(m.getValidText()).toBe(newYaml);
        const routes = (m.getConfig() as Record<string, unknown>)['routes'] as unknown[];
        expect(routes).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// Group 3: validate() — SchemaValidator + ErrorResolver + ValidationLog integration
// ---------------------------------------------------------------------------

describe('ConfigManager — validate()', () => {
    it('returns [] when no config has been set', () => {
        const m = new ConfigManager();
        m.setSchema(makeSchema());
        expect(m.validate()).toEqual([]);
    });

    it('returns a warning when no schema is loaded', () => {
        const m = new ConfigManager();
        m.setRawText(VALID_YAML);
        const logs = m.validate();
        expect(logs).toHaveLength(1);
        expect(logs[0].type).toBe('warning');
        expect(logs[0].message).toMatch(/schema/i);
    });

    it('returns a success log for a fully valid config + schema', () => {
        const m = new ConfigManager();
        m.setSchema(makeSchema());
        m.setRawText(VALID_YAML);
        const logs = m.validate();
        const success = logs.find(l => l.type === 'success');
        expect(success).toBeDefined();
        expect(success!.message).toContain('VALID');
    });

    it('returns error logs when the config violates the schema', () => {
        const m = new ConfigManager();
        m.setSchema(makeSchema());
        m.setRawText(VALID_YAML_SCHEMA_INVALID);
        const logs = m.validate();
        const errors = logs.filter(l => l.type === 'error');
        expect(errors.length).toBeGreaterThan(0);
    });

    it('returns warning logs (not errors) for additional unknown properties', () => {
        const m = new ConfigManager();
        m.setSchema(makeSchema());
        m.setRawText('routes:\n  - id: r1\n    uri: /x\n    unknownField: true');
        const logs = m.validate();
        const warnings = logs.filter(l => l.type === 'warning');
        const errors   = logs.filter(l => l.type === 'error');
        expect(warnings.length).toBeGreaterThan(0);
        expect(errors).toHaveLength(0);
    });

    it('recovers to a success result after correcting an invalid config', () => {
        const m = new ConfigManager();
        m.setSchema(makeSchema());
        m.setRawText(VALID_YAML_SCHEMA_INVALID);
        expect(m.validate().some(l => l.type === 'error')).toBe(true);

        m.setRawText(VALID_YAML);
        const logs = m.validate();
        expect(logs.some(l => l.type === 'success')).toBe(true);
        expect(logs.some(l => l.type === 'error')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Group 4: validateCategory() — SchemaValidator + ErrorResolver path-prefix integration
// ---------------------------------------------------------------------------

describe('ConfigManager — validateCategory()', () => {
    it('returns [] for valid data', () => {
        const m = new ConfigManager();
        m.setSchema(makeSchema());
        expect(m.validateCategory('route', { id: 'r1', uri: '/x' })).toEqual([]);
    });

    it('returns errors for invalid data (missing required field)', () => {
        const m = new ConfigManager();
        m.setSchema(makeSchema());
        const errors = m.validateCategory('route', { id: 'r1' });
        expect(errors.length).toBeGreaterThan(0);
    });

    it('prefixes error paths that start with "/" with the category name', () => {
        const m = new ConfigManager();
        m.setSchema(makeSchema());
        const errors = m.validateCategory('route', { id: 'r1' });
        expect(errors.length).toBeGreaterThan(0);
        for (const err of errors) {
            if (err.path.startsWith('/')) {
                expect(err.path).toMatch(/^route\//);
            }
        }
    });

    it('returns [] when no schema is loaded', () => {
        const m = new ConfigManager();
        expect(m.validateCategory('route', { id: 'r1' })).toEqual([]);
    });

    it('returns [] for an unknown category', () => {
        const m = new ConfigManager();
        m.setSchema(makeSchema());
        expect(m.validateCategory('nonexistent', { foo: 'bar' })).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Group 5: getCategoryEntries() — plural/singular key fallback + display ID logic
// ---------------------------------------------------------------------------

describe('ConfigManager — getCategoryEntries()', () => {
    it('returns [] when no config is loaded', () => {
        const m = new ConfigManager();
        expect(m.getCategoryEntries('route')).toEqual([]);
    });

    it('returns display IDs from plural-keyed arrays (routes)', () => {
        const m = new ConfigManager();
        m.setRawText(VALID_YAML);
        expect(m.getCategoryEntries('route')).toEqual(['route-1', 'route-2']);
    });

    it('falls back to the singular key when the plural key is absent', () => {
        const m = new ConfigManager();
        m.setRawText('upstream:\n  - id: u-1\n  - id: u-2');
        expect(m.getCategoryEntries('upstream')).toEqual(['u-1', 'u-2']);
    });

    it('returns [] when the category key is absent from the config', () => {
        const m = new ConfigManager();
        m.setRawText('routes:\n  - id: r1\n    uri: /x');
        expect(m.getCategoryEntries('upstream')).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Group 6: getCategoryEntry() — lookup by display ID
// ---------------------------------------------------------------------------

describe('ConfigManager — getCategoryEntry()', () => {
    it('returns null when no config is loaded', () => {
        const m = new ConfigManager();
        expect(m.getCategoryEntry('route', 'route-1')).toBeNull();
    });

    it('returns the full entry object for a matching display ID', () => {
        const m = new ConfigManager();
        m.setRawText(VALID_YAML);
        const entry = m.getCategoryEntry('route', 'route-1');
        expect(entry).not.toBeNull();
        expect(entry!['id']).toBe('route-1');
        expect(entry!['uri']).toBe('/api/v1');
    });

    it('returns null for a display ID that does not exist', () => {
        const m = new ConfigManager();
        m.setRawText(VALID_YAML);
        expect(m.getCategoryEntry('route', 'nonexistent')).toBeNull();
    });

    it('distinguishes between entries with different IDs', () => {
        const m = new ConfigManager();
        m.setRawText(VALID_YAML);
        expect(m.getCategoryEntry('route', 'route-2')!['uri']).toBe('/api/v2');
    });

});

// ---------------------------------------------------------------------------
// Group 7: setSchema / getSchema pass-through
// ---------------------------------------------------------------------------

describe('ConfigManager — schema pass-through', () => {
    // Pure getter/setter delegation is already covered by SchemaValidation.test.ts.
    // This test remains because it exercises ConfigManager's own validate() path:
    // after setSchema(null), validate() must return the "no schema" warning — confirming
    // that the two components communicate correctly through the ConfigManager boundary.
    it('setSchema(null) clears the schema and validate() returns a warning', () => {
        const m = new ConfigManager();
        m.setSchema(makeSchema());
        m.setRawText(VALID_YAML);
        m.setSchema(null);
        expect(m.getSchema()).toBeNull();
        const logs = m.validate();
        expect(logs[0].type).toBe('warning');
        expect(logs[0].message).toMatch(/schema/i);
    });
});
