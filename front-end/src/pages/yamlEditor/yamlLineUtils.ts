import {Document, LineCounter, parseDocument, type Node, isMap} from 'yaml';

export type SegmentType = 'normal' | 'whitespace' | 'comment' | 'placeholder' | 'key';

// Finds the first # in a line that is not inside quotes.
function findCommentStart(line: string): number {
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === "'" && !inDouble) inSingle = !inSingle;
        else if (c === '"' && !inSingle) inDouble = !inDouble;
        else if (c === '#' && !inSingle && !inDouble) return i;
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

        // we need both these checks as single can't close double
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

export function buildCategoryLineMap(doc: Document, lineCounter: LineCounter): Map<number, string> {
    const lineMap = new Map<number, string>();
    const categoryByKey: Record<string, string> = {
        routes: 'route', upstreams: 'upstream', services: 'service',
        consumers: 'consumer', global_rules: 'global_rule',
        plugin_configs: 'plugin_config', ssls: 'ssl',
    };

    const root = doc.contents;
    if (!isMap(root)) return lineMap;

    for (const pair of root.items) {
        const key = pair.key as { value?: unknown; range?: number[] } | null;
        const value = pair.value as { range?: number[] } | null;
        if (!key?.range || !value?.range) continue;

        const keyStr = String(key.value ?? '');
        const category = categoryByKey[keyStr];
        if (!category) continue;

        const startLine = lineCounter.linePos(key.range[0]).line;
        const endLine = lineCounter.linePos(value.range[1]).line;
        for (let i = startLine; i <= endLine; i++) {
            lineMap.set(i, category);
        }
    }

    return lineMap;
}

export function parseYamlDoc(configText: string): { doc: Document; lineCounter: LineCounter } {
    const lineCounter = new LineCounter();
    const doc = parseDocument(configText, {lineCounter});
    return {doc, lineCounter};
}

export function getLineHeight(el: HTMLElement): number {
    return parseFloat(getComputedStyle(el).lineHeight) || 21;
}

/**
 * Given the full YAML text and a 1-indexed cursor line (Monaco convention),
 * returns all keys that already exist at the same indentation level as the cursor
 * within the same parent object. Used to filter duplicate suggestions.
 */
export function getSiblingKeysAtCursor(text: string, line: number): Set<string> {
    const lines = text.split('\n');
    const lineIdx = line - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) return new Set();

    const getIndent = (s: string) => {
        let i = 0;
        while (i < s.length && s[i] === ' ') i++;
        return i;
    };

    // If the current line is blank, infer indent from the next non-blank line,
    // falling back to the previous non-blank line.
    let targetIndent = getIndent(lines[lineIdx]);
    if (lines[lineIdx].trim() === '') {
        for (let i = lineIdx + 1; i < lines.length; i++) {
            if (lines[i].trim()) { targetIndent = getIndent(lines[i]); break; }
        }
        if (targetIndent === 0) {
            for (let i = lineIdx - 1; i >= 0; i--) {
                if (lines[i].trim()) { targetIndent = getIndent(lines[i]); break; }
            }
        }
    }
    if (targetIndent === 0) return new Set();

    const keys = new Set<string>();

    for (let i = lineIdx - 1; i >= 0; i--) {
        const raw = lines[i];
        const trimmed = raw.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const indent = getIndent(raw);
        if (indent < targetIndent) {
            // The array item line may carry an inline key: "  - id: foo"
            if (trimmed.startsWith('- ')) {
                const rest = trimmed.slice(2).trim();
                const c = rest.indexOf(':');
                if (c > 0) keys.add(rest.substring(0, c).trim());
            }
            break;
        }
        if (indent > targetIndent) continue;

        const effectiveTrimmed = trimmed.startsWith('- ') ? trimmed.slice(2).trim() : trimmed;
        const c = effectiveTrimmed.indexOf(':');
        if (c > 0) keys.add(effectiveTrimmed.substring(0, c).trim());
    }

    for (let i = lineIdx + 1; i < lines.length; i++) {
        const raw = lines[i];
        const trimmed = raw.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const indent = getIndent(raw);
        if (indent < targetIndent) break;
        if (indent > targetIndent) continue;

        const c = trimmed.indexOf(':');
        if (c > 0) keys.add(trimmed.substring(0, c).trim());
    }

    return keys;
}

/**
 * Given the full YAML text and a 1-indexed cursor line (Monaco convention),
 * returns the JSON Schema property path from the entry root to the cursor.
 * E.g. if cursor is inside `timeout:` in an upstream entry, returns ["timeout"].
 * Stops at array item markers (-) which mark the entry root.
 */
export function getSchemaPathAtCursor(text: string, line: number): string[] {
    const lines = text.split('\n');
    const lineIdx = line - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) return [];

    const getIndent = (s: string) => {
        let i = 0;
        while (i < s.length && s[i] === ' ') i++;
        return i;
    };

    const path: string[] = [];
    let currentIndent = getIndent(lines[lineIdx]);

    for (let i = lineIdx - 1; i >= 0; i--) {
        const raw = lines[i];
        const trimmed = raw.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const indent = getIndent(raw);
        if (indent >= currentIndent) continue;

        // Array item marker is the entry root - stop here
        if (trimmed.startsWith('- ') || trimmed === '-') break;

        // Extract the mapping key from this parent line
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx > 0) {
            const key = trimmed.substring(0, colonIdx).trim();
            if (key) {
                path.unshift(key);
                currentIndent = indent;
            }
        }
    }

    return path;
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
