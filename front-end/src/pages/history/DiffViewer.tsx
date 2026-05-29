import React, { useMemo, useState } from 'react';
import { structuredPatch } from 'diff';
import { buildLineSegments, type SegmentType } from '../yamlEditor/yamlLineUtils';
import styles from './DiffViewer.module.css';

function segmentClassName(type: SegmentType): string | undefined {
    if (type === 'whitespace') return styles.whitespaceText;
    if (type === 'comment') return styles.commentText;
    if (type === 'key') return styles.keyText;
    if (type === 'placeholder') return styles.placeholderText;
    return undefined;
}

function renderSegments(text: string): React.ReactNode {
    if (!text) return '\u00a0';
    return buildLineSegments(text, true).map((seg, i) => {
        const cls = segmentClassName(seg.type);
        if (cls) return <span key={i} className={cls}>{seg.text}</span>;
        return seg.text;
    });
}

interface DiffViewerProps {
    fromContent: string | null;
    toContent: string | null;
    fromLabel: string;
    toLabel: string;
    loading: boolean;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
    fromContent,
    toContent,
    fromLabel,
    toLabel,
    loading,
}) => {
    const [showFullFile, setShowFullFile] = useState(false);

    const patch = useMemo(() => {
        if (!fromContent || !toContent) return null;
        const context = showFullFile ? Number.MAX_SAFE_INTEGER : 4;
        return structuredPatch('', '', fromContent, toContent, '', '', { context });
    }, [fromContent, toContent, showFullFile]);

    if (loading) {
        return <div className={`text-muted text-small ${styles.placeholder}`}>Loading...</div>;
    }

    if (!patch) {
        return (
            <div className={`text-muted text-small ${styles.placeholder}`}>
                Select two versions to compare
            </div>
        );
    }

    const renderedLines: React.ReactNode[] = [];

    patch.hunks.forEach((hunk, hunkIndex) => {
        if (!showFullFile) {
            renderedLines.push(
                <div key={`hunk-${hunkIndex}`} className={styles.hunkHeader}>
                    @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                </div>
            );
        }

        let fromNum = hunk.oldStart;
        let toNum = hunk.newStart;

        hunk.lines.forEach((line, lineIndex) => {
            const prefix = line[0];
            const text = line.slice(1);
            const isAdded = prefix === '+';
            const isRemoved = prefix === '-';
            const lineClass = isAdded ? styles.lineAdded : isRemoved ? styles.lineRemoved : styles.lineContext;
            const fromDisplay = isAdded ? '' : String(fromNum);
            const toDisplay = isRemoved ? '' : String(toNum);

            if (!isAdded) fromNum++;
            if (!isRemoved) toNum++;

            renderedLines.push(
                <div key={`${hunkIndex}-${lineIndex}`} className={`${styles.diffLine} ${lineClass}`}>
                    <span className={styles.lineNum}>
                        <span className={styles.lineNumSlot}>{fromDisplay}</span>
                        <span className={styles.lineNumDivider}>·</span>
                        <span className={styles.lineNumSlot}>{toDisplay}</span>
                    </span>
                    <span className={styles.gutter}>{prefix}</span>
                    <span className={styles.lineContent}>{renderSegments(text)}</span>
                </div>
            );
        });
    });

    const hasChanges = patch.hunks.length > 0;

    return (
        <div className={styles.diffWrapper}>
            <div className={styles.diffHeader}>
                <span className={styles.diffLabel}>{fromLabel}</span>
                <span className={styles.diffArrow}>→</span>
                <span className={styles.diffLabel}>{toLabel}</span>
                {!hasChanges && <span className="text-muted text-small">No differences</span>}
                <button
                    className={styles.toggleButton}
                    onClick={() => setShowFullFile(v => !v)}
                >
                    {showFullFile ? 'Show diff only' : 'Show full file'}
                </button>
            </div>
            <div className={styles.diffContainer}>
                {renderedLines}
            </div>
        </div>
    );
};
