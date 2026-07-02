import {Document, LineCounter, parseDocument, type Node, isMap} from 'yaml';

export type SegmentType = 'normal' | 'whitespace' | 'comment' | 'placeholder' | 'key';

// Finds the first # in a line that is not inside quotes.
function findCommentStart(line: string): number {
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === "'" && !inDouble) {
            inSingle = !inSingle;
        } else if (c === '"' && !inSingle) {
            inDouble = !inDouble;
        } else if (c === '#' && !inSingle && !inDouble) {
            return i;
        }
    }
    return -1;
}

// Returns the start/end positions of the key in a YAML line, or null if there is no key-value pair.
function findYamlKey(line: string, commentIdx: number): { start: number; end: number } | null {
    let pos = 0;

    // Skip leading spaces
    while (pos < line.length && line[pos] === ' ') {
        pos++;
    }

    // Skip list item marker "- " if present
    if (line[pos] === '-' && (pos + 1 >= line.length || line[pos + 1] === ' ')) {
        pos += 2;
        while (pos < line.length && line[pos] === ' ') {
            pos++;
        }
    }

    const keyStart = pos;
    let inSingleQuotes = false;
    let inDoubleQuotes = false;

    // The search should stop at a comment.
    const searchEnd = commentIdx !== -1 ? commentIdx : line.length;

    while (pos < searchEnd) {
        const char = line[pos];

        // checked separately since a single quote can't close a double quote, and vice versa
        if (char === "'" && !inDoubleQuotes) {
            inSingleQuotes = !inSingleQuotes;
            pos++;
            continue;
        }

        if (char === '"' && !inSingleQuotes) {
            inDoubleQuotes = !inDoubleQuotes;
            pos++;
            continue;
        }

        // A colon is a key-value separator if it's at the end of the line (or before a comment)
        // or followed by a space.
        if (char === ':' && !inSingleQuotes && !inDoubleQuotes) {
            const nextChar = line[pos + 1];
            if (pos + 1 >= searchEnd || nextChar === ' ' || nextChar === '\t') {
                return { start: keyStart, end: pos };
            }
        }
        pos++;
    }

    return null;
}

// Returns the end index (exclusive) of a ${{...}} placeholder starting at pos, or -1 if unclosed.
function findPlaceholderEnd(line: string, pos: number): number {
    let end = pos + 3; // skip past ${{
    while (end < line.length) {
        if (line[end] === '}' && line[end + 1] === '}') return end + 2;
        end++;
    }
    return -1;
}

// Returns the visible character to use for a whitespace marker at the given position.
function getWhitespaceMarker(pos: number, isLeading: boolean): string {
    if (!isLeading) return '·';
    return pos % 2 === 0 ? '·' : '│';
}

// Splits a YAML line into typed segments for syntax coloring.
// Pass showWhitespace=true to replace spaces with visible markers.
export function buildLineSegments(line: string, showWhitespace: boolean): { text: string; type: SegmentType }[] {
    const commentIdx = findCommentStart(line);
    const leadingSpaces = line.match(/^ */)?.[0].length ?? 0;
    // comment index blocks the labeling if set/found
    const yamlKey = findYamlKey(line, commentIdx);
    const segments: { text: string; type: SegmentType }[] = [];
    let pastKey = false;

    const push = (char: string, type: SegmentType) => {
        const last = segments[segments.length - 1];
        if (last?.type === type) {
            last.text += char;
        } else {
            segments.push({text: char, type});
        }
    };

    let i = 0;
    while (i < line.length) {
        const isComment = commentIdx !== -1 && i >= commentIdx;
        const isKeyChar = !pastKey && yamlKey !== null && i >= yamlKey.start && i <= yamlKey.end;

        // comment
        if (isComment) {
            push(line[i], 'comment');
            i++;
        // placeholder: ${{...}}
        } else if (line[i] === '$' && line[i + 1] === '{' && line[i + 2] === '{') {
            const end = findPlaceholderEnd(line, i);
            if (end !== -1) {
                segments.push({ text: line.slice(i, end), type: 'placeholder' });
                i = end;
            } else {
                push(line[i], 'normal');
                i++;
            }
        // label: the key part up to and including the colon
        } else if (isKeyChar) {
            push(line[i], 'key');
            if (i === yamlKey!.end) pastKey = true;
            i++;
        // whitespace markers
        } else if (showWhitespace && line[i] === ' ') {
            push(getWhitespaceMarker(i, i < leadingSpaces), 'whitespace');
            i++;
        // value: everything else
        } else {
            push(line[i], 'normal');
            i++;
        }
    }

    return segments;
}

export const CATEGORY_KEY_MAP: Record<string, string> = {
    routes: 'route', upstreams: 'upstream', services: 'service',
    consumers: 'consumer', global_rules: 'global_rule',
    plugin_configs: 'plugin_config', ssls: 'ssl',
};

export function buildCategoryLineMap(doc: Document, lineCounter: LineCounter): Map<number, string> {
    const lineMap = new Map<number, string>();

    const root = doc.contents;
    if (!isMap(root)) return lineMap;

    for (const pair of root.items) {
        const key = pair.key as { value?: unknown; range?: number[] } | null;
        const value = pair.value as { range?: number[] } | null;
        if (!key?.range || !value?.range) continue;

        const keyStr = String(key.value ?? '');
        const category = CATEGORY_KEY_MAP[keyStr];
        if (!category) continue;

        const startLine = lineCounter.linePos(key.range[0]).line;
        const endLine = lineCounter.linePos(value.range[1]).line;
        for (let i = startLine; i <= endLine; i++) {
            lineMap.set(i, category);
        }
    }

    return lineMap;
}

export type ParsedDoc = { doc: Document; lineCounter: LineCounter };

export function parseYamlDoc(configText: string): ParsedDoc {
    const lineCounter = new LineCounter();
    const doc = parseDocument(configText, {lineCounter});
    return {doc, lineCounter};
}

export function getLineHeight(el: HTMLElement): number {
    return parseFloat(getComputedStyle(el).lineHeight) || 21;
}

export function resolvePathToNode(doc: Document, pathStr: string): Node | null {
    const parts: (string | number)[] = pathStr.split('/').filter(Boolean).map(p => {
        const num = parseInt(p, 10);
        return isNaN(num) ? p : num;
    });

    let trimmedParts = [...parts];
    let node = doc.getIn(trimmedParts, true) as Node;
    while ((!node || !node.range) && trimmedParts.length > 0) {
        trimmedParts = trimmedParts.slice(0, -1);
        node = doc.getIn(trimmedParts, true) as Node;
    }

    return node && node.range ? node : null;
}
