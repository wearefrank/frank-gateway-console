import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as MonacoType from 'monaco-editor';
import { type MonacoYaml, type JSONSchema as MonacoJsonSchema } from 'monaco-yaml';
import { type ValidationLog } from '../../../actions/ValidationLogger';
import { parseYamlDoc, resolvePathToNode, buildCategoryLineMap } from '../yamlLineUtils';
import { beforeMount, getMonacoTheme, monacoYamlInstance } from './monacoThemes';
import { CATEGORY_DEFINITIONS, getDisplayId } from '../../../config/categoryDefinitions';
import type { ApisixConfig, SchemaCatalog } from '../../../actions/SchemaValidation';
import { useEditorDecorations } from './useEditorDecorations';
import { useEditorProviders } from './useEditorProviders';
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

// Pushes a schema catalog to the monaco-yaml language service.
// Called both when the schema arrives before the editor mounts and when it updates.
function pushSchema(monacoYaml: MonacoYaml, catalog: SchemaCatalog): void {
    void monacoYaml.update({
        validate: false,
        schemas: [{ uri: 'file:///apisix-config-schema', fileMatch: ['**'], schema: buildApisixSchema(catalog) }],
    });
}

type ParsedDoc = ReturnType<typeof parseYamlDoc>;

type LogEntry = { startOffset: number; endOffset: number; logs: ValidationLog[] };

// Collects raw character offsets for each error/warning log entry and YAML syntax error.
// Line numbers are resolved later in the decoration effect using Monaco's model.getPositionAt(),
// which handles offset-to-position conversion natively and avoids off-by-one issues.
function buildErrorAnnotations(parsedDoc: ParsedDoc, validationLogs: ValidationLog[]) {
    const errorEntries: LogEntry[] = [];
    const warningEntries: LogEntry[] = [];
    const syntaxErrorOffsets: number[] = [];
    const { doc } = parsedDoc;

    for (const err of doc.errors) {
        if (err.pos && err.pos.length >= 1) {
            syntaxErrorOffsets.push(err.pos[0]);
        }
    }

    for (const log of validationLogs) {
        if ((log.type !== 'error' && log.type !== 'warning') || !log.path) continue;
        const node = resolvePathToNode(doc, log.path);
        if (!node?.range) continue;
        const list = log.type === 'error' ? errorEntries : warningEntries;
        const existing = list.find(e => e.startOffset === node.range![0] && e.endOffset === node.range![1]);
        if (existing) {
            existing.logs.push(log);
        } else {
            list.push({ startOffset: node.range[0], endOffset: node.range[1], logs: [log] });
        }
    }

    return { errorEntries, warningEntries, syntaxErrorOffsets };
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

        // Get the list of items for this category from the config
        const rawEntries = (config as Record<string, unknown>)[category + 's'];
        if (!Array.isArray(rawEntries)) continue;

        for (const [i, entry] of (rawEntries as Record<string, unknown>[]).entries()) {
            if (!entry || typeof entry !== 'object') continue;

            // Check every field that could be a reference (like 'upstream_id')
            for (const ref of def.referenceFields) {
                const val = (entry as Record<string, unknown>)[ref.field];
                if (typeof val !== 'string' && typeof val !== 'number') continue;

                // Find the list of items we are supposed to be pointing to
                const rawTargetEntries = (config as Record<string, unknown>)[ref.targetCategory + 's'];
                if (!Array.isArray(rawTargetEntries)) continue;
                const targetDef = CATEGORY_DEFINITIONS[ref.targetCategory];
                if (!targetDef) continue;

                // Try to find the specific target item that matches our ID
                const targetEntries = rawTargetEntries as Record<string, unknown>[];
                const targetIdx = targetEntries.findIndex(
                    e => e && typeof e === 'object' && (e as Record<string, unknown>)[targetDef.idField] === val,
                );
                // If we can't find what it's pointing to, we can't show a hint
                if (targetIdx === -1) continue;

                // Find where this ID is located in the actual YAML text
                const node = resolvePathToNode(doc, `/${category}s/${i}/${ref.field}`);
                if (!node?.range) continue;

                // Calculate the line and column so we know where to draw the hint
                const displayId = getDisplayId(ref.targetCategory, targetEntries[targetIdx]);
                const startPos = lineCounter.linePos(node.range[0]);
                const endPos = lineCounter.linePos(node.range[1]);
                const line = startPos.line;

                // Save the hint text, the jump-to path, and the exact character positions
                hintMap.set(line, `\u2192 ${targetDef.label}: "${displayId}"`);
                targetMap.set(line, `/${ref.targetCategory}s/${targetIdx}`);
                valueRanges.set(line, { startCol: startPos.col, endCol: endPos.col });
            }
        }
    }

    return { referenceHintMap: hintMap, referenceTargetMap: targetMap, referenceValueRanges: valueRanges };
}

// Builds a map from line number to { category, idValue } for every entry's id/username field.
// Used by the hover provider to show "used by" info when hovering over an ID value in the editor.
function buildIdLineMap(parsedDoc: ParsedDoc, config: ApisixConfig) {
    const idLineMap = new Map<number, { category: string; idValue: string | number }>();
    const { doc, lineCounter } = parsedDoc;

    for (const [category, def] of Object.entries(CATEGORY_DEFINITIONS)) {
        if (def.referenceableFields.length === 0) continue;
        const rawEntries = (config as Record<string, unknown>)[category + 's'];
        if (!Array.isArray(rawEntries)) continue;

        for (const [i, entry] of (rawEntries as Record<string, unknown>[]).entries()) {
            if (!entry || typeof entry !== 'object') continue;
            const idValue = (entry as Record<string, unknown>)[def.idField];
            if (typeof idValue !== 'string' && typeof idValue !== 'number') continue;

            const node = resolvePathToNode(doc, `/${category}s/${i}/${def.idField}`);
            if (!node?.range) continue;

            const line = lineCounter.linePos(node.range[0]).line;
            idLineMap.set(line, { category, idValue });
        }
    }

    return idLineMap;
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
    // Editor instances
    const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof MonacoType | null>(null);
    const monacoYamlRef = useRef<MonacoYaml | null>(null);

    // Stable values for event callbacks
    const schemaRef = useRef<SchemaCatalog | null | undefined>(schema);
    const configRef = useRef<ApisixConfig | null | undefined>(config);
    const parsedDocRef = useRef<ParsedDoc | null>(null);

    // Callback refs (prevent stale closures in Monaco event handlers)
    const onReferenceNavigateRef = useRef(onReferenceNavigate);
    const onLineClickRef = useRef(onLineClick);
    const scrollToTargetRef = useRef(scrollToTarget);

    // Snapshot refs for Monaco scroll and provider callbacks
    const categoryLineMapRef = useRef<Map<number, string>>(new Map());
    const referenceTargetMapRef = useRef<Map<number, string>>(new Map());
    const referenceValueRangesRef = useRef<Map<number, { startCol: number; endCol: number }>>(new Map());
    const idLineMapRef = useRef<Map<number, { category: string; idValue: string | number }>>(new Map());

    const [visibleCategory, setVisibleCategory] = useState<string | null>(null);
    const [monacoTheme, setMonacoTheme] = useState(getMonacoTheme);

    // Derived data

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

    const { errorEntries, warningEntries, syntaxErrorOffsets } = useMemo(() => {
        if (!parsedDoc) return {
            errorEntries: [] as LogEntry[],
            warningEntries: [] as LogEntry[],
            syntaxErrorOffsets: [] as number[],
        };
        return buildErrorAnnotations(parsedDoc, validationLogs);
    }, [parsedDoc, validationLogs]);

    const { referenceHintMap, referenceTargetMap, referenceValueRanges } = useMemo(() => {
        const empty = {
            referenceHintMap: new Map<number, string>(),
            referenceTargetMap: new Map<number, string>(),
            referenceValueRanges: new Map<number, { startCol: number; endCol: number }>(),
        };
        if (!parsedDoc || !config) return empty;
        return buildReferenceAnnotations(parsedDoc, config);
    }, [parsedDoc, config]);

    const idLineMap = useMemo(() => {
        if (!parsedDoc || !config) return new Map<number, { category: string; idValue: string | number }>();
        return buildIdLineMap(parsedDoc, config);
    }, [parsedDoc, config]);

    // Keep refs current for Monaco event callbacks

    useEffect(() => { onLineClickRef.current = onLineClick; }, [onLineClick]);
    useEffect(() => { onReferenceNavigateRef.current = onReferenceNavigate; }, [onReferenceNavigate]);
    useEffect(() => { scrollToTargetRef.current = scrollToTarget; }, [scrollToTarget]);
    useEffect(() => { configRef.current = config; }, [config]);
    useEffect(() => { parsedDocRef.current = parsedDoc; }, [parsedDoc]);
    useEffect(() => { categoryLineMapRef.current = categoryLineMap; }, [categoryLineMap]);
    useEffect(() => { referenceTargetMapRef.current = referenceTargetMap; }, [referenceTargetMap]);
    useEffect(() => { referenceValueRangesRef.current = referenceValueRanges; }, [referenceValueRanges]);
    useEffect(() => { idLineMapRef.current = idLineMap; }, [idLineMap]);

    // Watch for data-theme attribute changes to switch Monaco theme
    useEffect(() => {
        const observer = new MutationObserver(() => setMonacoTheme(getMonacoTheme()));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);

    // Push schema updates to the YAML language service
    useEffect(() => {
        schemaRef.current = schema;
        if (!schema || !monacoYamlRef.current) return;
        pushSchema(monacoYamlRef.current, schema);
    }, [schema]);

    useEffect(() => {
        editorRef.current?.updateOptions({ renderWhitespace: showWhitespace ? 'all' : 'none' });
    }, [showWhitespace]);

    useEffect(() => {
        if (!scrollToTarget || !editorRef.current || !parsedDoc) return;
        const node = resolvePathToNode(parsedDoc.doc, scrollToTarget.path);
        if (!node?.range) return;
        const line = parsedDoc.lineCounter.linePos(node.range[0]).line;
        editorRef.current.revealLineInCenter(line);
    }, [scrollToTarget, parsedDoc]);

    // Decoration and provider hooks

    const { initCollections, errorLineLogMapRef, warningLineLogMapRef } = useEditorDecorations(
        editorRef,
        monacoRef,
        { errorEntries, warningEntries, syntaxErrorOffsets, categoryLineMap, configText, referenceHintMap, referenceValueRanges },
    );

    const { registerProviders } = useEditorProviders(
        categoryLineMapRef,
        schemaRef,
        configRef,
        parsedDocRef,
        referenceValueRangesRef,
        referenceTargetMapRef,
        idLineMapRef,
    );

    // Editor mount

    const handleMount: OnMount = useCallback((editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        // monacoYamlInstance was already initialized in beforeMount; just grab the reference.
        // If schema loaded before the editor mounted, push it now.
        monacoYamlRef.current = monacoYamlInstance;
        const initialSchema = schemaRef.current;
        if (initialSchema && monacoYamlRef.current) {
            pushSchema(monacoYamlRef.current, initialSchema);
        }

        document.fonts.ready.then(() => editor.layout());

        // If a scroll target was queued before the editor finished mounting, apply it now.
        const pending = scrollToTargetRef.current;
        const doc = parsedDocRef.current;
        if (pending && doc) {
            const node = resolvePathToNode(doc.doc, pending.path);
            if (node?.range) {
                const line = doc.lineCounter.linePos(node.range[0]).line;
                editor.revealLineInCenter(line);
            }
        }

        initCollections(editor, monaco);
        registerProviders(monaco);

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
            }
            if ((e.event.ctrlKey || e.event.metaKey) && idLineMapRef.current.has(line)) {
                editor.setPosition(e.target.position!);
                editor.trigger('mouse', 'editor.action.referenceSearch.trigger', {});
            }
        });
    }, [initCollections, registerProviders, errorLineLogMapRef, warningLineLogMapRef, idLineMapRef]);

    const handleJumpToCategory = useCallback((category: string) => {
        const line = categoryStartLines.get(category);
        if (line === undefined || !editorRef.current) return;
        editorRef.current.revealLineInCenter(line);
    }, [categoryStartLines]);

    // Render

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
