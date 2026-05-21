import React, {useEffect, useMemo, useRef} from 'react';
import {ValidationLog} from '../../../actions/ValidationLogger';
import {parseYamlDoc, resolvePathToNode} from '../yamlLineUtils';
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
    onNewConfig: () => void;
    scrollToTarget?: { path: string; key: number } | null;
}

type SegmentType = 'normal' | 'whitespace' | 'comment';

/**
 * find the first # in a line thats not inside ' ' or " "
 *
 * @param line - line/text to annalyze
 *
 * @returns returns the char number where the comments starts
 */
function findCommentStart(line: string): number {
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === "'" && !inDouble) inSingle = !inSingle;
        else if (c === '"' && !inSingle) inDouble = !inDouble;
        else if (c === '#' && !inSingle && !inDouble) return i;
    }
    return -1;
}

/**
 * Function to determine what color a line should be or to generate the whitespaces
 *
 * @param line           - line/text to annalyze
 * @param showWhitespace - bool if whitespaces should be generated
 */
function buildLineSegments(line: string, showWhitespace: boolean): { text: string; type: SegmentType }[] {
    const commentIdx = findCommentStart(line);
    const leadingSpaces = line.match(/^ */)?.[0].length ?? 0;
    const segments: { text: string; type: SegmentType }[] = [];

    // append the new char to the same segment if they connect
    const push = (char: string, type: SegmentType) => {
        const last = segments[segments.length - 1];
        if (last?.type === type) {
            last.text += char;
        } else {
            segments.push({text: char, type});
        }
    };

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const isComment = commentIdx !== -1 && i >= commentIdx;

        if (isComment) {
            push(char, 'comment');
        } else if (showWhitespace && char === ' ') {
            const isLeading = i < leadingSpaces;
            const indentMarker = i % 2 === 0 ? '·' : '│';
            const marker = isLeading ? indentMarker : '·';
            push(marker, 'whitespace');
        } else {
            push(char, 'normal');
        }
    }

    return segments;
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
                                 onNewConfig,
                                 scrollToTarget
                             }: ConfigEditorProps) => {

    const editorContainerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.ctrlKey || e.metaKey) && e.key === '/') {
            e.preventDefault();
            const {selectionStart, selectionEnd, value} = e.currentTarget;
            const {newText, newStart, newEnd} = toggleLineComments(value, selectionStart, selectionEnd);
            onConfigChange(newText);
            requestAnimationFrame(() => textareaRef.current?.setSelectionRange(newStart, newEnd));
        }

        if (e.key === 'Tab') {
            e.preventDefault();
            const {selectionStart, selectionEnd, value} = e.currentTarget;
            const {newText, newStart, newEnd} = handleTab(value, selectionStart, selectionEnd, e.shiftKey);
            onConfigChange(newText);
            requestAnimationFrame(() => textareaRef.current?.setSelectionRange(newStart, newEnd));
        }

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

    const errorLines = useMemo(() => {
        const lines = new Set<number>();
        if (!parsedDoc) return lines;

        const {doc, lineCounter} = parsedDoc;

        // Highlight YAML syntax errors (only the exact line)
        for (const err of doc.errors) {
            if (err.pos && err.pos.length >= 1) {
                lines.add(lineCounter.linePos(err.pos[0]).line);
            }
        }

        // Highlight schema validation errors
        validationLogs.forEach(log => {
            if ((log.type === 'error' || log.type === 'warning') && log.path) {
                const node = resolvePathToNode(doc, log.path);
                if (node && node.range) {
                    const startLine = lineCounter.linePos(node.range[0]).line;
                    const endLine = lineCounter.linePos(node.range[1]).line;
                    for (let i = startLine; i <= endLine; i++) lines.add(i);
                }
            }
        });

        return lines;
    }, [parsedDoc, validationLogs]);

    useEffect(() => {
        if (!scrollToTarget || !parsedDoc || !editorContainerRef.current) return;

        const {doc, lineCounter} = parsedDoc;
        const node = resolvePathToNode(doc, scrollToTarget.path);

        if (node && node.range) {
            const targetLine = lineCounter.linePos(node.range[0]).line;
            const lineHeight = parseFloat(getComputedStyle(editorContainerRef.current).lineHeight) || 21;
            editorContainerRef.current.scrollTop = (targetLine - 1) * lineHeight;
        }
    }, [scrollToTarget, parsedDoc]);



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
            <div className="card-header flex justify-between align-center">
                <div className="flex align-center gap-sm">
                    Parsed Configuration
                    {statusClass && <span className={statusClass}>{statusLabel}</span>}
                </div>
                <div className="flex align-center gap-sm">
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

                    <button
                        className={`text-small ${styles.btnIcon}`}
                        onClick={onNewConfig}
                    >
                        New
                    </button>
                </div>
            </div>
            <div className={styles.editorContainer} ref={editorContainerRef}>
                <div className={styles.editorGrid}>
                    {/* Line numbers gutter */}
                    {configText && (
                        <div className={styles.lineNumbers}>
                            {configText.split('\n').map((_, index) => (
                                <div key={index}>{index + 1}</div>
                            ))}
                        </div>
                    )}

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
                                    {buildLineSegments(line, showWhitespace).map((seg, i) => (
                                        <span key={i} className={seg.type === 'comment' ? styles.commentText : seg.type === 'whitespace' ? styles.whitespaceText : undefined}>{seg.text}</span>
                                    ))}
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
