import React, {useEffect, useMemo, useRef} from 'react';
import {ValidationLog} from '../../../actions/ValidationLogger';
import {parseYamlDoc, resolvePathToNode} from '../yamlLineUtils';
import styles from '../YamlEditor.module.css';

interface ConfigEditorProps {
    configText: string;
    viewMode: 'yaml' | 'json';
    showWhitespace: boolean;
    fillDefaults: boolean;
    validConfig: boolean;
    validationLogs?: ValidationLog[];
    onConfigChange: (newValue: string) => void;
    onToggleWhitespace: () => void;
    onToggleFillDefaults: () => void;
    onToggleViewMode: (mode: 'yaml' | 'json') => void;
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


export const ConfigEditor = ({
                                 configText,
                                 viewMode,
                                 showWhitespace,
                                 fillDefaults,
                                 validConfig,
                                 validationLogs = [],
                                 onConfigChange,
                                 onToggleWhitespace,
                                 onToggleFillDefaults,
                                 onToggleViewMode,
                                 onNewConfig,
                                 scrollToTarget
                             }: ConfigEditorProps) => {

    const editorContainerRef = useRef<HTMLDivElement>(null);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.ctrlKey || e.metaKey) && e.key === '/') {
            e.preventDefault();

            const textarea = e.currentTarget;
            const { selectionStart, selectionEnd, value } = textarea;

            const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
            const lineEnd = value.indexOf('\n', selectionEnd);
            const blockEnd = lineEnd === -1 ? value.length : lineEnd;

            const block = value.slice(lineStart, blockEnd);
            const lines = block.split('\n');

            const nonEmpty = lines.filter(l => l.trim() !== '');
            const allCommented = nonEmpty.length > 0 && nonEmpty.every(l => /^\s*#/.test(l));

            const newLines = lines.map(line => {
                if (line.trim() === '') return line;
                if (allCommented) {
                    return line.replace(/^(\s*)# ?/, '$1');
                } else {
                    const indentMatch = line.match(/^(\s*)/);
                    const indent = indentMatch ? indentMatch[1] : '';
                    return indent + '# ' + line.slice(indent.length);
                }
            });

            const newBlock = newLines.join('\n');
            const newText = value.slice(0, lineStart) + newBlock + value.slice(blockEnd);

            const firstLineDelta = newLines[0].length - lines[0].length;
            const totalDelta = newBlock.length - block.length;

            onConfigChange(newText);

            requestAnimationFrame(() => {
                const newStart = Math.max(lineStart, selectionStart + firstLineDelta);
                const newEnd = Math.max(lineStart, selectionEnd + totalDelta);
                textarea.setSelectionRange(newStart, newEnd);
            });
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



    return (
        <div
            className={`card flex flex-column ${styles.configCard} ${validConfig ? styles.editorContainer : styles.editorContainerInvalid}`}>
            <div className="card-header flex justify-between align-center">
                Parsed Configuration
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

                    <div className={`flex ${styles.toggleGroup}`}>
                        <button
                            className={viewMode === 'yaml' ? styles.toggleBtnActive : styles.toggleBtn}
                            onClick={() => onToggleViewMode('yaml')}
                        >YAML
                        </button>
                        <button
                            className={viewMode === 'json' ? styles.toggleBtnActive : styles.toggleBtn}
                            onClick={() => onToggleViewMode('json')}
                        >JSON
                        </button>
                    </div>
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
