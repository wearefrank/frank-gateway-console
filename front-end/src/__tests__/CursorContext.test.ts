import { describe, it, expect } from 'vitest';
import { resolveCursorContext, type CursorContext } from '../pages/yamlEditor/components/providers/CursorContext';
import { CATEGORY_DEFINITIONS } from '../config/categoryDefinitions';

// "|" marks the cursor; it is removed before resolving.
function at(lines: string[]): CursorContext {
    const lineIdx = lines.findIndex(l => l.includes('|'));
    const column = lines[lineIdx].indexOf('|') + 1;
    const text = lines.map(l => l.replace('|', '')).join('\n');
    return resolveCursorContext(text, lineIdx + 1, column, CATEGORY_DEFINITIONS);
}

function keyPath(context: CursorContext): string[] {
    if (context.kind !== 'key' && context.kind !== 'plugin-key') throw new Error(`expected a key context, got ${context.kind}`);
    return context.schemaPath;
}

describe('resolveCursorContext', () => {
    it('resolves "plugin-key" with a schemaPath scoped to the plugin schema, not the full document path', () => {
        // Regression test: schemaPath used to leak the "plugins"/pluginName prefix into
        // plugin-key contexts, so every real (nested) plugin-key completion resolved to nothing.
        const context = at(['routes:', '  - id: r1', '    uri: /foo', '    plugins:', '      limit-count:', '        count: 2', '        |']);
        expect(context.kind).toBe('plugin-key');
        if (context.kind !== 'plugin-key') throw new Error('unreachable');
        expect(context.pluginName).toBe('limit-count');
        expect(context.schemaPath).toEqual([]);
        expect(context.siblings.get('count')).toBe('2');
    });

    it('resolves "plugin-key" schemaPath for a field nested inside the plugin\'s own schema', () => {
        const context = at(['routes:', '  - id: r1', '    plugins:', '      some-plugin:', '        nested:', '          |']);
        expect(context).toMatchObject({ kind: 'plugin-key', pluginName: 'some-plugin', schemaPath: ['nested'] });
    });

    it('resolves "plugin-name" right inside a fresh plugins block', () => {
        expect(at(['routes:', '  - id: r1', '    plugins:', '      |']).kind).toBe('plugin-name');
    });

    it('resolves "plugin-value" with a schemaPath scoped to the plugin schema', () => {
        const context = at(['routes:', '  - id: r1', '    plugins:', '      limit-count:', '        policy: |']);
        expect(context).toMatchObject({ kind: 'plugin-value', pluginName: 'limit-count', schemaPath: ['policy'] });
    });

    it('resolves plain "key" context for a non-plugin field', () => {
        expect(at(['routes:', '  - id: r1', '    |']).kind).toBe('key');
    });

    it('offers categories at the top level', () => {
        expect(at(['routes: []', '|']).kind).toBe('category');
    });

    describe('siblings', () => {
        it('collects keys from above and below, stripping quotes and comments from values', () => {
            const context = at(['routes:', '  - id: r1', '    policy: "redis" # which backend', '    |', '    name: test']);
            if (context.kind !== 'key') throw new Error('unreachable');
            expect([...context.siblings.keys()].sort()).toEqual(['id', 'name', 'policy']);
            expect(context.siblings.get('policy')).toBe('redis');
        });

        it('does not carry siblings over from a previous entry', () => {
            const context = at(['routes:', '  - id: r1', '    policy: redis', '  - id: r2', '    |']);
            if (context.kind !== 'key') throw new Error('unreachable');
            expect(context.siblings.has('policy')).toBe(false);
        });

        it('leaves out the word being typed', () => {
            const context = at(['routes:', '  - id: r1', '    na|']);
            if (context.kind !== 'key') throw new Error('unreachable');
            expect([...context.siblings.keys()]).toEqual(['id']);
        });
    });

    describe('any indent style', () => {
        it.each([
            ['2 spaces', ['upstreams:', '  - id: u1', '    nodes:', '      - host: a', '        port: 1', '      - h|']],
            ['4 spaces', ['upstreams:', '    - id: u1', '      nodes:', '          - host: a', '            port: 1', '          - h|']],
            ['1 space', ['upstreams:', ' - id: u1', '   nodes:', '    - host: a', '      port: 1', '    - h|']],
            ['compact lists', ['upstreams:', '- id: u1', '  nodes:', '  - host: a', '    port: 1', '  - h|']],
        ])('steps into a new list item under nodes (%s)', (_, lines) => {
            const context = at(lines);
            expect(keyPath(context)).toEqual(['nodes', '[]']);
            if (context.kind !== 'key') throw new Error('unreachable');
            expect(context.siblings.size).toBe(0);
            expect(context.onListMarker).toBe(true);
        });

        it('walks a nested mapping at 4-space indent', () => {
            expect(keyPath(at(['routes:', '    - id: r1', '      timeout:', '          |']))).toEqual(['timeout']);
        });

        it('keeps a "- key:" marker line\'s key in the path for its children', () => {
            const context = at(['routes:', '  - plugins:', '      key-auth:', '        k|']);
            expect(context).toMatchObject({ kind: 'plugin-key', pluginName: 'key-auth', schemaPath: [] });
        });

        it('treats a key right after a bare "-" as a new list item', () => {
            expect(keyPath(at(['upstreams:', '  - id: u1', '    nodes:', '      -|']))).toEqual(['nodes', '[]']);
        });
    });

    describe('values', () => {
        it('resolves the key for a value right after "key: "', () => {
            expect(at(['routes:', '  - id: r1', '    scheme: |'])).toMatchObject({ kind: 'value', schemaPath: ['scheme'] });
        });

        it('resolves a partially typed value', () => {
            expect(at(['routes:', '  - id: r1', '    scheme: ht|'])).toMatchObject({ kind: 'value', schemaPath: ['scheme'] });
        });

        it('resolves a value after an opening quote', () => {
            expect(at(['routes:', '  - id: r1', '    scheme: "|'])).toMatchObject({ kind: 'value', schemaPath: ['scheme'] });
        });

        it('resolves an entry-level reference field', () => {
            expect(at(['routes:', '  - id: r1', '    upstream_id: |'])).toMatchObject({ kind: 'reference', targetCategory: 'upstream' });
        });

        it('resolves a key inside a flow mapping', () => {
            const context = at(['routes:', '  - id: r1', '    timeout: {connect: 5, |']);
            expect(keyPath(context)).toEqual(['timeout']);
            if (context.kind !== 'key') throw new Error('unreachable');
            expect(context.siblings.get('connect')).toBe('5');
        });
    });

    describe('nowhere valid to type', () => {
        it.each([
            ['a field under-indented to its entry\'s "-"', ['routes:', '  - id: r1', '  |']],
            ['a line indented deeper than any parent', ['routes:', '  - id: r1', '    uri: /a', '        |']],
            ['after a complete value', ['routes:', '  - id: r1', '    name: foo bar|']],
            ['a field directly under a category instead of an entry', ['routes:', '  |']],
        ])('returns unknown for %s', (_, lines) => {
            expect(at(lines).kind).toBe('unknown');
        });
    });
});
