import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as MonacoType from 'monaco-editor';
import { type MonacoYaml, type JSONSchema as MonacoJsonSchema } from 'monaco-yaml';
import { type ValidationLog } from '../../../actions/ValidationLogger';
import { parseYamlDoc, resolvePathToNode, buildCategoryLineMap } from '../yamlLineUtils';
import { YamlCompletionProvider } from './YamlCompletionProvider';
import { beforeMount, getMonacoTheme, monacoYamlInstance } from './monacoThemes';
import { CATEGORY_DEFINITIONS, getDisplayId } from '../../../config/categoryDefinitions';
import type { ApisixConfig, SchemaCatalog } from '../../../actions/SchemaValidation';
import styles from '../YamlEditor.module.css';
import '../monacoStyles.css';

interface ConfigEditorProps {
    configText: string;
    showWhitespace: boolean;
    fillDefaults: boolean;
    validConfig: boolean;
    yamlValid: boolean;
    validationLogs?: ValidationLog[];
    config?: ApisixConfig | null;
    schema?: SchemaCatalog | null;
    onConfigChange: (newValue: string) => void;
    onToggleWhitespace: () => void;
    onToggleFillDefaults: () => void;
    onLineClick?: (log: ValidationLog) => void;
    onReferenceNavigate?: (path: string) => void;
    scrollToTarget?: { path: string; key: number } | null;
    onSaveVersion?: () => void;
}

// Builds a JSON Schema that covers the full APISIX config structure,
// used by the monaco-yaml language service for hover and validation hints.
// We do not write $ref here. The AJV validator (SchemaValidation.ts) does write
// $ref itself to link each config array to its definition, but that is a separate
// pipeline. Here, "definitions: defs" is passed purely as a precaution so the
// language server can resolve any $refs that may appear in a future APISIX schema.
function buildApisixSchema(catalog: SchemaCatalog): MonacoJsonSchema {
    const defs = (catalog.main ?? {}) as Record<string, MonacoJsonSchema>;
    const properties: Record<string, MonacoJsonSchema> = {};
    for (const category of Object.keys(CATEGORY_DEFINITIONS)) {
        const categorySchema = defs[category];
        if (!categorySchema) continue;
        // Inline the schema directly so the language server can walk into nested
        // properties without needing to resolve any $ref chains.
        properties[`${category}s`] = { type: 'array', items: categorySchema };
    }
    return { type: 'object', properties, definitions: defs };
}

type ParsedDoc = ReturnType<typeof parseYamlDoc>;

// Maps each error/warning log entry and YAML syntax error to the line numbers they cover.
// Each line can accumulate multiple logs; errors and warnings are tracked separately.
function buildErrorAnnotations(parsedDoc: ParsedDoc, validationLogs: ValidationLog[]) {
    const errorLineLogMap = new Map<number, ValidationLog[]>();
    const warningLineLogMap = new Map<number, ValidationLog[]>();
    const syntaxErrorLines = new Set<number>();
    const { doc, lineCounter } = parsedDoc;

    for (const err of doc.errors) {
        if (err.pos && err.pos.length >= 1) {
            syntaxErrorLines.add(lineCounter.linePos(err.pos[0]).line);
        }
    }

    for (const log of validationLogs) {
        if ((log.type !== 'error' && log.type !== 'warning') || !log.path) continue;
        const node = resolvePathToNode(doc, log.path);
        if (!node?.range) continue;
        const startLine = lineCounter.linePos(node.range[0]).line;
        const endLine = lineCounter.linePos(node.range[1]).line;
        const map = log.type === 'error' ? errorLineLogMap : warningLineLogMap;
        for (let i = startLine; i <= endLine; i++) {
            const existing = map.get(i);
            if (existing) existing.push(log);
            else map.set(i, [log]);
        }
    }

    return { errorLineLogMap, warningLineLogMap, syntaxErrorLines };
}

// Builds the inline hint text shown at the end of an error/warning line.
function buildHintContent(logs: ValidationLog[]): string {
    const first = logs[0].message;
    const prefix = logs[0].type === 'error' ? '\u00d7' : '!';
    const truncated = first.length > 55 ? first.slice(0, 52) + '...' : first;
    if (logs.length > 1) return `  ${prefix} ${truncated} (+${logs.length - 1} more)`;
    return `  ${prefix} ${truncated}`;
}

// Finds every reference field (e.g. upstream_id on a route) and computes
// the hint text, navigation target path, and value column range for each.
function buildReferenceAnnotations(parsedDoc: ParsedDoc, config: ApisixConfig) {
    const hintMap = new Map<number, string>();
    const targetMap = new Map<number, string>();
    const valueRanges = new Map<number, { startCol: number; endCol: number }>();
    const { doc, lineCounter } = parsedDoc;

    for (const [category, def] of Object.entries(CATEGORY_DEFINITIONS)) {
        if (def.referenceFields.length === 0) continue;

        const rawEntries = (config as Record<string, unknown>)[category + 's'];
        if (!Array.isArray(rawEntries)) continue;

        for (const [i, entry] of (rawEntries as Record<string, unknown>[]).entries()) {
            if (!entry || typeof entry !== 'object') continue;

            for (const ref of def.referenceFields) {
                const val = (entry as Record<string, unknown>)[ref.field];
                if (typeof val !== 'string' && typeof val !== 'number') continue;

                const rawTargetEntries = (config as Record<string, unknown>)[ref.targetCategory + 's'];
                if (!Array.isArray(rawTargetEntries)) continue;
                const targetDef = CATEGORY_DEFINITIONS[ref.targetCategory];
                if (!targetDef) continue;

                const targetEntries = rawTargetEntries as Record<string, unknown>[];
                const targetIdx = targetEntries.findIndex(
                    e => e && typeof e === 'object' && (e as Record<string, unknown>)[targetDef.idField] === val,
                );
                if (targetIdx === -1) continue;

                const node = resolvePathToNode(doc, `/${category}s/${i}/${ref.field}`);
                if (!node?.range) continue;

                const displayId = getDisplayId(ref.targetCategory, targetEntries[targetIdx]);
                const startPos = lineCounter.linePos(node.range[0]);
                const endPos = lineCounter.linePos(node.range[1]);
                const line = startPos.line;
                hintMap.set(line, `\u2192 ${targetDef.label}: "${displayId}"`);
                targetMap.set(line, `/${ref.targetCategory}s/${targetIdx}`);
                valueRanges.set(line, { startCol: startPos.col, endCol: endPos.col });
            }
        }
    }

    return { referenceHintMap: hintMap, referenceTargetMap: targetMap, referenceValueRanges: valueRanges };
}

export const ConfigEditor = ({
    configText,
    showWhitespace,
    fillDefaults,
    validConfig,
    yamlValid,
    validationLogs = [],
    config,
    schema,
    onConfigChange,
    onToggleWhitespace,
    onToggleFillDefaults,
    onLineClick,
    onReferenceNavigate,
    scrollToTarget,
    onSaveVersion,
}: ConfigEditorProps) => {
    const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof MonacoType | null>(null);
    const monacoYamlRef = useRef<MonacoYaml | null>(null);
    const schemaRef = useRef<SchemaCatalog | null | undefined>(schema);
    const configRef = useRef<ApisixConfig | null | undefined>(config);
    const errorDecorationsRef = useRef<MonacoType.editor.IEditorDecorationsCollection | null>(null);
    const categoryDecorationsRef = useRef<MonacoType.editor.IEditorDecorationsCollection | null>(null);
    const placeholderDecorationsRef = useRef<MonacoType.editor.IEditorDecorationsCollection | null>(null);
    const referenceDecorationsRef = useRef<MonacoType.editor.IEditorDecorationsCollection | null>(null);
    const referenceUnderlineDecorationsRef = useRef<MonacoType.editor.IEditorDecorationsCollection | null>(null);
    const categoryLineMapRef = useRef<Map<number, string>>(new Map());
    const errorLineLogMapRef = useRef<Map<number, ValidationLog[]>>(new Map());
    const warningLineLogMapRef = useRef<Map<number, ValidationLog[]>>(new Map());
    const referenceHintMapRef = useRef<Map<number, string>>(new Map());
    const referenceTargetMapRef = useRef<Map<number, string>>(new Map());
    const referenceValueRangesRef = useRef<Map<number, { startCol: number; endCol: number }>>(new Map());
    const onReferenceNavigateRef = useRef(onReferenceNavigate);
    const onLineClickRef = useRef(onLineClick);
    const completionProviderRef = useRef<MonacoType.IDisposable | null>(null);
    const definitionProviderRef = useRef<MonacoType.IDisposable | null>(null);
    const parsedDocRef = useRef<ParsedDoc | null>(null);
    const [visibleCategory, setVisibleCategory] = useState<string | null>(null);
    const [monacoTheme, setMonacoTheme] = useState(getMonacoTheme);

    useEffect(() => { onLineClickRef.current = onLineClick; }, [onLineClick]);
    useEffect(() => { onReferenceNavigateRef.current = onReferenceNavigate; }, [onReferenceNavigate]);

    useEffect(() => {
        return () => {
            completionProviderRef.current?.dispose();
            definitionProviderRef.current?.dispose();
        };
    }, []);

    // Watch for data-theme attribute changes to switch Monaco theme
    useEffect(() => {
        const observer = new MutationObserver(() => setMonacoTheme(getMonacoTheme()));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);

    // --- Derived data ---

    const parsedDoc = useMemo(() => {
        if (!configText) return null;
        try { return parseYamlDoc(configText); }
        catch { return null; }
    }, [configText]);

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

    const { errorLineLogMap, warningLineLogMap, syntaxErrorLines } = useMemo(() => {
        if (!parsedDoc) return {
            errorLineLogMap: new Map<number, ValidationLog[]>(),
            warningLineLogMap: new Map<number, ValidationLog[]>(),
            syntaxErrorLines: new Set<number>(),
        };
        return buildErrorAnnotations(parsedDoc, validationLogs);
    }, [parsedDoc, validationLogs]);

    const { referenceHintMap, referenceTargetMap, referenceValueRanges } = useMemo(() => {
        const empty = { referenceHintMap: new Map<number, string>(), referenceTargetMap: new Map<number, string>(), referenceValueRanges: new Map<number, { startCol: number; endCol: number }>() };
        if (!parsedDoc || !config) return empty;
        return buildReferenceAnnotations(parsedDoc, config);
    }, [parsedDoc, config]);

    // --- Keep refs current for use inside Monaco event callbacks ---

    useEffect(() => { categoryLineMapRef.current = categoryLineMap; }, [categoryLineMap]);
    useEffect(() => { errorLineLogMapRef.current = errorLineLogMap; }, [errorLineLogMap]);
    useEffect(() => { warningLineLogMapRef.current = warningLineLogMap; }, [warningLineLogMap]);
    useEffect(() => { referenceHintMapRef.current = referenceHintMap; }, [referenceHintMap]);
    useEffect(() => { referenceTargetMapRef.current = referenceTargetMap; }, [referenceTargetMap]);
    useEffect(() => { referenceValueRangesRef.current = referenceValueRanges; }, [referenceValueRanges]);
    useEffect(() => { parsedDocRef.current = parsedDoc; }, [parsedDoc]);

    useEffect(() => { configRef.current = config; }, [config]);

    // Push schema updates to the YAML language service
    useEffect(() => {
        schemaRef.current = schema;
        if (!schema || !monacoYamlRef.current) return;
        monacoYamlRef.current.update({
            validate: false,
            schemas: [{ uri: 'file:///apisix-config-schema', fileMatch: ['**'], schema: buildApisixSchema(schema) }],
        });
    }, [schema]);

    // --- Decoration updates ---

    useEffect(() => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        const collection = errorDecorationsRef.current;
        if (!editor || !monaco || !collection) return;

        const decorations: MonacoType.editor.IModelDeltaDecoration[] = [];
        for (const line of syntaxErrorLines) {
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
        for (const [line, logs] of errorLineLogMap) {
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
        for (const [line, logs] of warningLineLogMap) {
            if (errorLineLogMap.has(line)) continue;
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
    }, [errorLineLogMap, warningLineLogMap, syntaxErrorLines]);

    useEffect(() => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        const collection = categoryDecorationsRef.current;
        if (!editor || !monaco || !collection) return;

        const decorations = [...categoryLineMap].map(([line, category]) => ({
            range: new monaco.Range(line, 1, line, 1),
            options: { isWholeLine: true, className: `cat-strip-${category}` },
        }));
        collection.set(decorations);
    }, [categoryLineMap]);

    useEffect(() => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        const collection = placeholderDecorationsRef.current;
        if (!editor || !monaco || !collection) return;
        const model = editor.getModel();
        if (!model) return;
        const matches = model.findMatches('\\$\\{\\{[^}]*\\}\\}', false, true, false, null, false);
        collection.set(matches.map(m => ({ range: m.range, options: { inlineClassName: 'monaco-placeholder-var' } })));
    }, [configText]);

    useEffect(() => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        if (!editor || !monaco) return;

        const hintDecorations = [...referenceHintMap].map(([line, hint]) => ({
            range: new monaco.Range(line, 1e9, line, 1e9),
            options: { after: { content: `  ${hint}`, inlineClassName: 'monaco-ref-hint' } },
        }));
        const underlineDecorations = [...referenceValueRanges].map(([line, { startCol, endCol }]) => ({
            range: new monaco.Range(line, startCol, line, endCol),
            options: { inlineClassName: 'monaco-ref-value' },
        }));
        referenceDecorationsRef.current?.set(hintDecorations);
        referenceUnderlineDecorationsRef.current?.set(underlineDecorations);
    }, [referenceHintMap, referenceValueRanges]);

    useEffect(() => {
        if (!scrollToTarget || !editorRef.current || !parsedDoc) return;
        const node = resolvePathToNode(parsedDoc.doc, scrollToTarget.path);
        if (!node?.range) return;
        const line = parsedDoc.lineCounter.linePos(node.range[0]).line;
        editorRef.current.revealLineInCenter(line);
    }, [scrollToTarget]);

    useEffect(() => {
        editorRef.current?.updateOptions({ renderWhitespace: showWhitespace ? 'all' : 'none' });
    }, [showWhitespace]);

    // --- Editor mount ---

    const handleMount: OnMount = useCallback((editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        // monacoYamlInstance was already initialized in beforeMount; just grab the reference.
        // If schema loaded before the editor mounted, push it now.
        monacoYamlRef.current = monacoYamlInstance;
        const initialSchema = schemaRef.current;
        if (initialSchema && monacoYamlRef.current) {
            monacoYamlRef.current.update({
                validate: false,
                schemas: [{ uri: 'file:///apisix-config-schema', fileMatch: ['**'], schema: buildApisixSchema(initialSchema) }],
            });
        }

        document.fonts.ready.then(() => editor.layout());
        errorDecorationsRef.current = editor.createDecorationsCollection([]);

        categoryDecorationsRef.current = editor.createDecorationsCollection(
            [...categoryLineMapRef.current].map(([line, category]) => ({
                range: new monaco.Range(line, 1, line, 1),
                options: { isWholeLine: true, className: `cat-strip-${category}` },
            })),
        );

        const model = editor.getModel();
        const placeholderMatches = model
            ? model.findMatches('\\$\\{\\{[^}]*\\}\\}', false, true, false, null, false)
            : [];
        placeholderDecorationsRef.current = editor.createDecorationsCollection(
            placeholderMatches.map(m => ({ range: m.range, options: { inlineClassName: 'monaco-placeholder-var' } })),
        );

        referenceDecorationsRef.current = editor.createDecorationsCollection(
            [...referenceHintMapRef.current].map(([line, hint]) => ({
                range: new monaco.Range(line, 1e9, line, 1e9),
                options: { after: { content: `  ${hint}`, inlineClassName: 'monaco-ref-hint' } },
            })),
        );

        referenceUnderlineDecorationsRef.current = editor.createDecorationsCollection(
            [...referenceValueRangesRef.current].map(([line, { startCol, endCol }]) => ({
                range: new monaco.Range(line, startCol, line, endCol),
                options: { inlineClassName: 'monaco-ref-value' },
            })),
        );

        editor.onDidScrollChange(() => {
            const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);
            if (lineHeight <= 0) return;
            const topLine = Math.ceil(editor.getScrollTop() / lineHeight) + 1;
            setVisibleCategory(categoryLineMapRef.current.get(topLine) ?? null);
        });

        editor.onMouseDown((e) => {
            const line = e.target.position?.lineNumber;
            if (!line) return;

            const isGutter =
                e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
                e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS;
            if (isGutter) {
                const logs = errorLineLogMapRef.current.get(line) ?? warningLineLogMapRef.current.get(line);
                if (logs?.length) onLineClickRef.current?.(logs[0]);
                return;
            }

        });

        completionProviderRef.current = new YamlCompletionProvider(monaco).register(
            () => categoryLineMapRef.current,
            () => schemaRef.current,
            () => configRef.current,
        );

        definitionProviderRef.current = monaco.languages.registerDefinitionProvider('yaml', {
            provideDefinition(model, position) {
                const line = position.lineNumber;
                const valueRange = referenceValueRangesRef.current.get(line);
                if (!valueRange) return null;
                if (position.column < valueRange.startCol || position.column > valueRange.endCol) return null;
                const targetPath = referenceTargetMapRef.current.get(line);
                if (!targetPath || !parsedDocRef.current) return null;
                const { doc, lineCounter } = parsedDocRef.current;
                const node = resolvePathToNode(doc, targetPath);
                if (!node?.range) return null;
                const startPos = lineCounter.linePos(node.range[0]);
                const lineLength = model.getLineContent(startPos.line).length;
                return {
                    uri: model.uri,
                    range: new monaco.Range(startPos.line, 1, startPos.line, lineLength + 1),
                };
            },
        });
    }, []);

    const handleJumpToCategory = useCallback((category: string) => {
        const line = categoryStartLines.get(category);
        if (line === undefined || !editorRef.current) return;
        editorRef.current.revealLineInCenter(line);
    }, [categoryStartLines]);

    // --- Render ---

    let statusClass: string | null = null;
    let statusLabel: string | null = null;
    if (configText) {
        if (!yamlValid) { statusClass = styles.statusError; statusLabel = 'YAML error'; }
        else if (!validConfig) { statusClass = styles.statusWarning; statusLabel = 'Has errors'; }
        else { statusClass = styles.statusValid; statusLabel = 'Valid'; }
    }

    return (
        <div className={`card flex flex-column ${styles.configCard} ${!validConfig ? styles.configCardInvalid : ''}`}>
            <div className="card-header flex align-center gap-sm">
                Parsed Configuration
                {statusClass && <span className={statusClass}>{statusLabel}</span>}
            </div>

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
                    {fillDefaults ? "Don't fill" : 'Fill'}
                </button>
                {onSaveVersion && (
                    <button className={`text-small ${styles.btnIcon}`} onClick={onSaveVersion}>
                        Commit
                    </button>
                )}
            </div>

            {configText && (
                <div
                    className={styles.categoryBanner}
                    style={visibleCategory ? { borderLeftColor: CATEGORY_DEFINITIONS[visibleCategory]?.color } : undefined}
                >
                    <span>{visibleCategory ? CATEGORY_DEFINITIONS[visibleCategory]?.label : ''}</span>
                    {categoryStartLines.size > 0 && (
                        <div className={styles.categoryNavPills}>
                            {[...categoryStartLines.keys()].map(cat => {
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

            <div className={styles.monacoWrapper}>
                <Editor
                    language="yaml"
                    path="apisix-config.yaml"
                    value={configText}
                    theme={monacoTheme}
                    beforeMount={beforeMount}
                    onMount={handleMount}
                    onChange={(v) => onConfigChange(v ?? '')}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        lineHeight: 21,
                        fontFamily: "'JetBrains Mono', monospace",
                        renderWhitespace: showWhitespace ? 'all' : 'none',
                        scrollBeyondLastLine: false,
                        wordWrap: 'off',
                        lineDecorationsWidth: 4,
                        glyphMargin: false,
                        folding: true,
                        foldingStrategy: 'indentation',
                        automaticLayout: true,
                        overviewRulerBorder: false,
                        overviewRulerLanes: 0,
                        hideCursorInOverviewRuler: true,
                        wordBasedSuggestions: 'off',
                        quickSuggestions: { other: true, comments: false, strings: true },
                        suggestOnTriggerCharacters: true,
                        scrollbar: { vertical: 'auto', horizontal: 'auto' },
                        links: false,
                        stickyScroll: { enabled: false },
                    }}
                />
            </div>
        </div>
    );
};
