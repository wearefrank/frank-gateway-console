import { describe, it, expect } from 'vitest';
import { IdTemplateWidgetDetector } from '../pages/yamlEditor/components/widgets/idTemplateWidget/IdTemplateWidgetDetector';
import { DEFAULT_DESIGNER_SETTINGS, type DesignerSettings } from '../settings/AppSettings';

describe('IdTemplateWidgetDetector.parseLine', () => {
    it('parses a key on a fresh list-marker line', () => {
        const line = '  - id: my-route';
        const parsed = IdTemplateWidgetDetector.parseLine(line);
        expect(parsed?.key).toBe('id');
        expect(line.slice((parsed!.startColumn - 1), parsed!.endColumn - 1)).toBe('my-route');
    });

    it('parses a nested key without a list marker', () => {
        const line = '    id: my-upstream';
        const parsed = IdTemplateWidgetDetector.parseLine(line);
        expect(parsed?.key).toBe('id');
        expect(line.slice(parsed!.startColumn - 1, parsed!.endColumn - 1)).toBe('my-upstream');
    });

    it('handles an empty value right after the colon', () => {
        const line = '    id: ';
        const parsed = IdTemplateWidgetDetector.parseLine(line);
        expect(parsed?.key).toBe('id');
        expect(line.slice(parsed!.startColumn - 1, parsed!.endColumn - 1)).toBe('');
    });

    it('handles no space after the colon', () => {
        const line = '    id:my-route';
        const parsed = IdTemplateWidgetDetector.parseLine(line);
        expect(parsed?.key).toBe('id');
        expect(line.slice(parsed!.startColumn - 1, parsed!.endColumn - 1)).toBe('my-route');
    });

    it('recognizes whichever key is on the line, not just "id"', () => {
        const line = '    uri: /foo';
        const parsed = IdTemplateWidgetDetector.parseLine(line);
        expect(parsed?.key).toBe('uri');
    });

    it('stops the value before a trailing inline comment, whitespace trimmed', () => {
        const line = '  - id: my-route   # TODO rename';
        const parsed = IdTemplateWidgetDetector.parseLine(line);
        expect(line.slice(parsed!.startColumn - 1, parsed!.endColumn - 1)).toBe('my-route');
    });

    it('does not treat a "#" inside the value as a comment when not preceded by whitespace', () => {
        const line = '  - id: my#route';
        const parsed = IdTemplateWidgetDetector.parseLine(line);
        expect(line.slice(parsed!.startColumn - 1, parsed!.endColumn - 1)).toBe('my#route');
    });

    it('returns null for a bare list marker with no key', () => {
        expect(IdTemplateWidgetDetector.parseLine('  - ')).toBeNull();
        expect(IdTemplateWidgetDetector.parseLine('  -')).toBeNull();
    });

    it('returns null for a blank line', () => {
        expect(IdTemplateWidgetDetector.parseLine('')).toBeNull();
        expect(IdTemplateWidgetDetector.parseLine('    ')).toBeNull();
    });
});

function withRouteIdTemplate(template: string, placeHolderOptions: Record<string, string[]> = {}): DesignerSettings {
    return {
        ...DEFAULT_DESIGNER_SETTINGS,
        overrideSettings: {
            global: {},
            perCategory: { route: { id: { template, placeHolderOptions } } },
        },
    };
}

describe('IdTemplateWidgetDetector.detect', () => {
    const settings = withRouteIdTemplate('{subdomain}-route', { subdomain: ['api', 'web'] });

    it('detects the id field on a category with a configured template', () => {
        const text = ['routes:', '  - id: '].join('\n');
        const result = IdTemplateWidgetDetector.detect('  - id: ', 2, text, settings);
        expect(result?.category).toBe('route');
        expect(result?.idField).toBe('id');
        expect(result?.rawValue).toBe('');
    });

    it('returns null off the id field, even within the same entry', () => {
        const text = ['routes:', '  - id: api-route', '    uri: /foo'].join('\n');
        const result = IdTemplateWidgetDetector.detect('    uri: /foo', 3, text, settings);
        expect(result).toBeNull();
    });

    it('returns null when the category has no configured id template', () => {
        const text = ['upstreams:', '  - id: '].join('\n');
        const result = IdTemplateWidgetDetector.detect('  - id: ', 2, text, settings);
        expect(result).toBeNull();
    });

    it('returns null for a legacy id that does not fit the template', () => {
        const text = ['routes:', '  - id: hand-typed-legacy-id'].join('\n');
        const result = IdTemplateWidgetDetector.detect('  - id: hand-typed-legacy-id', 2, text, settings);
        expect(result).toBeNull();
    });

    it('detects a value already matching the template, quotes and all', () => {
        const text = ['routes:', '  - id: "api-route"'].join('\n');
        const result = IdTemplateWidgetDetector.detect('  - id: "api-route"', 2, text, settings);
        expect(result?.rawValue).toBe('api-route');
    });
});

describe('IdTemplateWidgetDetector.isSameTarget', () => {
    const base = { category: 'route', idField: 'id', idSettings: {}, rawValue: '', lineNumber: 2, startColumn: 1, endColumn: 1 };

    it('is the same target when category and line number match', () => {
        expect(IdTemplateWidgetDetector.isSameTarget(base, { ...base, rawValue: 'api-route' })).toBe(true);
    });

    it('is a different target when the line number changes', () => {
        expect(IdTemplateWidgetDetector.isSameTarget(base, { ...base, lineNumber: 3 })).toBe(false);
    });

    it('is a different target when the category changes', () => {
        expect(IdTemplateWidgetDetector.isSameTarget(base, { ...base, category: 'upstream' })).toBe(false);
    });
});

describe('IdTemplateWidgetDetector.formatWriteValue', () => {
    it('wraps the value in quotes', () => {
        expect(IdTemplateWidgetDetector.formatWriteValue('api-route')).toBe('"api-route"');
    });

    it('escapes embedded quotes', () => {
        expect(IdTemplateWidgetDetector.formatWriteValue('api"route')).toBe('"api\\"route"');
    });
});
