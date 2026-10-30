import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

// Use the locally-installed monaco-editor package instead of the CDN.
loader.config({ monaco });

// The YAML language features all run on the main thread, so the base editor worker is the only one.
window.MonacoEnvironment = {
    getWorker(): Worker {
        return new EditorWorker();
    },
};
