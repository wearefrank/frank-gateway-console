import { describe, it, expect } from 'vitest';
import {
    buildLineSegments,
    buildCategoryLineMap,
    parseYamlDoc,
    resolvePathToNode,
} from '../pages/yamlEditor/yamlLineUtils';

// ---------------------------------------------------------------------------
// buildLineSegments
// ---------------------------------------------------------------------------

describe('buildLineSegments', () => {
    it('splits a simple key/value line into a key segment and a normal segment', () => {
        const segments = buildLineSegments('uri: /foo', false);
        expect(segments[0]).toEqual({ text: 'uri:', type: 'key' });
        expect(segments.some(s => s.type === 'normal' && s.text.includes('/foo'))).toBe(true);
    });

    it('marks everything after a # as a comment', () => {
        const segments = buildLineSegments('uri: /foo # a comment', false);
        const comment = segments.find(s => s.type === 'comment');
        expect(comment?.text).toBe('# a comment');
    });

    it('does not treat a # inside quotes as a comment', () => {
        const segments = buildLineSegments('uri: "/foo#bar"', false);
        expect(segments.some(s => s.type === 'comment')).toBe(false);
    });

    it('does not treat a colon inside a quoted value as a key separator', () => {
        const segments = buildLineSegments('uri: "http://example.com"', false);
        const key = segments.find(s => s.type === 'key');
        expect(key?.text).toBe('uri:');
    });

    it('treats a list marker line with no key as having no key segment', () => {
        const segments = buildLineSegments('- /foo', false);
        expect(segments.some(s => s.type === 'key')).toBe(false);
    });

    it('recognizes a key following a list marker', () => {
        const segments = buildLineSegments('- id: my-route', false);
        const key = segments.find(s => s.type === 'key');
        expect(key?.text).toBe('id:');
    });

    it('extracts a ${{...}} placeholder as its own segment', () => {
        const segments = buildLineSegments('value: ${{ENV_VAR}}', false);
        const placeholder = segments.find(s => s.type === 'placeholder');
        expect(placeholder?.text).toBe('${{ENV_VAR}}');
    });

    it('falls back to normal text when a placeholder is unclosed', () => {
        const segments = buildLineSegments('value: ${{ENV_VAR', false);
        expect(segments.some(s => s.type === 'placeholder')).toBe(false);
    });

    it('replaces leading spaces with whitespace markers when requested', () => {
        const segments = buildLineSegments('  key: value', true);
        const whitespace = segments.find(s => s.type === 'whitespace');
        expect(whitespace).toBeDefined();
        expect(whitespace!.text).not.toContain(' ');
    });

    it('leaves spaces untouched when showWhitespace is false', () => {
        const segments = buildLineSegments('  key: value', false);
        expect(segments.some(s => s.type === 'whitespace')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// parseYamlDoc / buildCategoryLineMap
// ---------------------------------------------------------------------------

describe('parseYamlDoc + buildCategoryLineMap', () => {
    const yaml = [
        'routes:',
        '  - id: route-1',
        '    uri: /foo',
        'upstreams:',
        '  - id: upstream-1',
        '    nodes:',
        '      "127.0.0.1:80": 1',
    ].join('\n');

    it('parses the document and exposes a line counter', () => {
        const { doc, lineCounter } = parseYamlDoc(yaml);
        expect(doc.contents).toBeDefined();
        expect(lineCounter).toBeDefined();
    });

    it('maps every line within a category block to its singular category name', () => {
        const { doc, lineCounter } = parseYamlDoc(yaml);
        const lineMap = buildCategoryLineMap(doc, lineCounter);

        // "routes:" is line 1 (LineCounter is 1-indexed), entries follow on lines 2-3
        expect(lineMap.get(1)).toBe('route');
        expect(lineMap.get(2)).toBe('route');
        expect(lineMap.get(3)).toBe('route');

        // "upstreams:" starts at line 4 and its block runs through line 7
        expect(lineMap.get(4)).toBe('upstream');
        expect(lineMap.get(7)).toBe('upstream');
    });

    it('returns an empty map when the document root is not a mapping', () => {
        const { doc, lineCounter } = parseYamlDoc('- just\n- a\n- list');
        const lineMap = buildCategoryLineMap(doc, lineCounter);
        expect(lineMap.size).toBe(0);
    });

    it('ignores top-level keys that are not known categories', () => {
        const { doc, lineCounter } = parseYamlDoc('unrelated_key:\n  - foo');
        const lineMap = buildCategoryLineMap(doc, lineCounter);
        expect(lineMap.size).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// resolvePathToNode
// ---------------------------------------------------------------------------

describe('resolvePathToNode', () => {
    const yaml = [
        'routes:',
        '  - id: route-1',
        '    uri: /foo',
    ].join('\n');

    it('resolves an exact path to its node', () => {
        const { doc } = parseYamlDoc(yaml);
        const node = resolvePathToNode(doc, '/routes/0/uri');
        expect(node).not.toBeNull();
    });

    it('falls back to the nearest ancestor when the exact path does not exist', () => {
        const { doc } = parseYamlDoc(yaml);
        const node = resolvePathToNode(doc, '/routes/0/does_not_exist');
        expect(node).not.toBeNull();
    });

    it('falls back all the way to the document root when no segment of the path matches', () => {
        const { doc } = parseYamlDoc(yaml);
        const node = resolvePathToNode(doc, '/unrelated/5/field');
        expect(node).toBe(doc.contents);
    });

    it('returns null for a document with no content at all', () => {
        const { doc } = parseYamlDoc('');
        const node = resolvePathToNode(doc, '/routes/0/uri');
        expect(node).toBeNull();
    });
});
