import { useRef, useEffect, useCallback, useState } from 'react';
import type { RefObject } from 'react';
import type * as MonacoType from 'monaco-editor';
import type { ValidationLog } from '../../../../actions/ValidationLogger';

const MAX_LINE_NUMBER = 1_000_000_000;

export type LogEntry = { startOffset: number; endOffset: number; logs: ValidationLog[] };

type Decoration = MonacoType.editor.IModelDeltaDecoration;
type Collection = MonacoType.editor.IEditorDecorationsCollection;

function buildHintContent(logs: ValidationLog[]): string {
    const first = logs[0].message;
    const prefix = logs[0].type === 'error' ? '×' : '!';
    const truncated = first.length > 55 ? first.slice(0, 52) + '...' : first;
    if (logs.length > 1) return `  ${prefix} ${truncated} (+${logs.length - 1} more)`;
    return `  ${prefix} ${truncated}`;
}

// A highlighted line with an inline hint after it; the gutter marker is left off for syntax errors.
function lineDecoration(
    monaco: typeof MonacoType,
    line: number,
    kind: 'error' | 'warning',
    hint: string,
    hover: string,
    markGutter = true,
): Decoration {
    return {
        range: new monaco.Range(line, 1, line, 1),
        options: {
            isWholeLine: true,
            className: `monaco-${kind}-line`,
            linesDecorationsClassName: markGutter ? `monaco-${kind}-line-number` : undefined,
            after: { content: hint, inlineClassName: `monaco-${kind}-hint` },
            hoverMessage: { value: hover },
        },
    };
}

interface DecorationProps {
    errorEntries: LogEntry[];
    warningEntries: LogEntry[];
    syntaxErrorOffsets: number[];
    categoryLineMap: Map<number, string>;
    configText: string;
    referenceHintMap: Map<number, string>;
    referenceValueRanges: Map<number, { startCol: number; endCol: number }>;
}

/**
 * Manages the Monaco decoration collections and the line-to-log maps used by the mouse
 * click handler. Returns `initCollections` to be called once from `handleMount`, plus the
 * log maps that ConfigEditor reads from its mouse event handler.
 */
export function useEditorDecorations(
    editorRef: RefObject<MonacoType.editor.IStandaloneCodeEditor | null>,
    monacoRef: RefObject<typeof MonacoType | null>,
    {
        errorEntries,
        warningEntries,
        syntaxErrorOffsets,
        categoryLineMap,
        configText,
        referenceHintMap,
        referenceValueRanges,
    }: DecorationProps,
) {
    const collectionsRef = useRef<Record<'errors' | 'categories' | 'placeholders' | 'referenceHints' | 'referenceUnderlines', Collection> | null>(null);
    // Flips once the editor exists, so every effect below runs again and fills its collection.
    const [ready, setReady] = useState(false);

    // Exposed to ConfigEditor so the mouse click handler can look up logs by line
    const errorLineLogMapRef = useRef<Map<number, ValidationLog[]>>(new Map());
    const warningLineLogMapRef = useRef<Map<number, ValidationLog[]>>(new Map());

    // Effect: error and warning line decorations
    useEffect(() => {
        const model = editorRef.current?.getModel();
        const monaco = monacoRef.current;
        const collections = collectionsRef.current;
        if (!model || !monaco || !collections) return;

        // Errors win over warnings on the same line.
        const toLineLogMap = (entries: LogEntry[], skip?: Map<number, ValidationLog[]>) => {
            const map = new Map<number, ValidationLog[]>();
            for (const entry of entries) {
                const startLine = model.getPositionAt(entry.startOffset).lineNumber;
                const endLine = model.getPositionAt(Math.max(entry.startOffset, entry.endOffset - 1)).lineNumber;
                for (let line = startLine; line <= endLine; line++) {
                    if (skip?.has(line)) continue;
                    map.set(line, [...(map.get(line) ?? []), ...entry.logs]);
                }
            }
            return map;
        };
        const errorMap = toLineLogMap(errorEntries);
        const warningMap = toLineLogMap(warningEntries, errorMap);
        errorLineLogMapRef.current = errorMap;
        warningLineLogMapRef.current = warningMap;

        const hover = (logs: ValidationLog[]) => logs.map(l => l.message).join('\n\n');
        collections.errors.set([
            ...syntaxErrorOffsets.map(offset => lineDecoration(
                monaco, model.getPositionAt(offset).lineNumber, 'error', '  × YAML syntax error', 'YAML syntax error', false,
            )),
            ...[...errorMap].map(([line, logs]) => lineDecoration(monaco, line, 'error', buildHintContent(logs), hover(logs))),
            ...[...warningMap].map(([line, logs]) => lineDecoration(monaco, line, 'warning', buildHintContent(logs), hover(logs))),
        ]);
    }, [ready, errorEntries, warningEntries, syntaxErrorOffsets]); // eslint-disable-line react-hooks/exhaustive-deps

    // Effect: category strip decorations
    useEffect(() => {
        const monaco = monacoRef.current;
        if (!monaco || !collectionsRef.current) return;
        collectionsRef.current.categories.set(
            [...categoryLineMap].map(([line, category]) => ({
                range: new monaco.Range(line, 1, line, 1),
                options: { isWholeLine: true, className: `cat-strip-${category}` },
            }))
        );
    }, [ready, categoryLineMap]); // eslint-disable-line react-hooks/exhaustive-deps

    // Effect: placeholder variable decorations
    useEffect(() => {
        const model = editorRef.current?.getModel();
        if (!model || !collectionsRef.current) return;
        const matches = model.findMatches('\\$\\{\\{[^}]*\\}\\}', false, true, false, null, false);
        collectionsRef.current.placeholders.set(matches.map(m => ({ range: m.range, options: { inlineClassName: 'monaco-placeholder-var' } })));
    }, [ready, configText]); // eslint-disable-line react-hooks/exhaustive-deps

    // Effect: reference hint and underline decorations
    useEffect(() => {
        const monaco = monacoRef.current;
        const collections = collectionsRef.current;
        if (!monaco || !collections) return;
        collections.referenceHints.set(
            [...referenceHintMap].map(([line, hint]) => ({
                range: new monaco.Range(line, MAX_LINE_NUMBER, line, MAX_LINE_NUMBER),
                options: { after: { content: `  ${hint}`, inlineClassName: 'monaco-ref-hint' } },
            }))
        );
        collections.referenceUnderlines.set(
            [...referenceValueRanges].map(([line, { startCol, endCol }]) => ({
                range: new monaco.Range(line, startCol, line, endCol),
                options: { inlineClassName: 'monaco-ref-value' },
            }))
        );
    }, [ready, referenceHintMap, referenceValueRanges]); // eslint-disable-line react-hooks/exhaustive-deps

    // Called once from handleMount after the editor is ready.
    const initCollections = useCallback((editor: MonacoType.editor.IStandaloneCodeEditor) => {
        collectionsRef.current = {
            errors: editor.createDecorationsCollection(),
            categories: editor.createDecorationsCollection(),
            placeholders: editor.createDecorationsCollection(),
            referenceHints: editor.createDecorationsCollection(),
            referenceUnderlines: editor.createDecorationsCollection(),
        };
        setReady(true);
    }, []);

    return { initCollections, errorLineLogMapRef, warningLineLogMapRef };
}
