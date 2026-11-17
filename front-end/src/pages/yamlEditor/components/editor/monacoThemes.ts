import { readPersisted } from '../../../../hooks/usePersistedState';
import type { BeforeMount } from '@monaco-editor/react';
import type * as MonacoType from 'monaco-editor';

export function getMonacoTheme(): string {
    // Same key and format as ThemeToggle's usePersistedState, read without a hook.
    const saved = readPersisted<string | null>('theme', null);
    const isDark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    return isDark ? 'fedgw-dark' : 'fedgw-light';
}

// The built-in YAML tokenizer gives quoted and unquoted values the same 'string.yaml'
// token, so a custom Monarch tokenizer is the only way to style them differently.
// See: https://microsoft.github.io/monaco-editor/monarch.html
const YAML_TOKENIZER: MonacoType.languages.IMonarchLanguage = {
    defaultToken: '',

    keywords: ['true', 'false', 'null', '~'],

    tokenizer: {
        root: [
            { include: '@whitespace' },

            // Document markers
            [/---/, 'keyword'],
            [/\.\.\./, 'keyword'],

            // Keys: word chars before ": " or ":" at end of line
            [/\w[\w\-. ]*(?=\s*:(?:\s|$))/, 'type.yaml'],

            // Strings
            [/"([^"\\]|\\.)*$/, 'string.invalid'],
            [/"/, { token: 'string.quoted.yaml', next: '@dqstring' }],
            [/'[^']*'/, 'string.quoted.yaml'],

            // Numbers
            [/0x[\da-fA-F]+/, 'number'],
            [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/, 'number'],

            // Block scalar indicators
            [/[|>][-+]?\d*/, 'keyword'],

            // Keywords (booleans, null)
            [/\S+/, { cases: { '@keywords': 'keyword', '@default': '' } }],
        ],

        dqstring: [
            [/[^"\\]+/, 'string.quoted.yaml'],
            [/\\./, 'string.quoted.yaml'],
            [/"/, { token: 'string.quoted.yaml', next: '@pop' }],
        ],

        whitespace: [
            [/[ \t\r\n]+/, 'white'],
            [/#.*$/, 'comment'],
        ],
    },
};

const DARK_THEME: MonacoType.editor.IStandaloneThemeData = {
    base: 'vs-dark',
    inherit: true,
    rules: [
        { token: 'type.yaml',          foreground: 'd4916a' },
        { token: 'string.quoted.yaml', foreground: '98c379' },
        { token: 'comment',            foreground: '777777' },
        { token: 'keyword',            foreground: 'd4916a' },
        { token: 'number',             foreground: 'e5c07b' },
    ],
    colors: {
        'editor.background':                  '#252525',
        'editor.foreground':                  '#eeeeee',
        'editorLineNumber.foreground':         '#555555',
        'editorLineNumber.activeForeground':   '#aaaaaa',
        'editor.lineHighlightBackground':      '#2d2d2d',
        'editorCursor.foreground':             '#eeeeee',
        'editor.selectionBackground':          '#3a3a5a',
        'editorIndentGuide.background1':       '#333333',
        'editorIndentGuide.activeBackground1': '#555555',
        'scrollbarSlider.background':          '#ffffff22',
        'scrollbarSlider.hoverBackground':     '#ffffff44',
    },
};

const LIGHT_THEME: MonacoType.editor.IStandaloneThemeData = {
    base: 'vs',
    inherit: true,
    rules: [
        { token: 'type.yaml',   foreground: 'd4916a' },
        { token: 'string.quoted.yaml', foreground: '4e9a5e' },
        { token: 'comment',     foreground: '888888' },
        { token: 'keyword',     foreground: 'd4916a' },
        { token: 'number',      foreground: 'a67d3d' },
    ],
    colors: {
        'editor.background':                  '#ffffff',
        'editor.foreground':                  '#212529',
        'editorLineNumber.foreground':         '#aaaaaa',
        'editorLineNumber.activeForeground':   '#495057',
        'editor.lineHighlightBackground':      '#f1f3f5',
        'editor.selectionBackground':          '#dae4f0',
        'scrollbarSlider.background':          '#00000022',
        'scrollbarSlider.hoverBackground':     '#00000044',
    },
};

// Language setup is global to Monaco, so it runs once however many editors mount.
let languageConfigured = false;

export const beforeMount: BeforeMount = (monaco) => {
    if (!languageConfigured) {
        languageConfigured = true;
        monaco.languages.setMonarchTokensProvider('yaml', YAML_TOKENIZER);

        // Enter after a "- " line lines up with the entry's keys, not the dash. "Indent" adds one
        // indent unit (whatever width is set) and appendText the dash's width on top. Replaces
        // the built-in rules, so the trailing-colon indent is repeated last.
        // wordPattern keeps "limit-count" one word, so accepting a suggestion replaces all of it.
        monaco.languages.setLanguageConfiguration('yaml', {
            wordPattern: /[A-Za-z_][\w.-]*/,
            onEnterRules: [
                { beforeText: /^\s*- .*:\s*$/, action: { indentAction: monaco.languages.IndentAction.Indent, appendText: '  ' } },
                { beforeText: /^\s*- \S/, action: { indentAction: monaco.languages.IndentAction.None, appendText: '  ' } },
                { beforeText: /:\s*$/, action: { indentAction: monaco.languages.IndentAction.Indent } },
            ],
        });
    }
    monaco.editor.defineTheme('fedgw-dark', DARK_THEME);
    monaco.editor.defineTheme('fedgw-light', LIGHT_THEME);
};
