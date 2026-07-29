import { useCallback, useEffect, useRef } from 'react';
import type * as MonacoType from 'monaco-editor';
import { registerCursorWidgets as registerCursorWidgetsImpl, type CursorWidgetDef } from './CursorContentWidget';

// Registers cursor-triggered Monaco widgets (see CursorContentWidget.ts) and disposes them on unmount.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useCursorWidgets(defs: CursorWidgetDef<any>[]) {
    const disposableRef = useRef<MonacoType.IDisposable | null>(null);

    useEffect(() => {
        return () => {
            disposableRef.current?.dispose();
            disposableRef.current = null;
        };
    }, []);

    const registerCursorWidgets = useCallback((editor: MonacoType.editor.IStandaloneCodeEditor, monaco: typeof MonacoType) => {
        disposableRef.current = registerCursorWidgetsImpl(editor, monaco, defs);
    }, [defs]);

    return { registerCursorWidgets };
}
