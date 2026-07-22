import { describe, it, expect } from 'vitest';
import { resolveCursorContext } from '../pages/yamlEditor/components/CursorContext';
import { CATEGORY_DEFINITIONS } from '../config/categoryDefinitions';

describe('resolveCursorContext', () => {
    it('resolves "plugin-key" with a schemaPath scoped to the plugin schema, not the full document path', () => {
        // Regression test: schemaPath used to leak the "plugins"/pluginName prefix into
        // plugin-key contexts, so every real (nested) plugin-key completion resolved to
        // nothing - CandidateResolver.test.ts never caught this because it hand-built
        // CursorContext objects and never exercised this function.
        const text = [
            'routes:',
            '  - id: r1',
            '    uri: /foo',
            '    plugins:',
            '      limit-count:',
            '        count: 2',
            '        ',
        ].join('\n');
        const cursorLine = 7;
        const cursorCol = 9;

        const context = resolveCursorContext(text, cursorLine, cursorCol, CATEGORY_DEFINITIONS);

        expect(context.kind).toBe('plugin-key');
        if (context.kind !== 'plugin-key') throw new Error('unreachable');
        expect(context.pluginName).toBe('limit-count');
        expect(context.schemaPath).toEqual([]);
    });

    it('resolves "plugin-key" schemaPath for a field nested inside the plugin\'s own schema', () => {
        const text = [
            'routes:',
            '  - id: r1',
            '    plugins:',
            '      some-plugin:',
            '        nested:',
            '          ',
        ].join('\n');
        const cursorLine = 6;
        const cursorCol = 11;

        const context = resolveCursorContext(text, cursorLine, cursorCol, CATEGORY_DEFINITIONS);

        expect(context.kind).toBe('plugin-key');
        if (context.kind !== 'plugin-key') throw new Error('unreachable');
        expect(context.pluginName).toBe('some-plugin');
        expect(context.schemaPath).toEqual(['nested']);
    });

    it('resolves "plugin-name" right inside a fresh plugins block', () => {
        const text = ['routes:', '  - id: r1', '    plugins:', '      '].join('\n');
        const context = resolveCursorContext(text, 4, 7, CATEGORY_DEFINITIONS);
        expect(context.kind).toBe('plugin-name');
    });

    it('resolves "plugin-value" with a schemaPath scoped to the plugin schema', () => {
        const text = [
            'routes:',
            '  - id: r1',
            '    plugins:',
            '      limit-count:',
            '        policy: ',
        ].join('\n');
        const context = resolveCursorContext(text, 5, 17, CATEGORY_DEFINITIONS);

        expect(context.kind).toBe('plugin-value');
        if (context.kind !== 'plugin-value') throw new Error('unreachable');
        expect(context.pluginName).toBe('limit-count');
        expect(context.schemaPath).toEqual(['policy']);
    });

    it('resolves plain "key" context for a non-plugin field', () => {
        const text = ['routes:', '  - id: r1', '    '].join('\n');
        const context = resolveCursorContext(text, 3, 5, CATEGORY_DEFINITIONS);
        expect(context.kind).toBe('key');
    });
});
