import type * as MonacoType from 'monaco-editor';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

export interface CursorWidgetTarget {
    lineNumber: number;
    startColumn: number;
    endColumn: number;
}

export interface CursorWidgetDef<T extends CursorWidgetTarget> {
    // Unique Monaco content-widget id; also used as the executeEdits source tag.
    id: string;
    // Does this line/cursor describe this widget's target?
    detect: (lineText: string, lineNumber: number, fullText: string) => T | null;
    // Is b the same target resyncing (re-render in place) or a different one (reopen)?
    isSameTarget: (a: T, b: T) => boolean;
    // Builds the widget's contents; call write(text) to splice text into the tracked range.
    render: (data: T, write: (text: string) => void) => ReactNode;
}

function registerCursorWidget<T extends CursorWidgetTarget>(
    editor: MonacoType.editor.IStandaloneCodeEditor,
    monaco: typeof MonacoType,
    def: CursorWidgetDef<T>,
): MonacoType.IDisposable {
    let active: T | null = null;
    let widget: MonacoType.editor.IContentWidget | null = null;
    let root: Root | null = null;
    let domNode: HTMLDivElement | null = null;

    function closeWidget() {
        if (widget) {
            editor.removeContentWidget(widget);
            widget = null;
        }
        // Unmount async since this can be called from inside the widget's own render.
        const r = root;
        root = null;
        domNode = null;
        if (r) setTimeout(() => r.unmount(), 0);
        active = null;
    }

    function write(text: string) {
        if (!active) return;
        const range = new monaco.Range(active.lineNumber, active.startColumn, active.lineNumber, active.endColumn);
        editor.executeEdits(def.id, [{ range, text }]);
        active = { ...active, endColumn: active.startColumn + text.length };
    }

    function openWidget(data: T) {
        active = data;

        const dom = document.createElement('div');
        domNode = dom;
        const r = createRoot(dom);
        root = r;
        r.render(def.render(data, write));

        const w: MonacoType.editor.IContentWidget = {
            getId: () => def.id,
            getDomNode: () => dom,
            getPosition: () => ({
                position: { lineNumber: data.lineNumber, column: data.startColumn },
                preference: [
                    monaco.editor.ContentWidgetPositionPreference.BELOW,
                    monaco.editor.ContentWidgetPositionPreference.ABOVE,
                ],
            }),
            allowEditorOverflow: true,
        };
        widget = w;
        editor.addContentWidget(w);
    }

    function recheck() {
        const position = editor.getPosition();
        const model = editor.getModel();
        if (!position || !model) {
            if (active) closeWidget();
            return;
        }

        const lineNumber = position.lineNumber;
        const lineText = model.getLineContent(lineNumber);
        const fullText = model.getValue(monaco.editor.EndOfLinePreference.LF);
        const detected = def.detect(lineText, lineNumber, fullText);
        if (!detected) {
            if (active) closeWidget();
            return;
        }

        if (active && def.isSameTarget(active, detected)) {
            active = detected;
            root?.render(def.render(active, write));
            return;
        }

        closeWidget();
        openWidget(detected);
    }

    // Deferred a tick so we can tell focus moving into the widget from focus leaving it.
    function handleBlur() {
        setTimeout(() => {
            if (!active) return;
            if (domNode && domNode.contains(document.activeElement)) return;
            closeWidget();
        }, 0);
    }

    const cursorDisposable = editor.onDidChangeCursorPosition(recheck);
    const contentDisposable = editor.onDidChangeModelContent(recheck);
    const blurDisposable = editor.onDidBlurEditorText(handleBlur);
    recheck();

    return {
        dispose() {
            cursorDisposable.dispose();
            contentDisposable.dispose();
            blurDisposable.dispose();
            closeWidget();
        },
    };
}

// `any` erases each def's own T so defs of different widget types can share one array.
export function registerCursorWidgets(
    editor: MonacoType.editor.IStandaloneCodeEditor,
    monaco: typeof MonacoType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    defs: CursorWidgetDef<any>[],
): MonacoType.IDisposable {
    const disposables = defs.map(def => registerCursorWidget(editor, monaco, def));
    return {
        dispose() {
            disposables.forEach(d => d.dispose());
        },
    };
}
