import { describe, it, expect } from 'vitest';
import { getDisplayId, getIdField } from '../config/categoryDefinitions';

// ---------------------------------------------------------------------------
// getIdField
// ---------------------------------------------------------------------------

describe('getIdField', () => {
    it('returns "id" for standard resource categories', () => {
        expect(getIdField('route')).toBe('id');
        expect(getIdField('upstream')).toBe('id');
        expect(getIdField('service')).toBe('id');
    });

    it('returns "username" for the consumer category', () => {
        expect(getIdField('consumer')).toBe('username');
    });

    it('falls back to "id" for an unknown category', () => {
        expect(getIdField('nonexistent')).toBe('id');
    });
});

// ---------------------------------------------------------------------------
// getDisplayId — idField resolution
// ---------------------------------------------------------------------------

describe('getDisplayId — idField', () => {
    it('returns the id field value for standard categories', () => {
        expect(getDisplayId('route', { id: 'my-route', uri: '/x' })).toBe('my-route');
    });

    // Moved from ConfigManager.test.ts: this tests getDisplayId's idField lookup
    // (idField: 'username' for consumers), not ConfigManager's own logic.
    it('returns the username field as display ID for consumers', () => {
        expect(getDisplayId('consumer', { username: 'alice' })).toBe('alice');
    });

    it('returns the id field even when other fields are present', () => {
        expect(getDisplayId('upstream', { id: 'u-1', name: 'my-upstream' })).toBe('u-1');
    });
});

// ---------------------------------------------------------------------------
// getDisplayId — fallback field resolution
// ---------------------------------------------------------------------------

describe('getDisplayId — fallbackFields', () => {
    it('falls back to "name" when id is absent', () => {
        expect(getDisplayId('upstream', { name: 'my-upstream' })).toBe('my-upstream');
    });

    it('falls back to "uri" for routes when id is absent', () => {
        expect(getDisplayId('route', { uri: '/api/v1' })).toBe('/api/v1');
    });

    it('uses the first non-empty fallback field when id is absent', () => {
        // route fallbackFields order is: name, uri, uris, host
        expect(getDisplayId('route', { name: 'my-route', uri: '/x' })).toBe('my-route');
    });

    it('falls back to the first array element when fallback field value is an array', () => {
        expect(getDisplayId('route', { uris: ['/a', '/b'] })).toBe('/a');
    });
});

// ---------------------------------------------------------------------------
// getDisplayId — last-resort fallbacks
// ---------------------------------------------------------------------------

describe('getDisplayId — last-resort fallbacks', () => {
    it('falls back to the first non-empty string value when no idField or fallbackField matches', () => {
        // global_rule has no fallbackFields; any string value on the entry is used
        const result = getDisplayId('global_rule', { plugins: 'limit-count' });
        expect(result).toBe('limit-count');
    });

    it('returns "#<index>" when the entry has no usable fields', () => {
        expect(getDisplayId('route', {}, 3)).toBe('#3');
    });

    it('returns "#0" when index is omitted and no fields match', () => {
        expect(getDisplayId('route', {})).toBe('#0');
    });
});
