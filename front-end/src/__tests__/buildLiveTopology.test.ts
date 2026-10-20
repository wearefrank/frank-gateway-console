import { describe, it, expect } from 'vitest';
import { buildLiveTopology, nodeSignature, DENIED_ON } from '../pages/topology/buildLiveTopology';
import type { LiveRoute, LiveUpstream } from '../components/Dashboard/dashboardTypes';

// The fixtures below are trimmed copies of what a running Frank!Gateway answered on
// /v1/routes and /v1/upstreams, so the field names match the real control API rather
// than the config-file spelling: `key` is "/routes/<id>", plugins arrive with their
// schema defaults filled in, and upstream nodes carry the resolved IP plus `domain`.

const routes: LiveRoute[] = [
    {
        key: '/routes/system-a-to-system-b-route',
        value: {
            name: 'system-a-to-system-b-route',
            id: 'system-a-to-system-b-route',
            uri: '/system-a/system-b/*',
            upstream_id: 'system-b-sender',
            status: 1,
            plugins: {
                'key-auth': { hide_credentials: false, query: 'apikey', realm: 'key', header: 'apikey' },
                'consumer-restriction': { whitelist: ['system-a-client-allowed'], type: 'consumer_name', rejected_code: 403 },
            },
        },
    },
    {
        key: '/routes/system-c-to-system-a-route',
        value: {
            name: 'system-c-to-system-a-route',
            id: 'system-c-to-system-a-route',
            uri: '/system-c/system-a/*',
            upstream_id: 'system-a-sender',
            status: 1,
        },
    },
    {
        key: '/routes/local-status',
        value: {
            name: 'local-status',
            id: 'local-status',
            uri: '/local/status/*',
            upstream_id: 'system-a-sender',
            status: 1,
        },
    },
];

const upstreams: LiveUpstream[] = [
    {
        key: '/upstreams/system-b-sender',
        value: {
            id: 'system-b-sender',
            name: 'system-b-sender',
            desc: 'System B API (local mock)',
            type: 'roundrobin',
            scheme: 'http',
            pass_host: 'node',
            nodes: [{ host: '172.18.0.4', port: 8080, weight: 1 }],
            dns_nodes: [{ host: 'system-b-mock', port: 8080, weight: 1 }],
        },
    },
    {
        key: '/upstreams/system-a-sender',
        value: {
            id: 'system-a-sender',
            name: 'system-a-sender',
            desc: 'System A API (local mock)',
            type: 'roundrobin',
            scheme: 'http',
            nodes: [{ host: '172.18.0.2', port: 8080, weight: 1 }],
        },
    },
];

describe('buildLiveTopology', () => {
    it('makes one node per live resource', () => {
        const { nodes } = buildLiveTopology({ routes, services: [], upstreams });

        expect(nodes.map(n => n.id).sort()).toEqual([
            // Not a control-API resource — read out of the route's consumer-restriction list.
            'consumer-system-a-client-allowed',
            'route-system-a-to-system-b-route',
            'route-system-c-to-system-a-route',
            'route-local-status',
            'upstream-system-b-sender',
            'upstream-system-a-sender',
        ]);
    });

    it('connects each route to the upstream the gateway reports', () => {
        const { edges } = buildLiveTopology({ routes, services: [], upstreams });

        expect(edges.map(e => `${e.source}->${e.target}`).sort()).toEqual([
            'consumer-system-a-client-allowed->route-system-a-to-system-b-route',
            'route-system-a-to-system-b-route->upstream-system-b-sender',
            'route-system-c-to-system-a-route->upstream-system-a-sender',
            'route-local-status->upstream-system-a-sender',
        ]);
    });

    it('lets two routes share one upstream node', () => {
        const { edges } = buildLiveTopology({ routes, services: [], upstreams });
        const intoSystemA = edges.filter(e => e.target === 'upstream-system-a-sender');

        expect(intoSystemA).toHaveLength(2);
    });

    it('uses handle ids ConfigNode renders', () => {
        const { edges } = buildLiveTopology({ routes, services: [], upstreams });

        expect(edges[0].sourceHandle).toBe('source-upstream');
        expect(edges[0].targetHandle).toBe('target-from-route');
    });

    it('drops a reference the gateway cannot resolve', () => {
        const dangling: LiveRoute[] = [{
            key: '/routes/orphan',
            value: { id: 'orphan', uri: '/orphan', status: 1, upstream_id: 'deleted-upstream' },
        }];
        const { nodes, edges } = buildLiveTopology({ routes: dangling, services: [], upstreams: [] });

        expect(nodes.map(n => n.id)).toEqual(['route-orphan']);
        expect(edges).toEqual([]);
    });

    it('survives the control API answering with nothing', () => {
        expect(buildLiveTopology({ routes: null, services: null, upstreams: null }))
            .toEqual({ nodes: [], edges: [] });
    });

    it('joins routes to services, and services on to upstreams', () => {
        const viaService: LiveRoute[] = [{
            key: '/routes/via-service',
            value: { id: 'via-service', uri: '/via', status: 1, service_id: 'svc-1' },
        }];
        const { edges } = buildLiveTopology({
            routes: viaService,
            services: [{ key: '/services/svc-1', value: { id: 'svc-1', name: 'svc-1', upstream_id: 'system-a-sender' } }],
            upstreams,
        });

        expect(edges.map(e => `${e.source}->${e.target}`).sort()).toEqual([
            'route-via-service->service-svc-1',
            'service-svc-1->upstream-system-a-sender',
        ]);
    });
});

describe('consumers derived from consumer-restriction', () => {
    it('mints a node for a whitelisted username and connects it to the route', () => {
        const { nodes, edges } = buildLiveTopology({ routes, services: [], upstreams });

        expect(nodes.some(n => n.id === 'consumer-system-a-client-allowed')).toBe(true);
        expect(edges.map(e => `${e.source}->${e.target}`))
            .toContain('consumer-system-a-client-allowed->route-system-a-to-system-b-route');
    });

    // APISIX fills the default in, so a live route says "consumer_name" where the config
    // file said nothing at all. Reading it as a non-consumer type loses every restriction.
    it('accepts the type APISIX reports by default', () => {
        const { nodes } = buildLiveTopology({ routes, services: [], upstreams });
        const consumers = nodes.filter(n => n.data.category === 'consumer');

        expect(consumers).toHaveLength(1);
    });

    it('ignores lists scoped to something other than usernames', () => {
        const byService: LiveRoute[] = [{
            key: '/routes/r1',
            value: {
                id: 'r1', uri: '/r1', status: 1,
                plugins: { 'consumer-restriction': { type: 'service_id', whitelist: ['svc-1'] } },
            },
        }];
        const { nodes } = buildLiveTopology({ routes: byService, services: [], upstreams: [] });

        expect(nodes.filter(n => n.data.category === 'consumer')).toEqual([]);
    });

    it('labels the edge with the credential the route asks for', () => {
        const { edges } = buildLiveTopology({ routes, services: [], upstreams });
        const authEdge = edges.find(e => e.source === 'consumer-system-a-client-allowed');

        expect(authEdge?.label).toBe('key-auth');
        expect(authEdge?.sourceHandle).toBe('source-auth-route');
        expect(authEdge?.targetHandle).toBe('target-from-consumer');
    });

    it('gives a blacklisted consumer a node but no edge', () => {
        const denied: LiveRoute[] = [{
            key: '/routes/r1',
            value: {
                id: 'r1', uri: '/r1', status: 1,
                plugins: { 'consumer-restriction': { type: 'consumer_name', blacklist: ['blocked-client'] } },
            },
        }];
        const { nodes, edges } = buildLiveTopology({ routes: denied, services: [], upstreams: [] });

        const blocked = nodes.find(n => n.id === 'consumer-blocked-client');

        expect(blocked?.data.entry[DENIED_ON]).toEqual(['route-r1']);
        expect(edges).toEqual([]);
    });

    it('marks a consumer that one route whitelists and another blacklists', () => {
        const mixed: LiveRoute[] = [
            {
                key: '/routes/allow', value: {
                    id: 'allow', uri: '/allow', status: 1,
                    plugins: { 'consumer-restriction': { type: 'consumer_name', whitelist: ['mixed-client'] } },
                },
            },
            {
                key: '/routes/deny', value: {
                    id: 'deny', uri: '/deny', status: 1,
                    plugins: { 'consumer-restriction': { type: 'consumer_name', blacklist: ['mixed-client'] } },
                },
            },
        ];
        const { nodes, edges } = buildLiveTopology({ routes: mixed, services: [], upstreams: [] });
        const consumers = nodes.filter(n => n.data.category === 'consumer');

        expect(consumers).toHaveLength(1);
        expect(consumers[0].data.entry[DENIED_ON]).toEqual(['route-deny']);
        expect(edges.map(e => e.target)).toEqual(['route-allow']);
    });

    it('names one consumer once when several routes whitelist it', () => {
        const twice: LiveRoute[] = ['r1', 'r2'].map(id => ({
            key: `/routes/${id}`,
            value: {
                id, uri: `/${id}`, status: 1,
                plugins: { 'consumer-restriction': { type: 'consumer_name', whitelist: ['shared-client'] } },
            },
        }));
        const { nodes, edges } = buildLiveTopology({ routes: twice, services: [], upstreams: [] });

        expect(nodes.filter(n => n.data.category === 'consumer')).toHaveLength(1);
        expect(edges).toHaveLength(2);
    });
});

describe('inline upstreams', () => {
    const inlineRoute = (id: string, upstream: Record<string, unknown>): LiveRoute => ({
        key: `/routes/${id}`,
        value: { id, uri: `/${id}`, status: 1, upstream },
    });

    it('lets two routes with the same backends share one upstream node', () => {
        const { nodes, edges } = buildLiveTopology({
            routes: [
                inlineRoute('r1', { type: 'roundrobin', nodes: [{ host: 'backend', port: 8080, weight: 1 }] }),
                inlineRoute('r2', { type: 'roundrobin', nodes: [{ host: 'backend', port: 8080, weight: 1 }] }),
            ],
            services: [], upstreams: [],
        });

        expect(nodes.filter(n => n.data.category === 'upstream')).toHaveLength(1);
        expect(edges).toHaveLength(2);
    });

    it('keeps different backends apart', () => {
        const { nodes } = buildLiveTopology({
            routes: [
                inlineRoute('r1', { nodes: [{ host: 'a', port: 80, weight: 1 }] }),
                inlineRoute('r2', { nodes: [{ host: 'b', port: 80, weight: 1 }] }),
            ],
            services: [], upstreams: [],
        });

        expect(nodes.filter(n => n.data.category === 'upstream')).toHaveLength(2);
    });

    it('prefers the id APISIX reports over the backends', () => {
        const { nodes } = buildLiveTopology({
            routes: [inlineRoute('r1', { id: 'gateway-id', nodes: [{ host: 'a', port: 80, weight: 1 }] })],
            services: [], upstreams: [],
        });

        expect(nodes.some(n => n.id === 'upstream-gateway-id')).toBe(true);
    });

    it('keys a discovery upstream on the service it looks up', () => {
        const { nodes, edges } = buildLiveTopology({
            routes: [
                inlineRoute('r1', { discovery_type: 'dns', service_name: 'billing.local' }),
                inlineRoute('r2', { discovery_type: 'dns', service_name: 'billing.local' }),
            ],
            services: [], upstreams: [],
        });

        expect(nodes.filter(n => n.data.category === 'upstream')).toHaveLength(1);
        expect(edges).toHaveLength(2);
    });

    it('still draws an upstream that identifies itself with nothing at all', () => {
        const { nodes } = buildLiveTopology({
            routes: [inlineRoute('r1', { type: 'roundrobin' }), inlineRoute('r2', { type: 'roundrobin' })],
            services: [], upstreams: [],
        });

        expect(nodes.filter(n => n.data.category === 'upstream')).toHaveLength(2);
    });
});

describe('nodeSignature', () => {
    it('is stable regardless of the order APISIX sent the nodes in', () => {
        const a = nodeSignature([{ host: 'b', port: 80, weight: 1 }, { host: 'a', port: 90, weight: 1 }]);
        const b = nodeSignature([{ host: 'a', port: 90, weight: 1 }, { host: 'b', port: 80, weight: 1 }]);

        expect(a).toBe(b);
        expect(a).toBe('a:90,b:80');
    });

    it('reads the {"host:port": weight} map form too', () => {
        expect(nodeSignature({ 'system-a-mock:8080': 1 })).toBe('system-a-mock:8080');
    });
});
