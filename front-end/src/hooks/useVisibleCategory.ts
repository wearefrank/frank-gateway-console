import { useState, useEffect, RefObject } from 'react';
import { getLineHeight } from '../pages/yamlEditor/yamlLineUtils';

export function useVisibleCategory(
    containerRef: RefObject<HTMLDivElement | null>,
    categoryLineMap: Map<number, string>,
): string | null {
    const [visibleCategory, setVisibleCategory] = useState<string | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const update = () => {
            const topLine = Math.floor(container.scrollTop / getLineHeight(container)) + 1;
            setVisibleCategory(categoryLineMap.get(topLine) ?? null);
        };

        update();
        container.addEventListener('scroll', update, { passive: true });
        return () => container.removeEventListener('scroll', update);
    }, [containerRef, categoryLineMap]);

    return visibleCategory;
}
