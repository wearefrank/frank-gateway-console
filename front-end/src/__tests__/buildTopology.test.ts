import { describe, it, expect } from 'vitest';
import type { Edge } from '@xyflow/react';
import { getConnectedNodeIds, buildTopology } from '../pages/topology/buildTopology';
import type { ApisixConfig } from '../actions/SchemaValidation';

// ---------------------------------------------------------------------------
// getConnectedNodeIds
// ---------------------------------------------------------------------------

describe('getConnectedNodeIds', () => {
    function edge(source: string, target: string): Edge {
        return { id: `${source}->${target}`, source, target };
    }

    it('always includes the start node', () => {
        expect(getConnectedNodeIds('a', [])).toEqual(new Set(['a']));
    });

    it('follows outgoing edges downstream', () => {
        const edges = [edge('a', 'b'), edge('b', 'c')];
        expect(getConnectedNodeIds('a', edges)).toEqual(new Set(['a', 'b', 'c']));
    });

    it('follows incoming edges upstream', () => {
        const edges = [edge('x', 'a'), edge('w', 'x')];
        expect(getConnectedNodeIds('a', edges)).toEqual(new Set(['a', 'x', 'w']));
    });

    it('does not pull in unrelated siblings reached only through the opposite direction', () => {
        // b -> a -> c: from a's perspective, b is upstream and c is downstream.
        // d is a sibling of a with no path to/from a, so it must be excluded.
        const edges = [edge('b', 'a'), edge('a', 'c'), edge('b', 'd')];
        const result = getConnectedNodeIds('a', edges);
        expect(result).toEqual(new Set(['a', 'b', 'c']));
        expect(result.has('d')).toBe(false);
    });

    it('does not infinite-loop on cycles', () => {
        const edges = [edge('a', 'b'), edge('b', 'a')];
        expect(getConnectedNodeIds('a', edges)).toEqual(new Set(['a', 'b']));
    });
});

// ---------------------------------------------------------------------------
// buildTopology
// ---------------------------------------------------------------------------

describe('buildTopology', () => {
    it('creates one node per resource entry, id-prefixed by category', () => {
        const config: ApisixConfig = {
            routes: [{ id: 'route-1' }],
            upstreams: [{ id: 'upstream-1' }],
        };
        const { nodes } = buildTopology(config);
        const ids = nodes.map(n => n.id);
        expect(ids).toContain('route-route-1');
        expect(ids).toContain('upstream-upstream-1');
    });

    it('creates a forward edge from a route to its upstream', () => {
        const config: ApisixConfig = {
            routes: [{ id: 'route-1', upstream_id: 'upstream-1' }],
            upstreams: [{ id: 'upstream-1' }],
        };
        const { edges } = buildTopology(config);
        const edge = edges.find(e => e.id === 'route-route-1->upstream-upstream-1');
        expect(edge).toBeDefined();
        expect(edge!.source).toBe('route-route-1');
        expect(edge!.target).toBe('upstream-upstream-1');
    });

    it('creates a reverse edge from plugin_config to the route referencing it', () => {
        const config: ApisixConfig = {
            routes: [{ id: 'route-1', plugin_config_id: 'pc-1' }],
            plugin_configs: [{ id: 'pc-1' }],
        };
        const { edges } = buildTopology(config);
        // reverse direction: edge runs plugin_config -> route
        const edge = edges.find(e => e.id === 'plugin_config-pc-1->route-route-1');
        expect(edge).toBeDefined();
        expect(edge!.source).toBe('plugin_config-pc-1');
        expect(edge!.target).toBe('route-route-1');
    });

    it('does not create an edge when the referenced entry does not exist', () => {
        const config: ApisixConfig = {
            routes: [{ id: 'route-1', upstream_id: 'missing' }],
        };
        const { edges } = buildTopology(config);
        expect(edges).toHaveLength(0);
    });

    it('connects a consumer to a route sharing an auth plugin', () => {
        const config: ApisixConfig = {
            consumers: [{ username: 'alice', plugins: { 'key-auth': { key: 'abc' } } }],
            routes: [{ id: 'route-1', plugins: { 'key-auth': {} } }],
        };
        const { edges } = buildTopology(config);
        const edge = edges.find(e => e.source === 'consumer-alice' && e.target === 'route-route-1');
        expect(edge).toBeDefined();
        expect(edge!.label).toBe('key-auth');
    });

    it('does not connect a consumer and route that share no auth plugin', () => {
        const config: ApisixConfig = {
            consumers: [{ username: 'alice', plugins: { 'key-auth': {} } }],
            routes: [{ id: 'route-1', plugins: { 'jwt-auth': {} } }],
        };
        const { edges } = buildTopology(config);
        expect(edges.some(e => e.source === 'consumer-alice')).toBe(false);
    });

    it('inherits auth plugins from a route\'s plugin_config for consumer edges', () => {
        const config: ApisixConfig = {
            consumers: [{ username: 'alice', plugins: { 'key-auth': {} } }],
            routes: [{ id: 'route-1', plugin_config_id: 'pc-1' }],
            plugin_configs: [{ id: 'pc-1', plugins: { 'key-auth': {} } }],
        };
        const { edges } = buildTopology(config);
        const edge = edges.find(e => e.source === 'consumer-alice' && e.target === 'route-route-1');
        expect(edge).toBeDefined();
    });

    it('respects a consumer-restriction whitelist on the target resource', () => {
        const config: ApisixConfig = {
            consumers: [
                { username: 'alice', plugins: { 'key-auth': {} } },
                { username: 'bob', plugins: { 'key-auth': {} } },
            ],
            routes: [{
                id: 'route-1',
                plugins: {
                    'key-auth': {},
                    'consumer-restriction': { whitelist: ['alice'] },
                },
            }],
        };
        const { edges } = buildTopology(config);
        expect(edges.some(e => e.source === 'consumer-alice' && e.target === 'route-route-1')).toBe(true);
        expect(edges.some(e => e.source === 'consumer-bob' && e.target === 'route-route-1')).toBe(false);
    });

    it('respects a consumer-restriction blacklist on the target resource', () => {
        const config: ApisixConfig = {
            consumers: [
                { username: 'alice', plugins: { 'key-auth': {} } },
                { username: 'bob', plugins: { 'key-auth': {} } },
            ],
            routes: [{
                id: 'route-1',
                plugins: {
                    'key-auth': {},
                    'consumer-restriction': { blacklist: ['bob'] },
                },
            }],
        };
        const { edges } = buildTopology(config);
        expect(edges.some(e => e.source === 'consumer-alice' && e.target === 'route-route-1')).toBe(true);
        expect(edges.some(e => e.source === 'consumer-bob' && e.target === 'route-route-1')).toBe(false);
    });

    it('ignores a consumer-restriction whose type is not "consumer"', () => {
        const config: ApisixConfig = {
            consumers: [{ username: 'alice', plugins: { 'key-auth': {} } }],
            routes: [{
                id: 'route-1',
                plugins: {
                    'key-auth': {},
                    'consumer-restriction': { type: 'service', whitelist: ['someone-else'] },
                },
            }],
        };
        const { edges } = buildTopology(config);
        expect(edges.some(e => e.source === 'consumer-alice' && e.target === 'route-route-1')).toBe(true);
    });
});
