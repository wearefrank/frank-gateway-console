import { LineCounter, parseDocument, visit, isMap, isPair, isScalar, isSeq } from 'yaml';
import type { CategoryDefinition } from '../../../../config/categoryDefinitions';
import { CATEGORY_KEY_MAP } from '../../yamlLineUtils';

// Schema path step meaning "into a list item", e.g. ["nodes", LIST_ITEM] for a key under "nodes: - ".
export const LIST_ITEM = '[]';

// Sibling keys of the cursor's mapping, with their scalar values ('' for anything else).
export type Siblings = Map<string, string>;

export type CursorContext =
    | { kind: 'category' }
    | { kind: 'key';          category: string; schemaPath: string[]; siblings: Siblings; onListMarker: boolean }
    | { kind: 'value';        category: string; schemaPath: string[]; siblings: Siblings }
    | { kind: 'plugin-name';  category: string; siblings: Siblings }
    | { kind: 'plugin-key';   category: string; pluginName: string; schemaPath: string[]; siblings: Siblings; onListMarker: boolean }
    | { kind: 'plugin-value'; category: string; pluginName: string; schemaPath: string[]; siblings: Siblings }
    | { kind: 'reference';    category: string; field: string; targetCategory: string }
    | { kind: 'unknown' }

const CURSOR = '__CURSOR__';

interface CursorNode {
    isKey: boolean;
    path: string[];
    siblings: Siblings;
    onListMarker: boolean;
}

// Puts a sentinel where the cursor's word is and lets the yaml parser work out the structure,
// so any indent width or list style works. Null when the cursor isn't somewhere a key or value fits.
function findCursorNode(text: string, line: number, column: number): CursorNode | null {
    const lines = text.split('\n');
    const lineText = lines[line - 1];
    if (lineText === undefined) return null;

    const head = lineText.slice(0, column - 1).replace(/[A-Za-z_][\w.-]*$/, '');
    let sentinelLine: string;
    if (/^\s*-$/.test(head)) {
        sentinelLine = `${head} ${CURSOR}:`;
    } else if (/^\s*(-\s+)?$/.test(head)) {
        sentinelLine = `${head}${CURSOR}:`;
    } else if (/:\s+"?$/.test(head)) {
        sentinelLine = head.replace(/"$/, '') + CURSOR;
    } else if (/[{,]\s*$/.test(head)) {
        const unclosed = (head.match(/\{/g) ?? []).length - (head.match(/\}/g) ?? []).length;
        sentinelLine = `${head}${CURSOR}: ${'}'.repeat(Math.max(unclosed, 0))}`;
    } else {
        return null;
    }
    lines[line - 1] = sentinelLine;

    const lineCounter = new LineCounter();
    const doc = parseDocument(lines.join('\n'), { lineCounter });
    // Errors on the cursor line mean it's mis-indented, so nothing typed there would be valid.
    if (doc.errors.some(e => lineCounter.linePos(e.pos[0]).line === line)) return null;

    let found: CursorNode | null = null;
    visit(doc, {
        Scalar(key, node, ancestors) {
            if (node.value !== CURSOR) return;
            const path: string[] = [];
            for (let i = 1; i < ancestors.length; i++) {
                const step = ancestors[i];
                if (isPair(step)) path.push(String(isScalar(step.key) ? step.key.value : step.key));
                else if (isSeq(ancestors[i - 1])) path.push(LIST_ITEM);
            }
            const isKey = key === 'key';
            // A key's own name is the sentinel; a value keeps the key it belongs to.
            if (isKey) path.pop();

            const siblings: Siblings = new Map();
            const owner = ancestors[ancestors.length - 2];
            if (isMap(owner)) {
                for (const pair of owner.items) {
                    const pairKey = isScalar(pair.key) ? String(pair.key.value) : '';
                    if (!pairKey || pairKey === CURSOR || pair.value === node) continue;
                    siblings.set(pairKey, isScalar(pair.value) ? String(pair.value.value ?? '') : '');
                }
            }
            found = { isKey, path, siblings, onListMarker: /^\s*-/.test(lineText) };
            return visit.BREAK;
        },
    });
    return found;
}

/**
 * Determines the completion context at the given cursor position.
 *
 * @param text         - full YAML document text
 * @param line         - 1-indexed cursor line (Monaco convention)
 * @param column       - 1-indexed cursor column (Monaco convention)
 * @param categoryDefs - category definition map (used for reference field lookup)
 */
export function resolveCursorContext(
    text: string,
    line: number,
    column: number,
    categoryDefs: Record<string, CategoryDefinition>,
): CursorContext {
    const cursor = findCursorNode(text, line, column);
    if (!cursor) return { kind: 'unknown' };

    const { isKey, path, siblings, onListMarker } = cursor;
    if (path.length === 0) return isKey ? { kind: 'category' } : { kind: 'unknown' };

    // Every category is a list of entries; only fields inside an entry get suggestions.
    const category = CATEGORY_KEY_MAP[path[0]];
    if (!category || path[1] !== LIST_ITEM) return { kind: 'unknown' };
    const entryPath = path.slice(2);

    const pluginsIdx = entryPath.indexOf('plugins');
    const pluginRest = pluginsIdx === -1 ? null : entryPath.slice(pluginsIdx + 1);

    if (isKey) {
        if (!pluginRest) return { kind: 'key', category, schemaPath: entryPath, siblings, onListMarker };
        if (pluginRest.length === 0) return { kind: 'plugin-name', category, siblings };
        return { kind: 'plugin-key', category, pluginName: pluginRest[0], schemaPath: pluginRest.slice(1), siblings, onListMarker };
    }

    const field = entryPath[entryPath.length - 1];
    const refField = entryPath.length === 1 ? categoryDefs[category]?.referenceFields.find(r => r.field === field) : undefined;
    if (refField) return { kind: 'reference', category, field, targetCategory: refField.targetCategory };

    if (!pluginRest) return { kind: 'value', category, schemaPath: entryPath, siblings };
    // pluginRest[0] = plugin name, the rest is the path inside its schema (including the key).
    if (pluginRest.length < 2) return { kind: 'unknown' };
    return { kind: 'plugin-value', category, pluginName: pluginRest[0], schemaPath: pluginRest.slice(1), siblings };
}
