import {useEffect, useMemo, useRef} from 'react';
import {ValidationLog} from '../../../actions/ValidationLogger';
import {Document, LineCounter, parseDocument, type Node} from 'yaml';

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

    const errorLines = useMemo(() => {
        if (!configText) return new Set<number>();

        const lines = new Set<number>();

        // We use the YAML parser for both YAML and JSON modes since both can be parsed with the same library
        try {
            const lineCounter = new LineCounter();
            const doc: Document = parseDocument(configText, {lineCounter});

            // Highlight YAML syntax errors (only the exact line)
            for (const err of doc.errors) {
                if (err.pos && err.pos.length >= 1) {
                    lines.add(lineCounter.linePos(err.pos[0]).line);
                }
            }

            // Highlight schema validation errors
            validationLogs.forEach(log => {
                if ((log.type === 'error' || log.type === 'warning') && log.path) {

                    const pathParts = log.path.split('/').filter(Boolean).map(p => {
                        const num = parseInt(p, 10);
                        return isNaN(num) ? p : num;
                    });

                    // searches the path parts in the document and returns the node (node is the whole indent)
                    const node = doc.getIn(pathParts, true) as Node;
                    if (node && node.range) {
                        // Added an ofset as everything was 1 line to far as we also want the parent marked
                        const offset: number = -1;

                        const startLine = lineCounter.linePos(node.range[0]).line + offset;
                        const endLine = lineCounter.linePos(node.range[1]).line + offset;

                        // Add all lines in the range
                        for (let i = startLine; i <= endLine; i++) {
                            lines.add(i);
                        }
                    }
                }
            });
        } catch (e) {
            console.error("Error parsing config for highlighting:", e);
        }

        return lines;
    }, [configText, validationLogs]);

    useEffect(() => {
        if (!scrollToTarget || !configText || !editorContainerRef.current) return;

        try {
            const lineCounter = new LineCounter();
            const doc: Document = parseDocument(configText, {lineCounter});

            const pathParts = scrollToTarget.path.split('/').filter(Boolean).map(p => {
                const num = parseInt(p, 10);
                return isNaN(num) ? p : num;
            });

            const node = doc.getIn(pathParts, true) as Node;
            if (node && node.range) {
                const targetLine = lineCounter.linePos(node.range[0]).line;
                const lineHeight = parseFloat(getComputedStyle(editorContainerRef.current).lineHeight) || 21;
                editorContainerRef.current.scrollTop = (targetLine - 1) * lineHeight;
            }
        } catch {
            // ignore scroll errors
        }
    }, [scrollToTarget, configText]);

    return (
        <div
            className={`card flex flex-column config-card ${validConfig ? "editor-container" : "editor-container invalid"}`}>
            <div className="card-header flex justify-between align-center">
                Parsed Configuration
                <div className="flex align-center gap-sm">
                    <button
                        className={showWhitespace ? 'btn-primary text-small btn-icon' : 'text-small btn-icon'}
                        onClick={onToggleWhitespace}
                        title="Show Whitespace"
                    >
                        {showWhitespace ? 'Hide Whitespaces' : 'Show Whitespaces'}
                    </button>

                    <button
                        className={fillDefaults ? 'btn-primary text-small btn-icon' : 'text-small btn-icon'}
                        onClick={onToggleFillDefaults}
                        title="Fill in Defaults"
                    >
                        {fillDefaults ? 'Don\'t fill' : 'Fill'}
                    </button>

                    <div className="flex border rounded overflow-hidden toggle-group">
                        <button
                            className={viewMode === 'yaml' ? 'toggle-btn active' : 'toggle-btn'}
                            onClick={() => onToggleViewMode('yaml')}
                        >YAML
                        </button>
                        <button
                            className={viewMode === 'json' ? 'toggle-btn active' : 'toggle-btn'}
                            onClick={() => onToggleViewMode('json')}
                        >JSON
                        </button>
                    </div>
                    <button
                        className="text-small btn-icon"
                        onClick={onNewConfig}
                    >
                        New
                    </button>
                </div>
            </div>
            <div className={"editor-container"} ref={editorContainerRef}>
                <div className="editor-grid">
                    {/* Line numbers gutter */}
                    {configText && (
                        <div className="line-numbers">
                            {configText.split('\n').map((_, index) => (
                                <div key={index}>{index + 1}</div>
                            ))}
                        </div>
                    )}

                    {/* Editor layers (stacked via grid-area) */}
                    <div className="editor-layers">
                    {/* Hidden pre to provide dimensions */}
                    <pre className="editor-base">
                        {configText + (configText.endsWith('\n') ? ' ' : '\n')}
                    </pre>

                    {/* Overlay for highlights and whitespace */}
                    <div className="editor-overlay">
                        {configText.split('\n').map((line, index) => {
                            const isErrorLine = errorLines.has(index + 1);
                            const lineClass = isErrorLine ? 'error-line-bg' : '';

                            let content = '';
                            if (showWhitespace) {
                                const leadingSpaces = line.match(/^ */)?.[0].length || 0;
                                if (leadingSpaces > 0) {
                                    for (let i = 0; i < line.length; i++) {
                                        if (i < leadingSpaces) {
                                            content += (i % 2 === 0) ? '·' : '│';
                                        } else if (line[i] === ' ') {
                                            content += '·';
                                        } else {
                                            content += ' ';
                                        }
                                    }
                                }
                            }

                            return (
                                <div key={index} className={`line-overlay ${lineClass}`}>
                                    <span style={{opacity: 0.5}}>{content}</span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Actual Textarea */}
                    <textarea
                        value={configText}
                        onChange={(e) => onConfigChange(e.target.value)}
                        spellCheck={false}
                        className="editor-textarea"
                    />
                    </div>

                    {!configText && (
                        <div className="flex align-center justify-center text-muted text-small editor-placeholder">
                            No file uploaded yet.<br/>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
