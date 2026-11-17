import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as MonacoType from 'monaco-editor';
import { type ValidationLog } from '../../../../actions/ValidationLogger';
import { parseYamlDoc, resolvePathToNode, buildCategoryLineMap, type ParsedDoc } from '../../yamlLineUtils';
import { beforeMount, getMonacoTheme } from './monacoThemes';
import { CATEGORY_DEFINITIONS } from '../../../../config/categoryDefinitions';
import type { ApisixConfig, SchemaCatalog } from '../../../../actions/SchemaValidation';
import type { DesignerSettings } from '../../../../hooks/useDesignerSettings';
import { useEditorDecorations, type LogEntry } from './useEditorDecorations';
import { useEditorProviders } from '../providers/useEditorProviders';
import { registerCursorWidget } from '../widgets/CursorContentWidget';
import { useIdTemplateWidget } from '../widgets/idTemplateWidget/useIdTemplateWidget';
import { buildErrorAnnotations, buildAnnotations, EMPTY_ANNOTATIONS, type EditorAnnotations } from './configEditorAnnotations';
import { ToggleButton } from '../../../../components/ToggleButton/ToggleButton';
import { usePersistedState } from '../../../../hooks/usePersistedState';
import styles from '../../YamlEditor.module.css';
import '../../monacoStyles.css';

interface ConfigEditorProps {
    configText: string;
    showWhitespace: boolean;
    fillDefaults: boolean;
    validConfig: boolean;
    yamlValid: boolean;
    validationLogs?: ValidationLog[];
    schema?: SchemaCatalog | null;
    designerSettings?: DesignerSettings;
    onConfigChange: (newValue: string) => void;
    onToggleWhitespace: () => void;
    onToggleFillDefaults: () => void;
    onLineClick?: (log: ValidationLog) => void;
    scrollToTarget?: { path: string; key: number } | null;
}

export const ConfigEditor = ({
    configText,
    showWhitespace,
    fillDefaults,
    validConfig,
    yamlValid,
    validationLogs = [],
    schema,
    designerSettings,
    onConfigChange,
    onToggleWhitespace,
    onToggleFillDefaults,
    onLineClick,
    scrollToTarget,
}: ConfigEditorProps) => {
    // Editor instances
    const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof MonacoType | null>(null);

    // Stable values for event callbacks
    const schemaRef = useRef<SchemaCatalog | null | undefined>(schema);
    const configRef = useRef<ApisixConfig | null>(null);
    const parsedDocRef = useRef<ParsedDoc | null>(null);
    const designerSettingsRef = useRef<DesignerSettings | null | undefined>(designerSettings);

    // Callback refs (prevent stale closures in Monaco event handlers)
    const onLineClickRef = useRef(onLineClick);
    const scrollToTargetRef = useRef(scrollToTarget);

    // Snapshot refs for Monaco scroll and provider callbacks
    const categoryLineMapRef = useRef<Map<number, string>>(new Map());
    const annotationsRef = useRef<EditorAnnotations>(EMPTY_ANNOTATIONS);

    const [visibleCategory, setVisibleCategory] = useState<string | null>(null);
    const [monacoTheme, setMonacoTheme] = useState(getMonacoTheme);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [indentSize, setIndentSize] = usePersistedState('yamlEditor.indentSize', 2);

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

    // Read from the same parse as the line positions. The app-wide config lags 400ms behind the
    // text and freezes while it's invalid, so pairing it with fresh positions put hints on wrong lines.
    const docConfig = useMemo(() => {
        try { return (parsedDoc?.doc.toJS() ?? null) as ApisixConfig | null; }
        catch { return null; }
    }, [parsedDoc]);

    const annotations = useMemo(() => buildAnnotations(parsedDoc, docConfig), [parsedDoc, docConfig]);

    // Keep refs current for Monaco event callbacks (these give errors of not set)

    useEffect(() => { onLineClickRef.current = onLineClick; }, [onLineClick]);
    useEffect(() => { scrollToTargetRef.current = scrollToTarget; }, [scrollToTarget]);
    useEffect(() => { configRef.current = docConfig; }, [docConfig]);
    useEffect(() => { designerSettingsRef.current = designerSettings; }, [designerSettings]);
    useEffect(() => { parsedDocRef.current = parsedDoc; }, [parsedDoc]);
    useEffect(() => { categoryLineMapRef.current = categoryLineMap; }, [categoryLineMap]);
    useEffect(() => { annotationsRef.current = annotations; }, [annotations]);

    // Watch for data-theme attribute changes to switch Monaco theme
    useEffect(() => {
        const observer = new MutationObserver(() => setMonacoTheme(getMonacoTheme()));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => { schemaRef.current = schema; }, [schema]);

    useEffect(() => {
        editorRef.current?.updateOptions({ renderWhitespace: showWhitespace ? 'all' : 'none' });
    }, [showWhitespace]);

    // Enter, Tab, Backspace, autocomplete and Format Document all follow the model's indent unit.
    useEffect(() => {
        editorRef.current?.getModel()?.updateOptions({ tabSize: indentSize, indentSize, insertSpaces: true });
    }, [indentSize]);

    useEffect(() => {
        if (!scrollToTarget || !editorRef.current) return;
        const doc = parsedDocRef.current;
        if (!doc) return;
        const node = resolvePathToNode(doc.doc, scrollToTarget.path);
        if (!node?.range) return;
        const line = doc.lineCounter.linePos(node.range[0]).line;
        editorRef.current.revealLineInCenter(line);
    }, [scrollToTarget]);

    // Decoration and provider hooks

    const { initCollections, errorLineLogMapRef, warningLineLogMapRef } = useEditorDecorations(
        editorRef,
        monacoRef,
        {
            errorEntries, warningEntries, syntaxErrorOffsets, categoryLineMap, configText,
            referenceHintMap: annotations.referenceHintMap,
            referenceValueRanges: annotations.referenceValueRanges,
        },
    );

    const { registerProviders } = useEditorProviders(schemaRef, configRef, parsedDocRef, annotationsRef);

    // Cursor-triggered Monaco widget
    const idTemplateWidgetDef = useIdTemplateWidget(designerSettingsRef);

    // Editor mount

    const handleMount: OnMount = useCallback((editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        // The effect above ran before the editor existed, so apply the indent setting once here.
        editor.getModel()?.updateOptions({ tabSize: indentSize, indentSize, insertSpaces: true });

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

        initCollections(editor);
        registerProviders(monaco);
        const idTemplateWidget = registerCursorWidget(editor, monaco, idTemplateWidgetDef);
        editor.onDidDispose(() => idTemplateWidget.dispose());

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
            if ((e.event.ctrlKey || e.event.metaKey) && annotationsRef.current.idLineMap.has(line)) {
                editor.setPosition(e.target.position!);
                editor.trigger('mouse', 'editor.action.referenceSearch.trigger', {});
            }
        });
    }, [initCollections, registerProviders, idTemplateWidgetDef, errorLineLogMapRef, warningLineLogMapRef, indentSize]);

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
                <span className="text-small text-muted" style={{ marginLeft: 'auto' }}>
                    Ctrl+Space for autocomplete - f1 for command palette
                </span>
                <button
                    className={`text-small ${styles.btnIcon} ${styles.settingsToggle}`}
                    onClick={() => setSettingsOpen(o => !o)}
                    title="Editor settings"
                >
                    ⚙
                </button>
            </div>

            {settingsOpen && (
                <div className={styles.editorToolbar}>
                    <ToggleButton
                        checked={showWhitespace}
                        onToggle={onToggleWhitespace}
                        className={`text-small ${styles.btnIcon}`}
                    >
                        {showWhitespace ? 'Hide Whitespaces' : 'Show Whitespaces'}
                    </ToggleButton>
                    <ToggleButton
                        checked={fillDefaults}
                        onToggle={onToggleFillDefaults}
                        className={`text-small ${styles.btnIcon}`}
                    >
                        {fillDefaults ? "Don't fill defaults" : 'Fill defaults'}
                    </ToggleButton>
                    <label className="text-small flex align-center gap-sm">
                        Indent
                        <select
                            className="text-small"
                            value={indentSize}
                            onChange={e => setIndentSize(Number(e.target.value))}
                        >
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(size => (
                                <option key={size} value={size}>{size === 1 ? '1 space' : `${size} spaces`}</option>
                            ))}
                        </select>
                    </label>
                </div>
            )}

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
