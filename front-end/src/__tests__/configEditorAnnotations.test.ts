import { describe, it, expect } from 'vitest';
import { parseYamlDoc } from '../pages/yamlEditor/yamlLineUtils';
import { buildAnnotations } from '../pages/yamlEditor/components/editor/configEditorAnnotations';
import type { ApisixConfig } from '../actions/SchemaValidation';

// ConfigEditor builds annotations from one parse (positions and content alike); pairing fresh
// positions with an older config used to put reference hints on the wrong lines mid-edit.
function hintLines(lines: string[]): number[] {
    const parsed = parseYamlDoc(lines.join('\n'));
    return [...buildAnnotations(parsed, parsed.doc.toJS() as ApisixConfig).referenceHintMap.keys()].sort((a, b) => a - b);
}

const upstreams = ['upstreams:', '  - id: u1'];
const r1 = ['  - id: r1', '    upstream_id: u1'];
const r2 = ['  - id: r2', '    upstream_id: u1'];

describe('buildAnnotations while a new "-" entry is being typed', () => {
    it.each([
        ['an empty entry between two routes', [...upstreams, 'routes:', ...r1, '  -', ...r2], [5, 8]],
        ['an empty entry first in the list', [...upstreams, 'routes:', '  -', ...r1, ...r2], [6, 8]],
        ['a dash typed at the key column (invalid YAML)', [...upstreams, 'routes:', ...r1, '    -', ...r2], [5, 8]],
    ])('keeps reference hints on the upstream_id lines with %s', (_, lines, expected) => {
        expect(hintLines(lines)).toEqual(expected);
    });
});
