import { describe, it, expect } from 'vitest';
import { buildCursorLocation } from '../pages/yamlEditor/components/CursorLocation';

describe('buildCursorLocation', () => {
    it('returns null when the requested line is out of range', () => {
        expect(buildCursorLocation('routes:\n  - id: r1', 10)).toBeNull();
    });

    it('reports indent 0 and no category on a top-level section line', () => {
        const loc = buildCursorLocation('routes:', 1);
        expect(loc!.indent).toBe(0);
        expect(loc!.category).toBeUndefined();
    });

    it('detects the enclosing category by scanning upward to the section header', () => {
        const text = ['routes:', '  - id: r1', '    uri: /foo'].join('\n');
        const loc = buildCursorLocation(text, 3);
        expect(loc!.category).toBe('route');
    });

    it('flags a fresh list-marker line as an entry marker line', () => {
        const text = ['routes:', '  - '].join('\n');
        const loc = buildCursorLocation(text, 2);
        expect(loc!.isEntryMarkerLine).toBe(true);
    });

    it('does not flag a regular key line as an entry marker line', () => {
        const text = ['routes:', '  - id: r1', '    uri: /foo'].join('\n');
        const loc = buildCursorLocation(text, 3);
        expect(loc!.isEntryMarkerLine).toBe(false);
    });

    it('collects sibling keys already present in the same entry', () => {
        const text = ['routes:', '  - id: r1', '    uri: /foo', '    name: test'].join('\n');
        // cursor on the blank continuation after "name: test" would be line 5, but let's check
        // the keys visible while sitting on the "uri" line itself (siblings from above+below)
        const loc = buildCursorLocation(text, 3);
        expect(loc!.existingKeys.has('id')).toBe(true);
        expect(loc!.existingKeys.has('name')).toBe(true);
    });

    it('collects sibling values alongside sibling keys, stripping quotes and inline comments', () => {
        const text = [
            'routes:',
            '  - id: r1',
            '    policy: "redis" # which backend',
            '    count: 5',
        ].join('\n');
        // cursor sits on the "count" line; "id" (from the marker line) and "policy" are siblings above it
        const loc = buildCursorLocation(text, 4);
        expect(loc!.existingValues.get('id')).toBe('r1');
        expect(loc!.existingValues.get('policy')).toBe('redis');
    });

    it('does not carry sibling values over from a previous entry', () => {
        const text = ['routes:', '  - id: r1', '    policy: redis', '  - id: r2', '    uri: /foo'].join('\n');
        const loc = buildCursorLocation(text, 5);
        expect(loc!.existingValues.has('policy')).toBe(false);
    });

    it('walks up to build the schema path for a nested field', () => {
        const text = ['routes:', '  - id: r1', '    timeout:', '      connect: 5'].join('\n');
        const loc = buildCursorLocation(text, 4);
        expect(loc!.schemaPath).toEqual(['timeout']);
    });

    it('detects a value-position key right after "key: "', () => {
        const text = ['routes:', '  - id: r1', '    uri: '].join('\n');
        const loc = buildCursorLocation(text, 3, 10);
        expect(loc!.valuePositionKey).toBe('uri');
    });

    it('returns a null value-position key when no column is given', () => {
        const text = ['routes:', '  - id: r1', '    uri: '].join('\n');
        const loc = buildCursorLocation(text, 3);
        expect(loc!.valuePositionKey).toBeNull();
    });

    it('marks a field sharing its entry marker\'s indent as under-indented', () => {
        // "uri" here sits at the same indent as the "-" marker, one level too shallow
        const text = ['routes:', '  - id: r1', '  uri: /foo'].join('\n');
        const loc = buildCursorLocation(text, 3);
        expect(loc!.isUnderIndentedField).toBe(true);
    });

    it('resolves a flow-mapping parent key for cursor inside "{ }"', () => {
        const text = ['routes:', '  - id: r1', '    timeout: {connect: 5, send: '].join('\n');
        const loc = buildCursorLocation(text, 3, text.split('\n')[2].length + 1);
        expect(loc!.schemaPath).toContain('timeout');
    });
});
