import React, {createContext, useContext} from 'react';
import {Handle, Position, useEdges, useNodeId} from '@xyflow/react';
import type {NodeProps, Node} from '@xyflow/react';
import type {ColorScheme, ConfigNodeData} from './buildTopology';
import styles from './TopologyPage.module.css';

// Color scheme context - provided by TopologyPage, consumed here

export const ColorSchemeContext = createContext<ColorScheme>('source');

// Category display metadata

export const CATEGORY_COLOR: Record<string, string> = {
    route:        '#3b82f6',
    upstream:     '#22c55e',
    service:      '#f97316',
    consumer:     '#8b5cf6',
    global_rule:  '#ef4444',
    plugin_config:'#f59e0b',
    ssl:          '#94a3b8',
};

export const CATEGORY_LABEL: Record<string, string> = {
    route:        'Route',
    upstream:     'Upstream',
    service:      'Service',
    consumer:     'Consumer',
    global_rule:  'Global Rule',
    plugin_config:'Plugin Config',
    ssl:          'SSL',
};

// Handle styling helpers

const H_BLUE   = '#3b82f6';
const H_GREEN  = '#22c55e';
const H_ORANGE = '#f97316';
const H_TEAL   = '#f59e0b';
const H_PURPLE = '#8b5cf6';

const HANDLE_SIZE   = 12;
const HANDLE_OFFSET = 1;

// `ring` is the colour of the far end of the connection, shown as a border.
function handleStyle(left: string, color: string, pos: 'top' | 'bottom', ring?: string): React.CSSProperties {
    return {
        left,
        background: color,
        border: `2px solid ${ring ?? color}`,
        width:  `${HANDLE_SIZE}px`,
        height: `${HANDLE_SIZE}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...(pos === 'top' ? {top: `-${HANDLE_OFFSET}px`} : {bottom: `-${HANDLE_OFFSET}px`}),
    };
}

const COUNT_LABEL_STYLE: React.CSSProperties = {
    color: '#1e293b',
    fontSize: '0.5rem',
    fontWeight: 700,
    lineHeight: 1,
    pointerEvents: 'none',
    userSelect: 'none',
};

// Handle count / tooltip helpers used inside ConfigNode

const SOURCE_HANDLE_TO_FIELD: Record<string, string> = {
    'source-upstream': 'upstream_id',
    'source-service':  'service_id',
};

function parseSourceNodeId(nid: string): {category: string; id: string} {
    const sep = nid.indexOf('-');
    return {category: nid.slice(0, sep), id: nid.slice(sep + 1)};
}

// Per-category handle JSX

function getHandles(
    category: string,
    entry: Record<string, unknown>,
    colorScheme: ColorScheme,
    counts: Record<string, number>,
    tooltips: Record<string, string>,
): React.ReactNode {
    const src = colorScheme === 'source';
    const n = (id: string) => {
        const c = counts[id] ?? 0;
        return c > 0 ? <span style={COUNT_LABEL_STYLE}>{c}</span> : null;
    };

    switch (category) {
        case 'route': {
            const upstreamId     = entry['upstream_id'];
            const serviceId      = entry['service_id'];
            const pluginConfigId = entry['plugin_config_id'];
            return (
                <>
                    <Handle type="target" position={Position.Top} id="target-from-plugin_config"
                            style={handleStyle('30%', src ? H_TEAL : H_BLUE, 'top', src ? undefined : H_TEAL)}
                            data-tooltip={pluginConfigId ? `plugin_config_id: '${pluginConfigId}'` : 'set plugin_config_id to connect'}>
                        {n('target-from-plugin_config')}
                    </Handle>
                    <Handle type="target" position={Position.Top} id="target-from-consumer"
                            style={handleStyle('70%', src ? H_PURPLE : H_BLUE, 'top', src ? undefined : H_PURPLE)}
                            data-tooltip="consumer: add matching auth plugin">
                        {n('target-from-consumer')}
                    </Handle>
                    <Handle type="source" position={Position.Bottom} id="source-upstream"
                            style={handleStyle('30%', src ? H_BLUE : H_GREEN, 'bottom', src ? H_GREEN : undefined)}
                            data-tooltip={upstreamId ? `upstream_id: '${upstreamId}'` : 'set upstream_id to connect'}>
                        {n('source-upstream')}
                    </Handle>
                    <Handle type="source" position={Position.Bottom} id="source-service"
                            style={handleStyle('70%', src ? H_BLUE : H_ORANGE, 'bottom', src ? H_ORANGE : undefined)}
                            data-tooltip={serviceId ? `service_id: '${serviceId}'` : 'set service_id to connect'}>
                        {n('source-service')}
                    </Handle>
                </>
            );
        }
        case 'service': {
            const upstreamId = entry['upstream_id'];
            return (
                <>
                    <Handle type="target" position={Position.Top} id="target-from-route"
                            style={handleStyle('35%', src ? H_BLUE : H_ORANGE, 'top', src ? undefined : H_BLUE)}
                            data-tooltip={tooltips['target-from-route'] || "set route's service_id to connect"}>
                        {n('target-from-route')}
                    </Handle>
                    <Handle type="target" position={Position.Top} id="target-from-consumer"
                            style={handleStyle('65%', src ? H_PURPLE : H_ORANGE, 'top', src ? undefined : H_PURPLE)}
                            data-tooltip="consumer: add matching auth plugin">
                        {n('target-from-consumer')}
                    </Handle>
                    <Handle type="source" position={Position.Bottom} id="source-upstream"
                            style={handleStyle('50%', src ? H_ORANGE : H_GREEN, 'bottom', src ? H_GREEN : undefined)}
                            data-tooltip={upstreamId ? `upstream_id: '${upstreamId}'` : 'set upstream_id to connect'}>
                        {n('source-upstream')}
                    </Handle>
                </>
            );
        }
        case 'consumer': {
            const plugins    = entry['plugins'];
            const pluginKeys = plugins && typeof plugins === 'object' && !Array.isArray(plugins)
                ? Object.keys(plugins as Record<string, unknown>).join(', ')
                : '';
            return (
                <Handle type="source" position={Position.Bottom} id="source-auth"
                        style={handleStyle('50%', H_PURPLE, 'bottom')}
                        data-tooltip={pluginKeys ? `plugins: ${pluginKeys}` : 'add auth plugin (e.g. key-auth) to connect'}>
                    {n('source-auth')}
                </Handle>
            );
        }
        case 'upstream':
            return (
                <>
                    <Handle type="target" position={Position.Top} id="target-from-route"
                            style={handleStyle('30%', src ? H_BLUE : H_GREEN, 'top', src ? undefined : H_BLUE)}
                            data-tooltip={tooltips['target-from-route'] || "set route's upstream_id to connect"}>
                        {n('target-from-route')}
                    </Handle>
                    <Handle type="target" position={Position.Top} id="target-from-service"
                            style={handleStyle('70%', src ? H_ORANGE : H_GREEN, 'top', src ? undefined : H_ORANGE)}
                            data-tooltip={tooltips['target-from-service'] || "set service's upstream_id to connect"}>
                        {n('target-from-service')}
                    </Handle>
                </>
            );
        case 'plugin_config':
            return (
                <>
                    <Handle type="target" position={Position.Top} id="target-from-consumer"
                            style={handleStyle('50%', src ? H_PURPLE : H_TEAL, 'top', src ? undefined : H_PURPLE)}
                            data-tooltip="consumer: add matching auth plugin">
                        {n('target-from-consumer')}
                    </Handle>
                    <Handle type="source" position={Position.Bottom} id="source-to-route"
                            style={handleStyle('50%', src ? H_TEAL : H_BLUE, 'bottom', src ? H_BLUE : undefined)}>
                        {n('source-to-route')}
                    </Handle>
                </>
            );
        default:
            // ssl, global_rule - standalone, no connections
            return null;
    }
}

// Helper: upstream node addresses for display

function upstreamAddresses(nodes: unknown): string[] {
    if (!nodes) return [];
    if (typeof nodes === 'object' && !Array.isArray(nodes))
        return Object.keys(nodes as Record<string, unknown>).slice(0, 3);
    if (Array.isArray(nodes))
        return (nodes as Array<{host?: unknown; port?: unknown}>)
            .slice(0, 3)
            .map(n => `${n.host ?? '?'}:${n.port ?? '?'}`);
    return [];
}

const CATEGORIES_WITH_INPUTS  = new Set(['route', 'service', 'plugin_config', 'upstream']);
const CATEGORIES_WITH_OUTPUTS = new Set(['route', 'service', 'consumer', 'plugin_config']);

// ConfigNode — the custom ReactFlow node

type ConfigNodeType = Node<ConfigNodeData>;

export const ConfigNode: React.FC<NodeProps<ConfigNodeType>> = ({data}) => {
    const colorScheme   = useContext(ColorSchemeContext);
    const {category, entry} = data;
    const currentNodeId = useNodeId() ?? '';
    const allEdges      = useEdges();
    const currentId     = currentNodeId.slice(currentNodeId.indexOf('-') + 1);

    const handleCounts:  Record<string, number> = {};
    const handleTooltips: Record<string, string> = {};

    for (const e of allEdges) {
        if (e.source === currentNodeId && e.sourceHandle)
            handleCounts[e.sourceHandle] = (handleCounts[e.sourceHandle] ?? 0) + 1;

        if (e.target === currentNodeId && e.targetHandle) {
            handleCounts[e.targetHandle] = (handleCounts[e.targetHandle] ?? 0) + 1;
            const field = SOURCE_HANDLE_TO_FIELD[e.sourceHandle ?? ''];
            if (field) {
                const {category: srcCat, id: srcId} = parseSourceNodeId(e.source);
                const tip  = `${srcCat} '${srcId}' has ${field} set to '${currentId}'`;
                const prev = handleTooltips[e.targetHandle];
                handleTooltips[e.targetHandle] = prev ? `${prev} · ${tip}` : tip;
            }
        }
    }

    const color     = CATEGORY_COLOR[category] ?? '#64748b';
    const label     = CATEGORY_LABEL[category] ?? category;
    const title     = String(category === 'consumer' ? entry['username'] : (entry['id'] ?? '—'));
    const plugins   = entry['plugins'];
    const pluginKeys = plugins && typeof plugins === 'object' && !Array.isArray(plugins)
        ? Object.keys(plugins as Record<string, unknown>)
        : [];

    return (
        <div className={styles.configNode}>
            {getHandles(category, entry as Record<string, unknown>, colorScheme, handleCounts, handleTooltips)}

            <div className={styles.nodeMain}>
                <div className={styles.nodeHeader} style={{background: color}}>
                    <span className={styles.nodeCategory}>{label}</span>
                </div>

                <div className={styles.nodeBody}>
                    {CATEGORIES_WITH_INPUTS.has(category)  && <div className={styles.ioLabelTop}>▲ input</div>}

                    <div className={styles.nodeContent}>
                        <div className={styles.nodeTitle}>{title}</div>

                        {category === 'route' && !!entry['uri'] && (
                            <div className={styles.nodeDetail}><code>{String(entry['uri'])}</code></div>
                        )}
                        {category === 'upstream' && (
                            <div className={styles.nodeDetail}>
                                {upstreamAddresses(entry['nodes']).map(addr => (
                                    <div key={addr}><code>{addr}</code></div>
                                ))}
                                {!!entry['type'] && <div className={styles.nodeTag}>{String(entry['type'])}</div>}
                            </div>
                        )}
                        {category === 'service' && !!entry['name'] && (
                            <div className={styles.nodeDetail}>{String(entry['name'])}</div>
                        )}
                        {pluginKeys.length > 0 && (
                            <div className={styles.pluginChips}>
                                {pluginKeys.map(p => <span key={p} className={styles.pluginChip}>{p}</span>)}
                            </div>
                        )}
                    </div>

                    {CATEGORIES_WITH_OUTPUTS.has(category) && <div className={styles.ioLabelBottom}>output ▼</div>}
                </div>
            </div>
        </div>
    );
};

export const nodeTypes = {configNode: ConfigNode};
