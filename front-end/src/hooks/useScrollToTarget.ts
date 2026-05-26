import { useRef, useEffect, RefObject } from 'react';
import { Document, LineCounter } from 'yaml';
import { resolvePathToNode, getLineHeight } from '../pages/yamlEditor/yamlLineUtils';

interface ParsedDoc {
    doc: Document;
    lineCounter: LineCounter;
}

interface ScrollTarget {
    path: string;
    key: number;
}

export function useScrollToTarget(
    containerRef: RefObject<HTMLDivElement | null>,
    parsedDoc: ParsedDoc | null,
    scrollToTarget: ScrollTarget | null | undefined,
): void {
    const lastScrolledKeyRef = useRef<number | null>(null);

    useEffect(() => {
        if (!scrollToTarget || !parsedDoc || !containerRef.current) return;
        if (lastScrolledKeyRef.current === scrollToTarget.key) return;
        lastScrolledKeyRef.current = scrollToTarget.key;

        const { doc, lineCounter } = parsedDoc;
        const node = resolvePathToNode(doc, scrollToTarget.path);

        if (node && node.range) {
            const targetLine = lineCounter.linePos(node.range[0]).line;
            containerRef.current.scrollTop = (targetLine - 1) * getLineHeight(containerRef.current);
        }
    }, [scrollToTarget, parsedDoc, containerRef]);
}
