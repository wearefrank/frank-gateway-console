import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {ReactFlow, Background, Controls, MiniMap, Panel, useNodesState, useEdgesState} from '@xyflow/react';
import type {Node} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {useConfigManager} from '../../hooks/useConfigManager';
import {buildTopology, getConnectedNodeIds} from './buildTopology';
import type {ColorScheme, ConfigNodeData} from './buildTopology';
import {ColorSchemeContext, CATEGORY_COLOR, nodeTypes} from './ConfigNode';
import { getDisplayId } from '../../config/categoryDefinitions';
import {CardLayer} from './CardLayer';
import {useDetailCards} from './useDetailCards';
import styles from './TopologyPage.module.css';

export const TopologyPage: React.FC = () => {
    const {config} = useConfigManager();
    const [colorScheme,  setColorScheme]  = useState<ColorScheme>('destination');
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

    const {
        cards, pageRef,
        handleViewportMove, handleNodeClick, cancelPendingClick,
        closeCard, closeAllCards, onHeaderMouseDown, onResizeMouseDown,
    } = useDetailCards();

    // Refs for manual double-click detection (needed because draggable:false nodes
    // suppress ReactFlow's onNodeDoubleClick in some versions)
    const lastClickRef  = useRef<{id: string; time: number} | null>(null);
    const dblHandledRef = useRef<{id: string; time: number} | null>(null);

    // Detects double-clicks manually so focus-toggle works even for draggable:false nodes.
    // Single click passes through to handleNodeClick (opens card via 220ms timer).
    const handleNodeClickOrDbl = useCallback((e: React.MouseEvent, node: Node<ConfigNodeData>) => {
        const now  = Date.now();
        const last = lastClickRef.current;
        if (last && last.id === node.id && now - last.time < 300) {
            cancelPendingClick();
            lastClickRef.current  = null;
            dblHandledRef.current = {id: node.id, time: now};
            setFocusedNodeId(prev => prev === node.id ? null : node.id);
            return;
        }
        lastClickRef.current = {id: node.id, time: now};
        handleNodeClick(e, node);
    }, [handleNodeClick, cancelPendingClick]);

    // Native double-click fallback for draggable nodes; skipped if manual detection already handled it.
    const handleNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node<ConfigNodeData>) => {
        const now     = Date.now();
        const handled = dblHandledRef.current;
        if (handled && handled.id === node.id && now - handled.time < 100) return;
        cancelPendingClick();
        setFocusedNodeId(prev => prev === node.id ? null : node.id);
    }, [cancelPendingClick]);

    // Build graph from config (re-runs when config or color scheme changes)
    const {nodes: initNodes, edges: initEdges} = useMemo(
        () => (config ? buildTopology(config, colorScheme) : {nodes: [], edges: []}),
        [config, colorScheme],
    );

    const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

    // Sync nodes — preserve positions when only the color scheme changed
    useEffect(() => {
        setNodes(prev => {
            const posMap = new Map(prev.map(n => [n.id, n.position]));
            return initNodes.map(n => ({...n, position: posMap.get(n.id) ?? n.position}));
        });
    }, [initNodes, setNodes]);

    useEffect(() => { setEdges(initEdges); }, [initEdges, setEdges]);

    // ReactFlow needs overflow:hidden on body to capture panning properly
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    // Escape clears focus mode
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFocusedNodeId(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Focus-mode derived state — dim nodes/edges outside the connected subgraph
    const connectedIds = useMemo(
        () => focusedNodeId ? getConnectedNodeIds(focusedNodeId, edges) : null,
        [focusedNodeId, edges],
    );

    const displayNodes = useMemo(() => {
        if (!connectedIds) return nodes;
        return nodes.map(n => {
            if (!connectedIds.has(n.id))   return {...n, draggable: false, style: {...n.style, opacity: 0.12, filter: 'grayscale(0.6)'}};
            if (n.id === focusedNodeId)    return {...n, style: {...n.style, outline: '2px solid var(--accent-color)', borderRadius: '8px'}};
            return n;
        });
    }, [nodes, connectedIds, focusedNodeId]);

    const displayEdges = useMemo(() =>
        connectedIds
            ? edges.map(e => connectedIds.has(e.source) && connectedIds.has(e.target)
                ? e
                : {...e, style: {...e.style, opacity: 0.06}})
            : edges,
    [edges, connectedIds]);

    const focusedNode  = focusedNodeId ? nodes.find(n => n.id === focusedNodeId) : null;
    const focusedLabel = focusedNode
        ? getDisplayId(focusedNode.data.category, focusedNode.data.entry as Record<string, unknown>) || focusedNodeId
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
                    onNodeClick={handleNodeClickOrDbl}
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
                        style={{background: 'var(--bg-secondary)', border: '1px solid var(--border-dim)', borderRadius: '8px'}}
                    />

                    <Panel position="bottom-right" style={{bottom: 210}}>
                        <div className={styles.sidePanel}>
                            <div className={styles.schemeToggle}>
                                <button className={`${styles.schemeBtn} ${colorScheme === 'source'      ? styles.schemeBtnActive : ''}`} onClick={() => setColorScheme('source')}>Source</button>
                                <button className={`${styles.schemeBtn} ${colorScheme === 'destination' ? styles.schemeBtnActive : ''}`} onClick={() => setColorScheme('destination')}>Destination</button>
                            </div>
                            <div className={styles.legend}>
                                <div className={styles.legendTitle}>Legend</div>
                                <div className={styles.legendItem}>
                                    <svg width="32" height="10" overflow="visible">
                                        <line x1="0" y1="5" x2="32" y2="5" stroke="#64748b" strokeWidth="2" strokeDasharray="8 4" className={styles.legendAnimatedLine}/>
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
                                        <line x1="0" y1="5" x2="32" y2="5" stroke="#64748b" strokeWidth="2" strokeDasharray="5 3"/>
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

                    <CardLayer
                        cards={cards}
                        edges={edges}
                        closeCard={closeCard}
                        onHeaderMouseDown={onHeaderMouseDown}
                        onResizeMouseDown={onResizeMouseDown}
                    />
                </ReactFlow>
            </div>
        </ColorSchemeContext.Provider>
    );
};
