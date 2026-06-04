import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
// yaml.worker.js is already a pre-built self-contained bundle.
// Using ?url serves it as a static asset without Vite re-bundling it through
// the ESM pipeline, which would otherwise break the pre-compiled script.
import yamlWorkerUrl from 'monaco-yaml/yaml.worker.js?url';

// Use the locally-installed monaco-editor package instead of CDN so that
// monaco-yaml workers are built against the same Monaco version as the editor.
loader.config({ monaco });

// Provide web workers for Monaco's language services.
window.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string): Worker {
        if (label === 'yaml') return new Worker(yamlWorkerUrl);
        return new EditorWorker();
    },
};
