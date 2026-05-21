import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';

/**
 * BFS from `startId` through the edge graph using directional queues:
 * - Nodes reached via an *output* edge only continue following outputs.
 * - Nodes reached via an *input* edge only continue following inputs.
 * This prevents unrelated sibling nodes from being pulled into the focus set.
 */
export function getConnectedNodeIds(startId: string, edges: Edge[]): Set<string> {
    const visited    = new Set([startId]);
    const downQueue: string[] = []; // reached via output — expand outputs only
    const upQueue:   string[] = []; // reached via input  — expand inputs only

    for (const e of edges) {
        if (e.source === startId && !visited.has(e.target)) { visited.add(e.target); downQueue.push(e.target); }
        if (e.target === startId && !visited.has(e.source)) { visited.add(e.source); upQueue.push(e.source); }
    }
    while (downQueue.length) {
        const id = downQueue.shift()!;
        for (const e of edges)
            if (e.source === id && !visited.has(e.target)) { visited.add(e.target); downQueue.push(e.target); }
    }
    while (upQueue.length) {
        const id = upQueue.shift()!;
        for (const e of edges)
            if (e.target === id && !visited.has(e.source)) { visited.add(e.source); upQueue.push(e.source); }
    }
    return visited;
}
import type { ApisixConfig, ResourceConfiguration } from '../../actions/SchemaValidation';
import { getIdField, getDisplayId } from '../../config/categoryDefinitions';

export type ColorScheme = 'source' | 'destination';

export interface ConfigNodeData extends Record<string, unknown> {
    category: string;
    entry: ResourceConfiguration;
}

const NODE_WIDTH  = 240;
const NODE_HEIGHT = 170;

// Source-scheme styles (color = source node)
const ROUTE_EDGE_STYLE        = { stroke: '#3b82f6' };
const ROUTE_PLUGIN_EDGE_STYLE = { stroke: '#3b82f6', strokeDasharray: '5 3' };
const SERVICE_EDGE_STYLE      = { stroke: '#f97316' };

// Destination-scheme styles (color = destination node)
const DEST_UPSTREAM_EDGE_STYLE = { stroke: '#22c55e' };
const DEST_SERVICE_EDGE_STYLE  = { stroke: '#f97316' };
const DEST_PLUGIN_EDGE_STYLE   = { stroke: '#f59e0b', strokeDasharray: '5 3' };

// Destination-scheme consumer edge colors (keyed by the target category)
const DEST_CONSUMER_EDGE_COLORS: Record<string, string> = {
    route: '#3b82f6',
    service: '#f97316',
    plugin_config: '#f59e0b',
};

const EDGE_LABEL_STYLE = { fontSize: '9px', fill: '#cbd5e1' };
const EDGE_LABEL_BG_STYLE = { fill: '#1e293b', fillOpacity: 0.9, rx: 3, ry: 3 };

function nodeId(category: string, entry: ResourceConfiguration, index?: number): string {
    return `${category}-${getDisplayId(category, entry as Record<string, unknown>, index)}`;
}

// Auth plugins whose presence on both a consumer and another resource implies a connection
const AUTH_PLUGINS = new Set([
    'key-auth', 'basic-auth', 'jwt-auth', 'hmac-auth',
    'wolf-rbac', 'openid-connect', 'cas-auth', 'forward-auth',
    'opa', 'ldap-auth', 'multi-auth',
]);

function authPluginNames(entry: ResourceConfiguration): Set<string> {
    const plugins = entry['plugins'];
    if (!plugins || typeof plugins !== 'object' || Array.isArray(plugins)) return new Set();
    return new Set(
        Object.keys(plugins as Record<string, unknown>).filter(p => AUTH_PLUGINS.has(p))
    );
}

export function buildTopology(config: ApisixConfig, colorScheme: ColorScheme = 'source'): { nodes: Node<ConfigNodeData>[]; edges: Edge[] } {
    const nodes: Node<ConfigNodeData>[] = [];
    const edges: Edge[] = [];

    // Build a dagre graph for automatic layout
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 });
    g.setDefaultEdgeLabel(() => ({}));

    const categories = [
        'consumer', 'ssl',
        'route', 'global_rule',
        'service', 'plugin_config',
        'upstream',
    ] as const;

    // First pass: collect nodes and build a reference registry.
    // Registry maps "category-originalId" -> resolved node ID so that edge lookups
    // work even when a node's ID was derived from a fallback (no id field).
    const refRegistry = new Map<string, string>();

    const resolveRef = (category: string, refId: unknown): string | null => {
        if (refId === undefined || refId === null) return null;
        return refRegistry.get(`${category}-${String(refId)}`) ?? null;
    };

    for (const category of categories) {
        const raw = (config as Record<string, unknown>)[category + 's'];
        if (!Array.isArray(raw)) continue;

        for (let i = 0; i < (raw as ResourceConfiguration[]).length; i++) {
            const entry = (raw as ResourceConfiguration[])[i];
            const id = nodeId(category, entry, i);

            // Register by original id/username so other entries can reference this node
            const originalId = entry[getIdField(category)];
            if (originalId !== undefined && originalId !== null) {
                refRegistry.set(`${category}-${String(originalId)}`, id);
            }

            nodes.push({
                id,
                type: 'configNode',
                position: { x: 0, y: 0 }, // overwritten after dagre.layout()
                data: { category, entry },
            });

            g.setNode(id, { width: NODE_WIDTH, height: NODE_HEIGHT });
        }
    }

    // Second pass: collect edges using the registry for all reference lookups
    for (const node of nodes) {
        const { category, entry } = node.data;

        if (category === 'route') {
            const upstreamTarget = resolveRef('upstream', entry['upstream_id']);
            if (upstreamTarget) {
                edges.push({
                    id: `${node.id}->${upstreamTarget}`,
                    source: node.id,
                    target: upstreamTarget,
                    sourceHandle: 'source-upstream',
                    targetHandle: 'target-from-route',
                    type: 'smoothstep',
                    label: 'upstream',
                    labelStyle: EDGE_LABEL_STYLE,
                    labelBgStyle: EDGE_LABEL_BG_STYLE,
                    animated: true,
                    style: colorScheme === 'source' ? ROUTE_EDGE_STYLE : DEST_UPSTREAM_EDGE_STYLE,
                });
                g.setEdge(node.id, upstreamTarget);
            }
            const serviceTarget = resolveRef('service', entry['service_id']);
            if (serviceTarget) {
                edges.push({
                    id: `${node.id}->${serviceTarget}`,
                    source: node.id,
                    target: serviceTarget,
                    sourceHandle: 'source-service',
                    targetHandle: 'target-from-route',
                    type: 'smoothstep',
                    label: 'service',
                    labelStyle: EDGE_LABEL_STYLE,
                    labelBgStyle: EDGE_LABEL_BG_STYLE,
                    style: colorScheme === 'source' ? ROUTE_EDGE_STYLE : DEST_SERVICE_EDGE_STYLE,
                });
                g.setEdge(node.id, serviceTarget);
            }
            const pluginConfigSource = resolveRef('plugin_config', entry['plugin_config_id']);
            if (pluginConfigSource) {
                // plugin_config flows INTO the route (it's applied to the route, not an output)
                edges.push({
                    id: `${pluginConfigSource}->${node.id}`,
                    source: pluginConfigSource,
                    target: node.id,
                    sourceHandle: 'source-to-route',
                    targetHandle: 'target-from-plugin_config',
                    type: 'smoothstep',
                    label: 'plugin_config',
                    labelStyle: EDGE_LABEL_STYLE,
                    labelBgStyle: EDGE_LABEL_BG_STYLE,
                    // source=plugin_config(teal), destination=route(blue)
                    style: colorScheme === 'source' ? DEST_PLUGIN_EDGE_STYLE : ROUTE_PLUGIN_EDGE_STYLE,
                });
                g.setEdge(pluginConfigSource, node.id);
            }
        }

        if (category === 'service') {
            const upstreamTarget = resolveRef('upstream', entry['upstream_id']);
            if (upstreamTarget) {
                edges.push({
                    id: `${node.id}->${upstreamTarget}`,
                    source: node.id,
                    target: upstreamTarget,
                    sourceHandle: 'source-upstream',
                    targetHandle: 'target-from-service',
                    type: 'smoothstep',
                    label: 'upstream',
                    labelStyle: EDGE_LABEL_STYLE,
                    labelBgStyle: EDGE_LABEL_BG_STYLE,
                    animated: true,
                    style: colorScheme === 'source' ? SERVICE_EDGE_STYLE : DEST_UPSTREAM_EDGE_STYLE,
                });
                g.setEdge(node.id, upstreamTarget);
            }
        }
    }

    // Consumer edges: connect each consumer to every route/service/plugin_config
    // that shares at least one auth plugin with it.
    const consumerNodes = nodes.filter(n => n.data.category === 'consumer');
    const authTargetCategories = new Set(['route', 'service', 'plugin_config']);
    const authTargetNodes = nodes.filter(n => authTargetCategories.has(n.data.category));

    for (const consumer of consumerNodes) {
        const consumerAuth = authPluginNames(consumer.data.entry);
        if (consumerAuth.size === 0) continue;

        for (const target of authTargetNodes) {
            const targetAuth = authPluginNames(target.data.entry);
            const shared = [...consumerAuth].find(p => targetAuth.has(p));
            if (!shared) continue;

            const edgeId = `${consumer.id}->${target.id}`;
            const consumerEdgeColor = colorScheme === 'source'
                ? '#8b5cf6'
                : (DEST_CONSUMER_EDGE_COLORS[target.data.category] ?? '#8b5cf6');
            edges.push({
                id: edgeId,
                source: consumer.id,
                target: target.id,
                sourceHandle: 'source-auth',
                targetHandle: 'target-from-consumer',
                type: 'smoothstep',
                label: shared,
                labelStyle: EDGE_LABEL_STYLE,
                labelBgStyle: EDGE_LABEL_BG_STYLE,
                style: { stroke: consumerEdgeColor, strokeDasharray: '3 3' },
            });
            g.setEdge(consumer.id, target.id);
        }
    }

    // Run dagre layout and apply computed positions
    dagre.layout(g);

    for (const node of nodes) {
        const pos = g.node(node.id);
        node.position = { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 };
    }

    return { nodes, edges };
}
