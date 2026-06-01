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

interface SplitSide {
    lineNum: number;
    text: string;
    removed?: boolean;
    added?: boolean;
}

interface SplitRow {
    left: SplitSide | null;
    right: SplitSide | null;
    hunkHeader?: string;
}

// builds paired left/right rows for the split view
// removed and added lines that appear together are zipped side by side (not stacked)
function buildSplitRows(
    patch: ReturnType<typeof structuredPatch>,
    showFullFile: boolean
): SplitRow[] {
    const rows: SplitRow[] = [];

    for (const hunk of patch.hunks) {
        if (!showFullFile) {
            rows.push({
                left: null,
                right: null,
                hunkHeader: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
            });
        }

        let fromNum = hunk.oldStart;
        let toNum = hunk.newStart;

        const removedBuf: { lineNum: number; text: string }[] = [];
        const addedBuf: { lineNum: number; text: string }[] = [];

        // flush accumulates removed/added runs into aligned pairs before moving to the next context line
        const flushBuffers = () => {
            const maxLen = Math.max(removedBuf.length, addedBuf.length);
            for (let i = 0; i < maxLen; i++) {
                const leftSide = removedBuf[i] ? { ...removedBuf[i], removed: true as const } : null;
                const rightSide = addedBuf[i] ? { ...addedBuf[i], added: true as const } : null;
                rows.push({ left: leftSide, right: rightSide });
            }
            removedBuf.length = 0;
            addedBuf.length = 0;
        };

        for (const line of hunk.lines) {
            const prefix = line[0];
            const text = line.slice(1);
            if (prefix === '-') { removedBuf.push({ lineNum: fromNum, text }); fromNum++; }
            else if (prefix === '+') { addedBuf.push({ lineNum: toNum, text }); toNum++; }
            else { flushBuffers(); rows.push({ left: { lineNum: fromNum, text }, right: { lineNum: toNum, text } }); fromNum++; toNum++; }
        }
        flushBuffers();
    }

    return rows;
}

function getSplitCellBg(side: SplitSide | null): string {
    if (side === null) return styles.splitCellEmpty;
    if (side.removed) return styles.lineRemoved;
    if (side.added) return styles.lineAdded;
    return '';
}

function buildSplitContent(
    patch: ReturnType<typeof structuredPatch>,
    showFullFile: boolean,
    toContent: string
): React.ReactNode[] {
    const rows = buildSplitRows(patch, showFullFile);

    if (patch.hunks.length === 0) {
        toContent.split('\n').forEach((text, i) => {
            const side: SplitSide = { lineNum: i + 1, text };
            rows.push({ left: side, right: side });
        });
    }

    return rows.map((row, i) => {
        if (row.hunkHeader !== undefined) {
            return <div key={`hunk-${i}`} className={styles.hunkHeader}>{row.hunkHeader}</div>;
        }

        const leftBg = getSplitCellBg(row.left);
        const rightBg = getSplitCellBg(row.right);
        const leftGutter = row.left?.removed ? '-' : ' ';
        const rightGutter = row.right?.added ? '+' : ' ';

        return (
            <div key={i} className={styles.splitRow}>
                <span className={`${styles.splitCell} ${styles.splitCellLeft} ${leftBg}`}>
                    <span className={styles.splitLineNum}>{row.left ? row.left.lineNum : ''}</span>
                    <span className={styles.gutter}>{leftGutter}</span>
                    <span className={styles.lineContent}>{row.left ? renderSegments(row.left.text) : ''}</span>
                </span>
                <span className={`${styles.splitCell} ${rightBg}`}>
                    <span className={styles.splitLineNum}>{row.right ? row.right.lineNum : ''}</span>
                    <span className={styles.gutter}>{rightGutter}</span>
                    <span className={styles.lineContent}>{row.right ? renderSegments(row.right.text) : ''}</span>
                </span>
            </div>
        );
    });
}

function buildUnifiedContent(
    patch: ReturnType<typeof structuredPatch>,
    showFullFile: boolean,
    toContent: string
): React.ReactNode[] {
    const lines: React.ReactNode[] = [];

    patch.hunks.forEach((hunk, hunkIndex) => {
        if (!showFullFile) {
            lines.push(
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

            let lineClass = styles.lineContext;
            if (isAdded) lineClass = styles.lineAdded;
            if (isRemoved) lineClass = styles.lineRemoved;

            const fromDisplay = isAdded ? '' : String(fromNum);
            const toDisplay = isRemoved ? '' : String(toNum);

            if (!isAdded) fromNum++;
            if (!isRemoved) toNum++;

            lines.push(
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

    if (patch.hunks.length === 0) {
        toContent.split('\n').forEach((text, i) => {
            lines.push(
                <div key={i} className={`${styles.diffLine} ${styles.lineContext}`}>
                    <span className={styles.lineNum}>
                        <span className={styles.lineNumSlot}>{i + 1}</span>
                        <span className={styles.lineNumDivider}>·</span>
                        <span className={styles.lineNumSlot}>{i + 1}</span>
                    </span>
                    <span className={styles.gutter}> </span>
                    <span className={styles.lineContent}>{renderSegments(text)}</span>
                </div>
            );
        });
    }

    return lines;
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
    const [splitMode, setSplitMode] = useState(false);

    // recompute the patch whenever the content or context setting changes
    // passing MAX_SAFE_INTEGER as context forces every line into one hunk (full-file mode)
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

    const hasChanges = patch.hunks.length > 0;
    const content = splitMode
        ? buildSplitContent(patch, showFullFile, toContent ?? '')
        : buildUnifiedContent(patch, showFullFile, toContent ?? '');

    return (
        <div className={styles.diffWrapper}>
            <div className={styles.diffHeader}>
                <span className={styles.diffLabel}>{fromLabel}</span>
                <span className={styles.diffArrow}>→</span>
                <span className={styles.diffLabel}>{toLabel}</span>
                {!hasChanges && <span className={`text-small ${styles.noDiff}`}>No differences</span>}
                {hasChanges && (
                    <button className={styles.toggleButton} onClick={() => setSplitMode(v => !v)}>
                        {splitMode ? 'Unified' : 'Split'}
                    </button>
                )}
                {hasChanges && (
                    <button className={styles.toggleButton} onClick={() => setShowFullFile(v => !v)}>
                        {showFullFile ? 'Show diff only' : 'Show full file'}
                    </button>
                )}
            </div>
            <div className={styles.diffContainer}>
                {content}
            </div>
        </div>
    );
};
