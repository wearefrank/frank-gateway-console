import {useState, useCallback, useRef} from 'react';
import type React from 'react';
import type {Node} from '@xyflow/react';
import type {ConfigNodeData} from './buildTopology';
import type {DetailCard} from './CardLayer';

type DragState   = {id: string; startX: number; startY: number; origX: number; origY: number; zoom: number};
type ResizeState = {id: string; startX: number; startY: number; startScale: number};

/**
 * Manages floating detail cards: open/close, drag, and resize.
 * Attach `pageRef` to the root page div so click coordinates can be
 * converted from screen-space to flow-space.
 */
export function useDetailCards() {
    const [cards, setCards] = useState<DetailCard[]>([]);

    const pageRef      = useRef<HTMLDivElement>(null);
    const viewportRef  = useRef({x: 0, y: 0, zoom: 1});
    const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dragRef      = useRef<DragState | null>(null);
    const resizeRef    = useRef<ResizeState | null>(null);

    /** Keep viewportRef in sync with ReactFlow's onMove callback. */
    const handleViewportMove = useCallback((_: unknown, vp: {x: number; y: number; zoom: number}) => {
        viewportRef.current = vp;
    }, []);

    /**
     * Open a card on single-click (debounced 220 ms so double-click can cancel it).
     * Re-opening an existing card brings it to the front without moving it.
     */
    const handleNodeClick = useCallback((e: React.MouseEvent, node: Node<ConfigNodeData>) => {
        const rect = pageRef.current?.getBoundingClientRect() ?? {left: 0, top: 0};
        const {x: vpX, y: vpY, zoom} = viewportRef.current;
        const x = (e.clientX - rect.left - vpX) / zoom + 20;
        const y = (e.clientY - rect.top  - vpY) / zoom - 20;

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

    /** Cancel a pending single-click — called by the double-click handler in TopologyPage. */
    const cancelPendingClick = useCallback(() => {
        if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current);
            clickTimerRef.current = null;
        }
    }, []);

    const closeCard     = useCallback((id: string) => setCards(prev => prev.filter(c => c.id !== id)), []);
    const closeAllCards = useCallback(() => setCards([]), []);

    /** Drag a card by its header. Divides pixel delta by zoom to stay in flow-space. */
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
            setCards(prev => prev.map(c =>
                c.id === id ? {...c, x: origX + (me.clientX - startX) / zoom, y: origY + (me.clientY - startY) / zoom} : c
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

    /** Resize a card via the bottom-right grip handle. */
    const onResizeMouseDown = useCallback((e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        const card = cards.find(c => c.id === id);
        if (!card) return;

        resizeRef.current = {id, startX: e.clientX, startY: e.clientY, startScale: card.scale};

        const onMove = (me: MouseEvent) => {
            if (!resizeRef.current) return;
            const {id, startX, startY, startScale} = resizeRef.current;
            const delta    = (me.clientX - startX + me.clientY - startY) * 0.004;
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

    return {
        cards,
        pageRef,
        handleViewportMove,
        handleNodeClick,
        cancelPendingClick,
        closeCard,
        closeAllCards,
        onHeaderMouseDown,
        onResizeMouseDown,
    };
}
