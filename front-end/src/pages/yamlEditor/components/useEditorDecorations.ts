import { useRef, useEffect, useCallback } from 'react';
import type { RefObject } from 'react';
import type * as MonacoType from 'monaco-editor';
import type { ValidationLog } from '../../../actions/ValidationLogger';

const MAX_LINE_NUMBER = 1_000_000_000;

export type LogEntry = { startOffset: number; endOffset: number; logs: ValidationLog[] };

function buildHintContent(logs: ValidationLog[]): string {
    const first = logs[0].message;
    const prefix = logs[0].type === 'error' ? '\u00d7' : '!';
    const truncated = first.length > 55 ? first.slice(0, 52) + '...' : first;
    if (logs.length > 1) return `  ${prefix} ${truncated} (+${logs.length - 1} more)`;
    return `  ${prefix} ${truncated}`;
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
 * Manages all five Monaco decoration collections and the line-to-log maps used by
 * the mouse click handler. Returns `initCollections` to be called once from `handleMount`,
 * plus the log maps that ConfigEditor reads from its mouse event handler.
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
    // Decoration collection refs (created lazily by initCollections)
    const errorCollectionRef = useRef<MonacoType.editor.IEditorDecorationsCollection | null>(null);
    const categoryCollectionRef = useRef<MonacoType.editor.IEditorDecorationsCollection | null>(null);
    const placeholderCollectionRef = useRef<MonacoType.editor.IEditorDecorationsCollection | null>(null);
    const referenceHintCollectionRef = useRef<MonacoType.editor.IEditorDecorationsCollection | null>(null);
    const referenceUnderlineCollectionRef = useRef<MonacoType.editor.IEditorDecorationsCollection | null>(null);

    // Exposed to ConfigEditor so the mouse click handler can look up logs by line
    const errorLineLogMapRef = useRef<Map<number, ValidationLog[]>>(new Map());
    const warningLineLogMapRef = useRef<Map<number, ValidationLog[]>>(new Map());

    // Snapshot refs used by initCollections - by the time the editor mounts and
    // initCollections is called, effects have already run and these hold the latest values.
    const categoryLineMapSnap = useRef(categoryLineMap);
    const referenceHintMapSnap = useRef(referenceHintMap);
    const referenceValueRangesSnap = useRef(referenceValueRanges);
    useEffect(() => { categoryLineMapSnap.current = categoryLineMap; }, [categoryLineMap]);
    useEffect(() => { referenceHintMapSnap.current = referenceHintMap; }, [referenceHintMap]);
    useEffect(() => { referenceValueRangesSnap.current = referenceValueRanges; }, [referenceValueRanges]);

    // Effect: error and warning line decorations
    useEffect(() => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        const collection = errorCollectionRef.current;
        if (!editor || !monaco || !collection) return;
        const model = editor.getModel();
        if (!model) return;

        const toLineRange = (startOffset: number, endOffset: number) => {
            const startLine = model.getPositionAt(startOffset).lineNumber;
            const endLine = model.getPositionAt(Math.max(startOffset, endOffset - 1)).lineNumber;
            return { startLine, endLine };
        };

        const addToLineMap = (map: Map<number, ValidationLog[]>, line: number, logs: ValidationLog[]) => {
            const existing = map.get(line);
            if (existing) {
                for (const log of logs) existing.push(log);
            } else {
                map.set(line, [...logs]);
            }
        };

        const newErrorLineLogMap = new Map<number, ValidationLog[]>();
        for (const entry of errorEntries) {
            const { startLine, endLine } = toLineRange(entry.startOffset, entry.endOffset);
            for (let line = startLine; line <= endLine; line++) {
                addToLineMap(newErrorLineLogMap, line, entry.logs);
            }
        }

        const newWarningLineLogMap = new Map<number, ValidationLog[]>();
        for (const entry of warningEntries) {
            const { startLine, endLine } = toLineRange(entry.startOffset, entry.endOffset);
            for (let line = startLine; line <= endLine; line++) {
                if (!newErrorLineLogMap.has(line)) {
                    addToLineMap(newWarningLineLogMap, line, entry.logs);
                }
            }
        }

        errorLineLogMapRef.current = newErrorLineLogMap;
        warningLineLogMapRef.current = newWarningLineLogMap;

        const decorations: MonacoType.editor.IModelDeltaDecoration[] = [];

        for (const offset of syntaxErrorOffsets) {
            const line = model.getPositionAt(offset).lineNumber;
            decorations.push({
                range: new monaco.Range(line, 1, line, 1),
                options: {
                    isWholeLine: true,
                    className: 'monaco-error-line',
                    after: { content: '  \u00d7 YAML syntax error', inlineClassName: 'monaco-error-hint' },
                    hoverMessage: { value: 'YAML syntax error' },
                },
            });
        }

        for (const [line, logs] of newErrorLineLogMap) {
            decorations.push({
                range: new monaco.Range(line, 1, line, 1),
                options: {
                    isWholeLine: true,
                    className: 'monaco-error-line',
                    linesDecorationsClassName: 'monaco-error-line-number',
                    after: { content: buildHintContent(logs), inlineClassName: 'monaco-error-hint' },
                    hoverMessage: { value: logs.map(l => l.message).join('\n\n') },
                },
            });
        }

        for (const [line, logs] of newWarningLineLogMap) {
            decorations.push({
                range: new monaco.Range(line, 1, line, 1),
                options: {
                    isWholeLine: true,
                    className: 'monaco-warning-line',
                    linesDecorationsClassName: 'monaco-warning-line-number',
                    after: { content: buildHintContent(logs), inlineClassName: 'monaco-warning-hint' },
                    hoverMessage: { value: logs.map(l => l.message).join('\n\n') },
                },
            });
        }

        collection.set(decorations);
    }, [errorEntries, warningEntries, syntaxErrorOffsets]); // eslint-disable-line react-hooks/exhaustive-deps

    // Effect: category strip decorations
    useEffect(() => {
        const monaco = monacoRef.current;
        const collection = categoryCollectionRef.current;
        if (!monaco || !collection) return;
        collection.set(
            [...categoryLineMap].map(([line, category]) => ({
                range: new monaco.Range(line, 1, line, 1),
                options: { isWholeLine: true, className: `cat-strip-${category}` },
            }))
        );
    }, [categoryLineMap]); // eslint-disable-line react-hooks/exhaustive-deps

    // Effect: placeholder variable decorations
    useEffect(() => {
        const editor = editorRef.current;
        const collection = placeholderCollectionRef.current;
        if (!editor || !collection) return;
        const model = editor.getModel();
        if (!model) return;
        const matches = model.findMatches('\\$\\{\\{[^}]*\\}\\}', false, true, false, null, false);
        collection.set(matches.map(m => ({ range: m.range, options: { inlineClassName: 'monaco-placeholder-var' } })));
    }, [configText]); // eslint-disable-line react-hooks/exhaustive-deps

    // Effect: reference hint and underline decorations
    useEffect(() => {
        const monaco = monacoRef.current;
        if (!monaco) return;
        referenceHintCollectionRef.current?.set(
            [...referenceHintMap].map(([line, hint]) => ({
                range: new monaco.Range(line, MAX_LINE_NUMBER, line, MAX_LINE_NUMBER),
                options: { after: { content: `  ${hint}`, inlineClassName: 'monaco-ref-hint' } },
            }))
        );
        referenceUnderlineCollectionRef.current?.set(
            [...referenceValueRanges].map(([line, { startCol, endCol }]) => ({
                range: new monaco.Range(line, startCol, line, endCol),
                options: { inlineClassName: 'monaco-ref-value' },
            }))
        );
    }, [referenceHintMap, referenceValueRanges]); // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * Called once from handleMount after the editor is ready. Creates all five
     * decoration collections with their initial values read from the snapshot refs.
     */
    const initCollections = useCallback((
        editor: MonacoType.editor.IStandaloneCodeEditor,
        monaco: typeof MonacoType,
    ) => {
        errorCollectionRef.current = editor.createDecorationsCollection([]);

        categoryCollectionRef.current = editor.createDecorationsCollection(
            [...categoryLineMapSnap.current].map(([line, category]) => ({
                range: new monaco.Range(line, 1, line, 1),
                options: { isWholeLine: true, className: `cat-strip-${category}` },
            }))
        );

        const model = editor.getModel();
        const placeholderMatches = model
            ? model.findMatches('\\$\\{\\{[^}]*\\}\\}', false, true, false, null, false)
            : [];
        placeholderCollectionRef.current = editor.createDecorationsCollection(
            placeholderMatches.map(m => ({ range: m.range, options: { inlineClassName: 'monaco-placeholder-var' } }))
        );

        referenceHintCollectionRef.current = editor.createDecorationsCollection(
            [...referenceHintMapSnap.current].map(([line, hint]) => ({
                range: new monaco.Range(line, MAX_LINE_NUMBER, line, MAX_LINE_NUMBER),
                options: { after: { content: `  ${hint}`, inlineClassName: 'monaco-ref-hint' } },
            }))
        );

        referenceUnderlineCollectionRef.current = editor.createDecorationsCollection(
            [...referenceValueRangesSnap.current].map(([line, { startCol, endCol }]) => ({
                range: new monaco.Range(line, startCol, line, endCol),
                options: { inlineClassName: 'monaco-ref-value' },
            }))
        );
    }, []);

    return { initCollections, errorLineLogMapRef, warningLineLogMapRef };
}
