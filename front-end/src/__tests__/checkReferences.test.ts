import { describe, it, expect } from 'vitest';
import { getUsages, checkReferences } from '../pages/yamlEditor/actions/checkReferences';
import type { ApisixConfig } from '../actions/SchemaValidation';

// ---------------------------------------------------------------------------
// getUsages
// ---------------------------------------------------------------------------

describe('getUsages', () => {
    it('finds a route that references the given upstream id', () => {
        const config: ApisixConfig = {
            routes: [{ id: 'route-1', upstream_id: 'up-1' }],
            upstreams: [{ id: 'up-1' }],
        };
        const usages = getUsages(config, 'upstream', 'up-1');
        expect(usages).toHaveLength(1);
        expect(usages[0]).toMatchObject({ fromCategory: 'route', fromIndex: 0, field: 'upstream_id' });
    });

    it('returns an empty array when nothing references the id', () => {
        const config: ApisixConfig = {
            routes: [{ id: 'route-1', upstream_id: 'up-1' }],
        };
        expect(getUsages(config, 'upstream', 'up-2')).toHaveLength(0);
    });

    it('matches ids across string/number representations', () => {
        const config: ApisixConfig = {
            routes: [{ id: 'route-1', upstream_id: 42 }],
        };
        expect(getUsages(config, 'upstream', '42')).toHaveLength(1);
    });

    it('ignores categories whose collection is missing or not an array', () => {
        const config: ApisixConfig = {};
        expect(getUsages(config, 'upstream', 'up-1')).toHaveLength(0);
    });

    it('collects usages from multiple referencing categories', () => {
        const config: ApisixConfig = {
            routes: [{ id: 'route-1', service_id: 'svc-1' }],
            services: [{ id: 'svc-2', upstream_id: 'svc-1-target' }],
        };
        // "service" is referenced only by routes' service_id in this fixture
        const usages = getUsages(config, 'service', 'svc-1');
        expect(usages).toHaveLength(1);
        expect(usages[0].fromCategory).toBe('route');
    });
});

// ---------------------------------------------------------------------------
// checkReferences
// ---------------------------------------------------------------------------

describe('checkReferences', () => {
    it('returns no logs for a fully valid config', () => {
        const config: ApisixConfig = {
            routes: [{ id: 'route-1', upstream_id: 'up-1' }],
            upstreams: [{ id: 'up-1' }],
        };
        expect(checkReferences(config)).toHaveLength(0);
    });

    it('warns when a route references a nonexistent upstream', () => {
        const config: ApisixConfig = {
            routes: [{ id: 'route-1', upstream_id: 'missing-upstream' }],
        };
        const logs = checkReferences(config);
        expect(logs).toHaveLength(1);
        expect(logs[0].type).toBe('warning');
        expect(logs[0].message).toContain('missing-upstream');
        expect(logs[0].message).toContain('upstreams');
    });

    it('warns when a route references a nonexistent plugin_config', () => {
        const config: ApisixConfig = {
            routes: [{ id: 'route-1', plugin_config_id: 'missing-pc' }],
        };
        const logs = checkReferences(config);
        expect(logs.some(l => l.message.includes('plugin_config_id') && l.message.includes('missing-pc'))).toBe(true);
    });

    it('does not warn about reference fields that are absent', () => {
        const config: ApisixConfig = {
            routes: [{ id: 'route-1' }],
        };
        expect(checkReferences(config)).toHaveLength(0);
    });

    it('reports duplicate ids within the same category as errors', () => {
        const config: ApisixConfig = {
            upstreams: [{ id: 'dup' }, { id: 'dup' }],
        };
        const logs = checkReferences(config);
        const dupLog = logs.find(l => l.message.includes('Duplicate'));
        expect(dupLog).toBeDefined();
        expect(dupLog!.type).toBe('error');
        expect(dupLog!.message).toContain('appears 2 times');
    });

    it('does not report duplicates for consumers, which key on username not id', () => {
        const config: ApisixConfig = {
            consumers: [{ username: 'alice' }, { username: 'bob' }],
        };
        expect(checkReferences(config).some(l => l.message.includes('Duplicate'))).toBe(false);
    });

    it('reports duplicate usernames for consumers', () => {
        const config: ApisixConfig = {
            consumers: [{ username: 'alice' }, { username: 'alice' }],
        };
        const logs = checkReferences(config);
        expect(logs.some(l => l.message.includes('Duplicate consumer username "alice"'))).toBe(true);
    });
});
