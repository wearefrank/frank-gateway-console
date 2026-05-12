import { describe, it, expect } from 'vitest';
import {
    ValidationLog,
    ValidationLogger,
    getResourceType,
    getResourceName,
    getParentName,
} from '../actions/ValidationLogger';
import type { ErrorObject } from 'ajv';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeError(keyword: string, params: Record<string, unknown> = {}, instancePath = ''): ErrorObject {
    return {
        keyword,
        instancePath,
        schemaPath: `#/${keyword}`,
        params,
        message: `mock ${keyword} error`,
    } as ErrorObject;
}

// ---------------------------------------------------------------------------
// getResourceType
// ---------------------------------------------------------------------------

describe('getResourceType', () => {
    it('returns undefined for undefined input', () => {
        expect(getResourceType(undefined)).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
        expect(getResourceType('')).toBeUndefined();
    });

    it('returns the first segment of a path', () => {
        expect(getResourceType('/routes/0/plugins/limit-count')).toBe('routes');
    });

    it('works without a leading slash', () => {
        expect(getResourceType('consumers/1')).toBe('consumers');
    });
});

// ---------------------------------------------------------------------------
// getResourceName
// ---------------------------------------------------------------------------

describe('getResourceName', () => {
    it('returns undefined when path is undefined', () => {
        expect(getResourceName(undefined, null)).toBeUndefined();
    });

    it('returns undefined when path has no index', () => {
        expect(getResourceName('/routes', null)).toBeUndefined();
    });

    it('returns "Id: <id>" when config entry has an id', () => {
        const config = { routes: [{ id: 'my-route', uri: '/x' }] };
        expect(getResourceName('/routes/0', config)).toBe('Id: my-route');
    });

    it('returns "Name: <name>" when entry has no id but has a name', () => {
        const config = { upstreams: [{ name: 'my-upstream' }] };
        expect(getResourceName('/upstreams/0', config)).toBe('Name: my-upstream');
    });

    it('returns "Username: <username>" when entry has a username', () => {
        const config = { consumers: [{ username: 'alice' }] };
        expect(getResourceName('/consumers/0', config)).toBe('Username: alice');
    });

    it('returns index bracket notation when entry exists but has no identifier fields', () => {
        const config = { routes: [{ uri: '/x' }] };
        expect(getResourceName('/routes/0', config)).toBe('[0]');
    });

    it('falls back to "<resource>[<index>]" when config is null', () => {
        expect(getResourceName('/routes/0', null)).toBe('routes[0]');
    });
});

// ---------------------------------------------------------------------------
// getParentName
// ---------------------------------------------------------------------------

describe('getParentName', () => {
    it('returns undefined when path is undefined', () => {
        expect(getParentName(undefined)).toBeUndefined();
    });

    it('returns the plugin name following "plugins" in the path', () => {
        expect(getParentName('/routes/0/plugins/limit-count')).toBe('limit-count');
    });

    it('returns undefined when "plugins" is the last segment', () => {
        expect(getParentName('/routes/0/plugins')).toBeUndefined();
    });

    it('returns undefined when path has no "plugins" segment', () => {
        expect(getParentName('/routes/0/uri')).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// ValidationLog
// ---------------------------------------------------------------------------

describe('ValidationLog', () => {
    it('stores type and message', () => {
        const log = new ValidationLog('error', 'something went wrong');
        expect(log.type).toBe('error');
        expect(log.message).toBe('something went wrong');
    });

    it('uses errorObject.instancePath when no explicit path given', () => {
        const err = makeError('required', {}, '/routes/0');
        const log = new ValidationLog('error', 'test', undefined, err);
        expect(log.path).toBe('/routes/0');
    });

    it('explicit path takes precedence over errorObject.instancePath', () => {
        const err = makeError('required', {}, '/routes/0');
        const log = new ValidationLog('error', 'test', '/my/path', err);
        expect(log.path).toBe('/my/path');
    });

    it('formatErrorMessage handles "required" keyword', () => {
        const err = makeError('required', { missingProperty: 'uri' });
        const log = new ValidationLog('error', 'fallback', undefined, err);
        const msg = log.formatErrorMessage();
        expect(msg).toContain('uri');
        expect(msg).toContain('missing');
    });

    it('formatErrorMessage handles "additionalProperties" keyword', () => {
        const err = makeError('additionalProperties', { additionalProperty: 'badField' });
        const log = new ValidationLog('warning', 'fallback', undefined, err);
        const msg = log.formatErrorMessage();
        expect(msg).toContain('badField');
    });

    it('formatErrorMessage returns the message for unknown keywords', () => {
        const err = makeError('type', {});
        const log = new ValidationLog('error', 'original message', undefined, err);
        expect(log.formatErrorMessage()).toBe('original message');
    });

    it('formatErrorMessage returns message when no errorObject', () => {
        const log = new ValidationLog('info', 'plain message');
        expect(log.formatErrorMessage()).toBe('plain message');
    });

    it('getResourceType delegates to path parsing', () => {
        const log = new ValidationLog('error', 'x', '/routes/0/plugins/limit-count');
        expect(log.getResourceType()).toBe('routes');
    });

    it('getParentName returns plugin name', () => {
        const log = new ValidationLog('error', 'x', '/routes/0/plugins/limit-count');
        expect(log.getParentName()).toBe('limit-count');
    });
});

// ---------------------------------------------------------------------------
// ValidationLogger
// ---------------------------------------------------------------------------

describe('ValidationLogger', () => {
    it('starts empty', () => {
        const logger = new ValidationLogger();
        expect(logger.getLogs()).toHaveLength(0);
    });

    it('add() appends a log and returns it', () => {
        const logger = new ValidationLogger();
        const log = logger.add('info', 'hello');
        expect(logger.getLogs()).toHaveLength(1);
        expect(logger.getLogs()[0]).toBe(log);
    });

    it('add() accumulates multiple logs', () => {
        const logger = new ValidationLogger();
        logger.add('info', 'a');
        logger.add('error', 'b');
        logger.add('warning', 'c');
        expect(logger.getLogs()).toHaveLength(3);
    });

    it('clear() empties the log list', () => {
        const logger = new ValidationLogger();
        logger.add('info', 'a');
        logger.add('info', 'b');
        logger.clear();
        expect(logger.getLogs()).toHaveLength(0);
    });

    it('add() with path and errorObject stores them on the log', () => {
        const logger = new ValidationLogger();
        const err = makeError('required', { missingProperty: 'id' }, '/routes/0');
        const log = logger.add('error', 'msg', '/routes/0', err);
        expect(log.path).toBe('/routes/0');
        expect(log.getErrorObject()).toBe(err);
    });
});
