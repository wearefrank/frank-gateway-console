import React, {useCallback, useContext, useEffect, useMemo, useRef, useState, createContext} from 'react';
import {Link} from 'react-router-dom';
import {dump} from 'js-yaml';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    Panel,
    useNodesState,
    useEdgesState,
    useEdges,
    useNodeId,
    useViewport,
    Handle,
    Position,
} from '@xyflow/react';
import type {NodeProps, Node, Edge} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {useConfigManager} from '../../hooks/useConfigManager';
import {buildTopology} from './buildTopology';
import type {ColorScheme, ConfigNodeData} from './buildTopology';
import styles from './TopologyPage.module.css';

// Color scheme context

const ColorSchemeContext = createContext<ColorScheme>('source');

// Category colours

const CATEGORY_COLOR: Record<string, string> = {
    route: '#3b82f6',
    upstream: '#22c55e',
    service: '#f97316',
    consumer: '#8b5cf6',
    global_rule: '#ef4444',
    plugin_config: '#f59e0b',
    ssl: '#94a3b8',
};

const CATEGORY_LABEL: Record<string, string> = {
    route: 'Route',
    upstream: 'Upstream',
    service: 'Service',
    consumer: 'Consumer',
    global_rule: 'Global Rule',
    plugin_config: 'Plugin Config',
    ssl: 'SSL',
};

// Helper to get upstream node addresses

function upstreamAddresses(nodes: unknown): string[] {
    if (!nodes) return [];
    // object form: { "host:port": weight }
    if (typeof nodes === 'object' && !Array.isArray(nodes)) {
        return Object.keys(nodes as Record<string, unknown>).slice(0, 3);
    }
    // array form: [{ host, port, weight }]
    if (Array.isArray(nodes)) {
        return (nodes as Array<{ host?: unknown; port?: unknown }>)
            .slice(0, 3)
            .map(n => `${n.host ?? '?'}:${n.port ?? '?'}`);
    }
    return [];
}

// Per-category handle sets

const H_BLUE = '#3b82f6';
const H_GREEN = '#22c55e';
const H_ORANGE = '#f97316';
const H_TEAL = '#f59e0b';
const H_PURPLE = '#8b5cf6';

const HANDLE_SIZE = 12;
const HANDLE_OFFSET = 1;

// Returns a full handle style including size, flex centering, and edge offset.
// `ring` is the color of the other end of the connection (shown as a border).
function handleStyle(left: string, color: string, pos: 'top' | 'bottom', ring?: string): React.CSSProperties {
    return {
        left,
        background: color,
        border: `2px solid ${ring ?? color}`,
        width: `${HANDLE_SIZE}px`,
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

function parseSourceNodeId(nid: string): { category: string; id: string } {
    const sep = nid.indexOf('-');
    return {category: nid.slice(0, sep), id: nid.slice(sep + 1)};
}

const SOURCE_HANDLE_TO_FIELD: Record<string, string> = {
    'source-upstream': 'upstream_id',
    'source-service': 'service_id',
};

function getHandles(category: string, entry: Record<string, unknown>, colorScheme: ColorScheme, counts: Record<string, number>, handleTooltips: Record<string, string>): React.ReactNode {
    const src = colorScheme === 'source';

    const connectionNumber = (id: string) => {
        const c = counts[id] ?? 0;
        return c > 0 ? <span style={COUNT_LABEL_STYLE}>{c}</span> : null;
    };

    switch (category) {
        case 'route': {
            const upstreamId = entry['upstream_id'];
            const serviceId = entry['service_id'];
            const pluginConfigId = entry['plugin_config_id'];
            const upstreamTooltip = upstreamId ? `upstream_id: '${upstreamId}'` : "set upstream_id to connect";
            const serviceTooltip = serviceId ? `service_id: '${serviceId}'` : "set service_id to connect";
            const pluginConfigTooltip = pluginConfigId ? `plugin_config_id: '${pluginConfigId}'` : "set plugin_config_id to connect";
            // target-from-plugin_config: source=plugin_config(teal), dest=route(blue)
            const pluginTargetColor = src ? H_TEAL   : H_BLUE;
            const pluginTargetRing  = src ? undefined : H_TEAL;
            // target-from-consumer: source=consumer(purple), dest=route(blue)
            const consumerTargetColor = src ? H_PURPLE : H_BLUE;
            const consumerTargetRing  = src ? undefined : H_PURPLE;
            // source-upstream: source=route(blue), dest=upstream(green)
            const upstreamOutColor = src ? H_BLUE  : H_GREEN;
            const upstreamOutRing  = src ? H_GREEN  : undefined;
            // source-service: source=route(blue), dest=service(orange)
            const serviceOutColor  = src ? H_BLUE   : H_ORANGE;
            const serviceOutRing   = src ? H_ORANGE  : undefined;
            return (
                <>
                    <Handle type="target" position={Position.Top} id="target-from-plugin_config"
                            style={handleStyle('30%', pluginTargetColor, 'top', pluginTargetRing)}
                            data-tooltip={pluginConfigTooltip}>{connectionNumber('target-from-plugin_config')}</Handle>
                    <Handle type="target" position={Position.Top} id="target-from-consumer"
                            style={handleStyle('70%', consumerTargetColor, 'top', consumerTargetRing)}
                            data-tooltip="consumer: add matching auth plugin">{connectionNumber('target-from-consumer')}</Handle>
                    <Handle type="source" position={Position.Bottom} id="source-upstream"
                            style={handleStyle('30%', upstreamOutColor, 'bottom', upstreamOutRing)}
                            data-tooltip={upstreamTooltip}>{connectionNumber('source-upstream')}</Handle>
                    <Handle type="source" position={Position.Bottom} id="source-service"
                            style={handleStyle('70%', serviceOutColor, 'bottom', serviceOutRing)}
                            data-tooltip={serviceTooltip}>{connectionNumber('source-service')}</Handle>
                </>
            );
        }
        case 'service': {
            const upstreamId = entry['upstream_id'];
            const upstreamTooltip = upstreamId ? `upstream_id: '${upstreamId}'` : "set upstream_id to connect";
            // target-from-route: source=route(blue), dest=service(orange)
            const routeInColor    = src ? H_BLUE   : H_ORANGE;
            const routeInRing     = src ? undefined : H_BLUE;
            // target-from-consumer: source=consumer(purple), dest=service(orange)
            const consumerInColor = src ? H_PURPLE : H_ORANGE;
            const consumerInRing  = src ? undefined : H_PURPLE;
            // source-upstream: source=service(orange), dest=upstream(green)
            const upstreamOutColor = src ? H_ORANGE : H_GREEN;
            const upstreamOutRing  = src ? H_GREEN  : undefined;
            return (
                <>
                    <Handle type="target" position={Position.Top} id="target-from-route"
                            style={handleStyle('35%', routeInColor, 'top', routeInRing)}
                            data-tooltip={handleTooltips['target-from-route'] || "set route's service_id to connect"}>{connectionNumber('target-from-route')}</Handle>
                    <Handle type="target" position={Position.Top} id="target-from-consumer"
                            style={handleStyle('65%', consumerInColor, 'top', consumerInRing)}
                            data-tooltip="consumer: add matching auth plugin">{connectionNumber('target-from-consumer')}</Handle>
                    <Handle type="source" position={Position.Bottom} id="source-upstream"
                            style={handleStyle('50%', upstreamOutColor, 'bottom', upstreamOutRing)}
                            data-tooltip={upstreamTooltip}>{connectionNumber('source-upstream')}</Handle>
                </>
            );
        }
        case 'consumer': {
            const plugins = entry['plugins'];
            const pluginKeys = plugins && typeof plugins === 'object' && !Array.isArray(plugins)
                ? Object.keys(plugins as Record<string, unknown>).join(', ')
                : '';
            const authTooltip = pluginKeys ? `plugins: ${pluginKeys}` : "add auth plugin (e.g. key-auth) to connect";
            return (
                <Handle type="source" position={Position.Bottom} id="source-auth"
                        style={handleStyle('50%', H_PURPLE, 'bottom')}
                        data-tooltip={authTooltip}>{connectionNumber('source-auth')}</Handle>
            );
        }
        case 'upstream': {
            // target-from-route: source=route(blue), dest=upstream(green)
            const routeInColor = src ? H_BLUE   : H_GREEN;
            const routeInRing  = src ? undefined : H_BLUE;
            // target-from-service: source=service(orange), dest=upstream(green)
            const svcInColor   = src ? H_ORANGE : H_GREEN;
            const svcInRing    = src ? undefined : H_ORANGE;
            return (
                <>
                    <Handle
                        type="target"
                        position={Position.Top}
                        id="target-from-route"
                        style={handleStyle('30%', routeInColor, 'top', routeInRing)}
                        data-tooltip={handleTooltips['target-from-route'] || "set route's upstream_id to connect"}
                    >
                        {connectionNumber('target-from-route')}
                    </Handle>

                    <Handle
                        type="target"
                        position={Position.Top}
                        id="target-from-service"
                        style={handleStyle('70%', svcInColor, 'top', svcInRing)}
                        data-tooltip={handleTooltips['target-from-service'] || "set service's upstream_id to connect"}
                    >
                        {connectionNumber('target-from-service')}
                    </Handle>
                </>
            );
        }
        case 'plugin_config': {
            // target-from-consumer: source=consumer(purple), dest=plugin_config(teal)
            const consumerInColor = src ? H_PURPLE : H_TEAL;
            const consumerInRing  = src ? undefined : H_PURPLE;
            // source-to-route: source=plugin_config(teal), dest=route(blue)
            const routeOut     = src ? H_TEAL : H_BLUE;
            const routeOutRing = src ? H_BLUE : undefined;
            return (
                <>
                    <Handle
                        type="target"
                        position={Position.Top}
                        id="target-from-consumer"
                        style={handleStyle('50%', consumerInColor, 'top', consumerInRing)}
                        data-tooltip="consumer: add matching auth plugin"
                    >
                        {connectionNumber('target-from-consumer')}
                    </Handle>

                    <Handle
                        type="source"
                        position={Position.Bottom} id="source-to-route"
                        style={handleStyle('50%', routeOut, 'bottom', routeOutRing)}
                    >
                        {connectionNumber('source-to-route')}
                    </Handle>
                </>
            );
        }
        default:
            // ssl, global_rule — standalone, no connections
            return null;
    }
}

// Custom node component

const CATEGORIES_WITH_INPUTS = new Set(['route', 'service', 'plugin_config', 'upstream']);
const CATEGORIES_WITH_OUTPUTS = new Set(['route', 'service', 'consumer', 'plugin_config']);

type ConfigNodeType = Node<ConfigNodeData>;

const ConfigNode: React.FC<NodeProps<ConfigNodeType>> = ({data}) => {
    const colorScheme = useContext(ColorSchemeContext);
    const {category, entry} = data;
    const currentNodeId = useNodeId() ?? '';
    const allEdges = useEdges();

    const currentId = currentNodeId.slice(currentNodeId.indexOf('-') + 1);
    const handleCounts: Record<string, number> = {};
    const handleTooltips: Record<string, string> = {};


    // count of how many connections there are and tooltip mapping
    for (const e of allEdges) {
        if (e.source === currentNodeId && e.sourceHandle) {
            handleCounts[e.sourceHandle] = (handleCounts[e.sourceHandle] ?? 0) + 1;
        }
        if (e.target === currentNodeId && e.targetHandle) {
            handleCounts[e.targetHandle] = (handleCounts[e.targetHandle] ?? 0) + 1;
            const field = SOURCE_HANDLE_TO_FIELD[e.sourceHandle ?? ''];
            if (field) {
                const {category: srcCat, id: srcId} = parseSourceNodeId(e.source);
                const tip = `${srcCat} '${srcId}' has ${field} set to '${currentId}'`;
                const prev = handleTooltips[e.targetHandle];
                handleTooltips[e.targetHandle] = prev ? `${prev} · ${tip}` : tip;
            }
        }
    }
    const color = CATEGORY_COLOR[category] ?? '#64748b';
    const label = CATEGORY_LABEL[category] ?? category;

    const title = String(
        category === 'consumer' ? entry['username'] : (entry['id'] ?? '—')
    );

    const plugins = entry['plugins'];
    const pluginKeys = plugins && typeof plugins === 'object' && !Array.isArray(plugins)
        ? Object.keys(plugins as Record<string, unknown>)
        : [];

    const hasInput = CATEGORIES_WITH_INPUTS.has(category);
    const hasOutput = CATEGORIES_WITH_OUTPUTS.has(category);

    return (
        <div className={styles.configNode}>
            {getHandles(category, entry as Record<string, unknown>, colorScheme, handleCounts, handleTooltips)}

            <div className={styles.nodeMain}>
                <div className={styles.nodeHeader} style={{background: color}}>
                    <span className={styles.nodeCategory}>{label}</span>
                </div>

                <div className={styles.nodeBody}>
                    {hasInput && <div className={styles.ioLabelTop}>▲ input</div>}

                    <div className={styles.nodeContent}>

                        <div className={styles.nodeTitle}>{title}</div>

                        {category === 'route' && !!entry['uri'] && (
                            <div className={styles.nodeDetail}>
                                <code>{String(entry['uri'])}</code>
                            </div>
                        )}

                        {category === 'upstream' && (
                            <div className={styles.nodeDetail}>
                                {upstreamAddresses(entry['nodes']).map(addr => (
                                    <div key={addr}><code>{addr}</code></div>
                                ))}
                                {!!entry['type'] && (
                                    <div className={styles.nodeTag}>{String(entry['type'])}</div>
                                )}
                            </div>
                        )}

                        {category === 'service' && !!entry['name'] && (
                            <div className={styles.nodeDetail}>{String(entry['name'])}</div>
                        )}

                        {pluginKeys.length > 0 && (
                            <div className={styles.pluginChips}>
                                {pluginKeys.map(p => (
                                    <span key={p} className={styles.pluginChip}>{p}</span>
                                ))}
                            </div>
                        )}
                    </div>

                    {hasOutput && <div className={styles.ioLabelBottom}>output ▼</div>}
                </div>
            </div>
        </div>
    );
};

const nodeTypes = {configNode: ConfigNode};

// Focus mode

function getConnectedNodeIds(startId: string, edges: Edge[]): Set<string> {
    const visited = new Set([startId]);
    const downQueue: string[] = []; // reached via output — only follow outputs
    const upQueue: string[] = [];   // reached via input  — only follow inputs

    for (const e of edges) {
        if (e.source === startId && !visited.has(e.target)) {
            visited.add(e.target);
            downQueue.push(e.target);
        }
        if (e.target === startId && !visited.has(e.source)) {
            visited.add(e.source);
            upQueue.push(e.source);
        }
    }

    while (downQueue.length) {
        const id = downQueue.shift()!;
        for (const e of edges) {
            if (e.source === id && !visited.has(e.target)) {
                visited.add(e.target);
                downQueue.push(e.target);
            }
        }
    }

    while (upQueue.length) {
        const id = upQueue.shift()!;
        for (const e of edges) {
            if (e.target === id && !visited.has(e.source)) {
                visited.add(e.source);
                upQueue.push(e.source);
            }
        }
    }

    return visited;
}

// Detail cards

type DetailCard = {
    id: string;
    data: ConfigNodeData;
    x: number; // flow coordinates
    y: number;
    scale: number;
};

type CardLayerProps = {
    cards: DetailCard[];
    edges: Edge[];
    closeCard: (id: string) => void;
    onHeaderMouseDown: (e: React.MouseEvent, id: string) => void;
    onResizeMouseDown: (e: React.MouseEvent, id: string) => void;
};

const CardLayer: React.FC<CardLayerProps> = ({cards, edges, closeCard, onHeaderMouseDown, onResizeMouseDown}) => {
    const {x: vpX, y: vpY, zoom} = useViewport();
    return (
        <div className={styles.cardStack}>
            {cards.map(card => {
                const color = CATEGORY_COLOR[card.data.category] ?? '#64748b';
                const label = CATEGORY_LABEL[card.data.category] ?? card.data.category;
                const entry = card.data.entry as Record<string, unknown>;
                const title = String(card.data.category === 'consumer' ? entry['username'] : (entry['id'] ?? '—'));
                const edgeCount = edges.filter(e => e.source === card.id || e.target === card.id).length;
                const yamlText = dump(entry, {indent: 2, noRefs: true});
                const sx = card.x * zoom + vpX;
                const sy = card.y * zoom + vpY;
                return (
                    <div key={card.id} className={styles.detailCard} style={{left: sx, top: sy, transform: `scale(${zoom * card.scale})`, transformOrigin: 'top left'}}>
                        <div
                            className={styles.cardHeader}
                            style={{background: color}}
                            onMouseDown={e => onHeaderMouseDown(e, card.id)}
                        >
                            <span className={styles.cardCategory}>{label}</span>
                            <button className={styles.cardCloseBtn} onClick={() => closeCard(card.id)}>✕</button>
                        </div>
                        <div className={styles.cardBody}>
                            <div className={styles.cardTitle}>{title}</div>
                            {edgeCount > 0 && (
                                <div className={styles.cardMeta}>{edgeCount} connection{edgeCount !== 1 ? 's' : ''}</div>
                            )}
                            <pre className={styles.cardYaml}>{yamlText}</pre>
                        </div>
                        <div className={styles.cardResizeFooter} onMouseDown={e => onResizeMouseDown(e, card.id)}>
                            <svg width="10" height="10" viewBox="0 0 10 10" className={styles.cardResizeIcon}>
                                <line x1="3" y1="10" x2="10" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                <line x1="6" y1="10" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// Page

export const TopologyPage: React.FC = () => {
    const {config} = useConfigManager();
    const [colorScheme, setColorScheme] = useState<ColorScheme>('destination');
    const [cards, setCards] = useState<DetailCard[]>([]);
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
    const pageRef = useRef<HTMLDivElement>(null);
    const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number; zoom: number } | null>(null);
    const resizeRef = useRef<{ id: string; startX: number; startY: number; startScale: number } | null>(null);
    const viewportRef = useRef({x: 0, y: 0, zoom: 1});

    const handleViewportMove = useCallback((_: unknown, vp: {x: number; y: number; zoom: number}) => {
        viewportRef.current = vp;
    }, []);

    const handleNodeClick = useCallback((e: React.MouseEvent, node: Node<ConfigNodeData>) => {
        const rect = pageRef.current?.getBoundingClientRect() ?? {left: 0, top: 0};
        const {x: vpX, y: vpY, zoom} = viewportRef.current;
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const x = (sx - vpX) / zoom + 20;
        const y = (sy - vpY) / zoom - 20;
        if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
        clickTimerRef.current = setTimeout(() => {
            clickTimerRef.current = null;
            setCards(prev => {
                const existing = prev.find(c => c.id === node.id);
                if (existing) return [...prev.filter(c => c.id !== node.id), {...existing}];
                return [...prev, {id: node.id, data: node.data, x, y, scale: 1}];
            });
        }, 220);
    }, []);

    const handleNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node<ConfigNodeData>) => {
        if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current);
            clickTimerRef.current = null;
        }
        setFocusedNodeId(prev => prev === node.id ? null : node.id);
    }, []);

    const closeCard = useCallback((id: string) => {
        setCards(prev => prev.filter(c => c.id !== id));
    }, []);

    const closeAllCards = useCallback(() => setCards([]), []);

    const onResizeMouseDown = useCallback((e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        const card = cards.find(c => c.id === id);
        if (!card) return;
        resizeRef.current = {id, startX: e.clientX, startY: e.clientY, startScale: card.scale};

        const onMove = (me: MouseEvent) => {
            if (!resizeRef.current) return;
            const {id, startX, startY, startScale} = resizeRef.current;
            const delta = (me.clientX - startX + me.clientY - startY) * 0.004;
            const newScale = Math.min(3, Math.max(0.4, startScale + delta));
            setCards(prev => prev.map(c => c.id === id ? {...c, scale: newScale} : c));
        };
        const onUp = () => {
            resizeRef.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [cards]);

    const onHeaderMouseDown = useCallback((e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        const card = cards.find(c => c.id === id);
        if (!card) return;
        const {zoom} = viewportRef.current;
        dragRef.current = {id, startX: e.clientX, startY: e.clientY, origX: card.x, origY: card.y, zoom};

        const onMove = (me: MouseEvent) => {
            if (!dragRef.current) return;
            const {id, startX, startY, origX, origY, zoom} = dragRef.current;
            const dx = (me.clientX - startX) / zoom;
            const dy = (me.clientY - startY) / zoom;
            setCards(prev => prev.map(c =>
                c.id === id ? {...c, x: origX + dx, y: origY + dy} : c
            ));
        };
        const onUp = () => {
            dragRef.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [cards]);

    const {nodes: initNodes, edges: initEdges} = useMemo(
        () => (config ? buildTopology(config, colorScheme) : {nodes: [], edges: []}),
        [config, colorScheme],
    );

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFocusedNodeId(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

    useEffect(() => {
        setNodes(prev => {
            const posMap = new Map(prev.map(n => [n.id, n.position]));
            return initNodes.map(n => ({
                ...n,
                position: posMap.get(n.id) ?? n.position,
            }));
        });
    }, [initNodes, setNodes]);
    useEffect(() => {
        setEdges(initEdges);
    }, [initEdges, setEdges]);

    const connectedIds = useMemo(
        () => focusedNodeId ? getConnectedNodeIds(focusedNodeId, edges) : null,
        [focusedNodeId, edges],
    );

    const displayNodes = useMemo(() => {
        if (!connectedIds) return nodes;
        return nodes.map(n => {
            if (!connectedIds.has(n.id)) return {...n, style: {...n.style, opacity: 0.12, filter: 'grayscale(0.6)'}};
            if (n.id === focusedNodeId) return {...n, style: {...n.style, outline: '2px solid var(--accent-color)', borderRadius: '8px'}};
            return n;
        });
    }, [nodes, connectedIds, focusedNodeId]);

    const displayEdges = useMemo(() => {
        if (!connectedIds) return edges;
        return edges.map(e =>
            connectedIds.has(e.source) && connectedIds.has(e.target)
                ? e
                : {...e, style: {...e.style, opacity: 0.06}},
        );
    }, [edges, connectedIds]);

    const focusedNode = focusedNodeId ? nodes.find(n => n.id === focusedNodeId) : null;
    const focusedLabel = focusedNode
        ? String(focusedNode.data.category === 'consumer'
            ? focusedNode.data.entry['username']
            : (focusedNode.data.entry['id'] ?? focusedNodeId))
        : null;

    if (!config) {
        return (
            <div className={`container ${styles.empty}`}>
                <h1>Topology</h1>
                <p className="text-muted">
                    No config loaded.{' '}
                    <Link to="/loadConfig">Load a config</Link>
                    {' '}to visualise its topology.
                </p>
            </div>
        );
    }

    return (
        <ColorSchemeContext.Provider value={colorScheme}>
            <div className={styles.page} ref={pageRef}>
                <ReactFlow
                    nodes={displayNodes}
                    edges={displayEdges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    nodeTypes={nodeTypes}
                    onNodeClick={handleNodeClick}
                    onNodeDoubleClick={handleNodeDoubleClick}
                    onPaneClick={() => setFocusedNodeId(null)}
                    onMove={handleViewportMove}
                    fitView
                    fitViewOptions={{padding: 0.15}}
                    minZoom={0.2}
                    nodesConnectable={false}
                    proOptions={{hideAttribution: true}}
                >
                    <Background color="var(--accent-color)"/>
                    {cards.length > 0 && (
                        <Panel position="top-right">
                            <div className={styles.focusBanner}>
                                <span>{cards.length} card{cards.length !== 1 ? 's' : ''} open</span>
                                <button className={styles.focusClearBtn} onClick={closeAllCards}>✕ Close all</button>
                            </div>
                        </Panel>
                    )}
                    {focusedNodeId && (
                        <Panel position="top-center">
                            <div className={styles.focusBanner}>
                                <span>Focused: <strong>{focusedLabel}</strong></span>
                                <button className={styles.focusClearBtn} onClick={() => setFocusedNodeId(null)}>✕ Clear</button>
                            </div>
                        </Panel>
                    )}
                    <Controls position="bottom-right" style={{bottom: 170}}/>
                    <MiniMap
                        nodeColor={n => CATEGORY_COLOR[(n.data as ConfigNodeData).category] ?? '#94a3b8'}
                        maskColor="var(--bg-color)"
                        style={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-dim)',
                            borderRadius: '8px',
                        }}
                    />
                    <Panel position="bottom-right" style={{bottom: 210}}>
                        <div className={styles.sidePanel}>
                            <div className={styles.schemeToggle}>
                                <button
                                    className={`${styles.schemeBtn} ${colorScheme === 'source' ? styles.schemeBtnActive : ''}`}
                                    onClick={() => setColorScheme('source')}
                                >Source
                                </button>
                                <button
                                    className={`${styles.schemeBtn} ${colorScheme === 'destination' ? styles.schemeBtnActive : ''}`}
                                    onClick={() => setColorScheme('destination')}
                                >Destination
                                </button>
                            </div>
                            <div className={styles.legend}>
                                <div className={styles.legendTitle}>Legend</div>
                                <div className={styles.legendItem}>
                                    <svg width="32" height="10" overflow="visible">
                                        <line x1="0" y1="5" x2="32" y2="5" stroke="#64748b" strokeWidth="2"
                                              strokeDasharray="8 4" className={styles.legendAnimatedLine}/>
                                    </svg>
                                    <span>Traffic flow</span>
                                </div>
                                <div className={styles.legendItem}>
                                    <svg width="32" height="10">
                                        <line x1="0" y1="5" x2="32" y2="5" stroke="#64748b" strokeWidth="2"/>
                                    </svg>
                                    <span>Config reference</span>
                                </div>
                                <div className={styles.legendItem}>
                                    <svg width="32" height="10">
                                        <line x1="0" y1="5" x2="32" y2="5" stroke="#64748b" strokeWidth="2"
                                              strokeDasharray="5 3"/>
                                    </svg>
                                    <span>Plugin / Auth</span>
                                </div>
                                <div className={styles.legendDivider}/>
                                <div className={styles.legendItem}>
                                    <span className={styles.legendKey}>click</span>
                                    <span>Open detail card</span>
                                </div>
                                <div className={styles.legendItem}>
                                    <span className={styles.legendKey}>double</span>
                                    <span>Focus flow</span>
                                </div>
                            </div>
                        </div>
                    </Panel>
                    <CardLayer cards={cards} edges={edges} closeCard={closeCard} onHeaderMouseDown={onHeaderMouseDown} onResizeMouseDown={onResizeMouseDown}/>
                </ReactFlow>
            </div>
        </ColorSchemeContext.Provider>
    );
};
