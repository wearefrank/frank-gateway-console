import React, {useMemo, useRef, useCallback} from 'react';
import {ValidationLog} from '../../../actions/ValidationLogger';
import {parseYamlDoc, resolvePathToNode, buildLineSegments, buildCategoryLineMap, getLineHeight} from '../yamlLineUtils';
import { CATEGORY_DEFINITIONS } from '../../../config/categoryDefinitions';
import { useVisibleCategory } from '../../../hooks/useVisibleCategory';
import { useScrollToTarget } from '../../../hooks/useScrollToTarget';
import styles from '../YamlEditor.module.css';

interface ConfigEditorProps {
    configText: string;
    showWhitespace: boolean;
    fillDefaults: boolean;
    validConfig: boolean;
    yamlValid: boolean;
    validationLogs?: ValidationLog[];
    onConfigChange: (newValue: string) => void;
    onToggleWhitespace: () => void;
    onToggleFillDefaults: () => void;
    onLineClick?: (log: ValidationLog) => void;
    scrollToTarget?: { path: string; key: number } | null;
    onSaveVersion?: () => void;
}


function handleTab(
    value: string,
    selectionStart: number,
    selectionEnd: number,
    dedent: boolean,
): {newText: string; newStart: number; newEnd: number} {
    const hasSelection = selectionStart !== selectionEnd;

    if (!hasSelection) {
        if (dedent) {
            // remove up to 2 leading spaces on the current line
            const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
            const spacesToRemove = Math.min(2, value.slice(lineStart).match(/^ */)?.[0].length ?? 0);
            if (spacesToRemove === 0) return {newText: value, newStart: selectionStart, newEnd: selectionEnd};
            const newText = value.slice(0, lineStart) + value.slice(lineStart + spacesToRemove);
            const newPos = Math.max(lineStart, selectionStart - spacesToRemove);
            return {newText, newStart: newPos, newEnd: newPos};
        }
        const newText = value.slice(0, selectionStart) + '  ' + value.slice(selectionEnd);
        return {newText, newStart: selectionStart + 2, newEnd: selectionStart + 2};
    }

    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const lineEnd = value.indexOf('\n', selectionEnd - 1);
    const blockEnd = lineEnd === -1 ? value.length : lineEnd;

    const block = value.slice(lineStart, blockEnd);
    const lines = block.split('\n');

    let startDelta = 0;
    let totalDelta = 0;

    const newLines = lines.map((line, i) => {
        if (dedent) {
            const removed = Math.min(2, line.match(/^ */)?.[0].length ?? 0);
            if (i === 0) startDelta = -removed;
            totalDelta -= removed;
            return line.slice(removed);
        }
        if (i === 0) startDelta = 2;
        totalDelta += 2;
        return '  ' + line;
    });

    const newBlock = newLines.join('\n');
    const newText = value.slice(0, lineStart) + newBlock + value.slice(blockEnd);
    const newStart = Math.max(lineStart, selectionStart + startDelta);
    const newEnd = Math.max(newStart, selectionEnd + totalDelta);
    return {newText, newStart, newEnd};
}

function handleEnter(
    value: string,
    selectionStart: number,
    selectionEnd: number,
): {newText: string; newCursor: number} {
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const currentLine = value.slice(lineStart, selectionStart);
    const indent = currentLine.match(/^ */)?.[0] ?? '';
    const extraIndent = currentLine.trimEnd().endsWith(':') ? '  ' : '';
    const newText = value.slice(0, selectionStart) + '\n' + indent + extraIndent + value.slice(selectionEnd);
    return {newText, newCursor: selectionStart + 1 + indent.length + extraIndent.length};
}

function toggleLineComments(
    value: string,
    selectionStart: number,
    selectionEnd: number,
): {newText: string; newStart: number; newEnd: number} {
    // expand the selection to full lines so partial selections still affect the whole line
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const lineEnd = value.indexOf('\n', selectionEnd);
    const blockEnd = lineEnd === -1 ? value.length : lineEnd;

    const block = value.slice(lineStart, blockEnd);
    const lines = block.split('\n');

    // only uncomment if every non-empty line is already commented, otherwise comment all
    const nonEmpty = lines.filter(l => l.trim() !== '');
    const allCommented = nonEmpty.length > 0 && nonEmpty.every(l => /^\s*#/.test(l));

    const newLines = lines.map(line => {
        if (line.trim() === '') return line;
        // keep leading whitespace when uncommenting so indentation is preserved
        if (allCommented) return line.replace(/^(\s*)# ?/, '$1');
        return '# ' + line;
    });

    const newBlock = newLines.join('\n');
    const newText = value.slice(0, lineStart) + newBlock + value.slice(blockEnd);
    // shift the selection by how many chars were added/removed so it doesn't jump around
    const newStart = Math.max(lineStart, selectionStart + (newLines[0].length - lines[0].length));
    const newEnd = Math.max(lineStart, selectionEnd + (newBlock.length - block.length));

    return {newText, newStart, newEnd};
}

export const ConfigEditor = ({
                                 configText,
                                 showWhitespace,
                                 fillDefaults,
                                 validConfig,
                                 yamlValid,
                                 validationLogs = [],
                                 onConfigChange,
                                 onToggleWhitespace,
                                 onToggleFillDefaults,
                                 onLineClick,
                                 scrollToTarget,
                                 onSaveVersion,
                             }: ConfigEditorProps) => {

    const editorContainerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {

        // Comment out shortcut
        if ((e.ctrlKey || e.metaKey) && e.key === '/') {
            e.preventDefault();
            const {selectionStart, selectionEnd, value} = e.currentTarget;
            const {newText, newStart, newEnd} = toggleLineComments(value, selectionStart, selectionEnd);
            onConfigChange(newText);
            requestAnimationFrame(() => textareaRef.current?.setSelectionRange(newStart, newEnd));
        }

        // indenting
        if (e.key === 'Tab') {
            e.preventDefault();
            const {selectionStart, selectionEnd, value} = e.currentTarget;
            const {newText, newStart, newEnd} = handleTab(value, selectionStart, selectionEnd, e.shiftKey);
            onConfigChange(newText);
            requestAnimationFrame(() => textareaRef.current?.setSelectionRange(newStart, newEnd));
        }

        // newline + indenting
        if (e.key === 'Enter') {
            e.preventDefault();
            const {selectionStart, selectionEnd, value} = e.currentTarget;
            const {newText, newCursor} = handleEnter(value, selectionStart, selectionEnd);
            onConfigChange(newText);
            requestAnimationFrame(() => textareaRef.current?.setSelectionRange(newCursor, newCursor));
        }
    };

    const parsedDoc = useMemo(() => {
        if (!configText) return null;
        try { return parseYamlDoc(configText); }
        catch { return null; }
    }, [configText]);

    // editor text highlighting
    const { errorLines, errorLineLogMap } = useMemo(() => {
        const lines = new Set<number>();
        const logMap = new Map<number, ValidationLog>();
        if (!parsedDoc) return { errorLines: lines, errorLineLogMap: logMap };

        const {doc, lineCounter} = parsedDoc;

        // Highlight YAML syntax errors (only the exact line, no log to navigate to)
        for (const err of doc.errors) {
            if (err.pos && err.pos.length >= 1) {
                lines.add(lineCounter.linePos(err.pos[0]).line);
            }
        }

        // Highlight schema validation errors and map lines to logs
        validationLogs.forEach(log => {
            if ((log.type === 'error' || log.type === 'warning') && log.path) {
                const node = resolvePathToNode(doc, log.path);
                if (node && node.range) {
                    const startLine = lineCounter.linePos(node.range[0]).line;
                    const endLine = lineCounter.linePos(node.range[1]).line;
                    for (let i = startLine; i <= endLine; i++) {
                        lines.add(i);
                        if (!logMap.has(i)) logMap.set(i, log);
                    }
                }
            }
        });

        return { errorLines: lines, errorLineLogMap: logMap };
    }, [parsedDoc, validationLogs]);

    const categoryLineMap = useMemo(() => {
        if (!parsedDoc) return new Map<number, string>();
        return buildCategoryLineMap(parsedDoc.doc, parsedDoc.lineCounter);
    }, [parsedDoc]);

    const categoryStartLines = useMemo(() => {
        const starts = new Map<string, number>();
        for (const [line, cat] of categoryLineMap) {
            const existing = starts.get(cat);
            if (existing === undefined || line < existing) starts.set(cat, line);
        }
        return starts;
    }, [categoryLineMap]);

    const handleJumpToCategory = useCallback((category: string) => {
        const line = categoryStartLines.get(category);
        if (line === undefined || !editorContainerRef.current) return;
        editorContainerRef.current.scrollTop = (line - 1) * getLineHeight(editorContainerRef.current);
    }, [categoryStartLines, editorContainerRef]);

    const visibleCategory = useVisibleCategory(editorContainerRef, categoryLineMap);
    useScrollToTarget(editorContainerRef, parsedDoc, scrollToTarget);

    let statusClass = null;
    let statusLabel = null;
    if (configText) {
        if (!yamlValid) {
            statusClass = styles.statusError;
            statusLabel = 'YAML error';
        } else if (!validConfig) {
            statusClass = styles.statusWarning;
            statusLabel = 'Has errors';
        } else {
            statusClass = styles.statusValid;
            statusLabel = 'Valid';
        }
    }

    return (
        <div
            className={`card flex flex-column ${styles.configCard} ${validConfig ? styles.editorContainer : styles.editorContainerInvalid}`}>
            <div className="card-header flex align-center gap-sm">
                Parsed Configuration
                {statusClass && <span className={statusClass}>{statusLabel}</span>}
            </div>
            {/* toolbar just below the header eg: "hide whitespaces" */}
            <div className={styles.editorToolbar}>
                <button
                    className={showWhitespace ? `btn-primary text-small ${styles.btnIcon}` : `text-small ${styles.btnIcon}`}
                    onClick={onToggleWhitespace}
                    title="Show Whitespace"
                >
                    {showWhitespace ? 'Hide Whitespaces' : 'Show Whitespaces'}
                </button>

                <button
                    className={fillDefaults ? `btn-primary text-small ${styles.btnIcon}` : `text-small ${styles.btnIcon}`}
                    onClick={onToggleFillDefaults}
                    title="Fill in Defaults"
                >
                    {fillDefaults ? 'Don\'t fill' : 'Fill'}
                </button>

                {onSaveVersion && (
                    <button
                        className={`text-small ${styles.btnIcon}`}
                        onClick={onSaveVersion}
                    >
                        Commit
                    </button>
                )}
            </div>
            {/* Category banner */}
            {configText && (
                <div
                    className={styles.categoryBanner}
                    style={visibleCategory ? { borderLeftColor: CATEGORY_DEFINITIONS[visibleCategory]?.color } : undefined}
                >
                    <span>{visibleCategory ? CATEGORY_DEFINITIONS[visibleCategory]?.label : ''}</span>
                    {categoryStartLines.size > 0 && (
                        <div className={styles.categoryNavPills}>
                            {[...categoryStartLines.keys()].map(cat => {
                                // we only wanna show known and present categories
                                const def = CATEGORY_DEFINITIONS[cat];
                                const isActive = cat === visibleCategory;
                                return (
                                    <button
                                        key={cat}
                                        className={isActive ? styles.categoryNavPillActive : styles.categoryNavPill}
                                        style={{ '--pill-color': def?.color } as React.CSSProperties}
                                        onClick={() => handleJumpToCategory(cat)}
                                    >
                                        {def?.label ?? cat}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
            {/* YAML editor */}
            <div className={styles.editorContainer} ref={editorContainerRef}>
                <div className={styles.editorGrid}>
                    {/* Line numbers gutter */}
                    {configText && (
                        <div className={styles.lineNumbers}>
                            {configText.split('\n').map((_, index) => {
                                const lineNum = index + 1;
                                const log = errorLineLogMap.get(lineNum);
                                if (log) {
                                    return (
                                        <div
                                            key={index}
                                            className={styles.lineNumberError}
                                            title="Go to error"
                                            onClick={() => onLineClick?.(log)}
                                        >
                                            {lineNum}
                                        </div>
                                    );
                                }
                                return <div key={index}>{lineNum}</div>;
                            })}
                        </div>
                    )}

                    {/* Category color strip */}
                    {configText && (
                        <div className={styles.categoryStrip}>
                            {configText.split('\n').map((_, index) => {
                                const category = categoryLineMap.get(index + 1);
                                const color = category ? CATEGORY_DEFINITIONS[category]?.color : undefined;
                                return (
                                    <div
                                        key={index}
                                        className={styles.categoryStripLine}
                                        style={color ? { backgroundColor: color } : undefined}
                                    />
                                );
                            })}
                        </div>
                    )}

                    {/* Spacer between category strip and editor */}
                    {configText && <div />}

                    {/* Editor layers (stacked via grid-area) */}
                    <div className={styles.editorLayers}>
                        {/* Hidden pre to provide dimensions */}
                        <pre className={styles.editorBase}>
                            {configText + (configText.endsWith('\n') ? ' ' : '\n')}
                        </pre>

                        {/* Overlay for highlights, comments, and whitespace markers */}
                        <div className={styles.editorOverlay}>
                            {configText.split('\n').map((line, index) => (
                                <div key={index} className={`${styles.lineOverlay} ${errorLines.has(index + 1) ? styles.errorLineBg : ''}`}>
                                    {buildLineSegments(line, showWhitespace).map((seg, i) => {
                                        let cls: string | undefined;
                                        if (seg.type === 'comment') cls = styles.commentText;
                                        else if (seg.type === 'whitespace') cls = styles.whitespaceText;
                                        else if (seg.type === 'placeholder') cls = styles.placeholderText;
                                        else if (seg.type === 'key') cls = styles.keyText;
                                        return <span key={i} className={cls}>{seg.text}</span>;
                                    })}
                                </div>
                            ))}
                        </div>

                        {/* Actual Textarea */}
                        <textarea
                            ref={textareaRef}
                            value={configText}
                            onChange={(e) => onConfigChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            spellCheck={false}
                            className={styles.editorTextarea}
                        />
                    </div>

                    {!configText && (
                        <div className={`flex align-center justify-center text-muted text-small ${styles.editorPlaceholder}`}>
                            No file uploaded yet.<br/>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
