import { CATEGORY_KEY_MAP } from '../yamlLineUtils';

// Computed once per completion request; every consumer (CursorContext, CandidateResolver)
// reads from this instead of re-deriving its own slice of cursor state.
export interface CursorLocation {
    readonly indent: number;
    readonly category: string | undefined;
    readonly schemaPath: string[];
    readonly existingKeys: Set<string>;
    readonly markerIndent: number | null;
    readonly isEntryMarkerLine: boolean;
    readonly isUnderIndentedField: boolean;
    readonly valuePositionKey: string | null;
}

// Splits text once and threads the lines through every helper below, so no helper needs
// its own text.split('\n'). Returns null if the cursor's line is out of range.
export function buildCursorLocation(text: string, line: number, column?: number): CursorLocation | null {
    const lines = text.split('\n');
    const lineIdx = line - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) return null;

    const indent = getEffectiveIndent(lines, lineIdx, column);
    const category = indent === 0 ? undefined : findCategoryFromLines(lines, lineIdx);
    const isEntryMarkerLine = isListMarkerLine(lines[lineIdx].trim());

    const entry = walkEntryStructure(lines, lineIdx, column);
    const markerIndent = isEntryMarkerLine ? getIndent(lines[lineIdx]) : entry.markerIndent;
    const schemaPath = appendFlowParentKey(entry.path, lines[lineIdx], column);

    return {
        indent,
        category,
        schemaPath,
        existingKeys: getExistingKeys(lines, lineIdx, indent, isEntryMarkerLine, column),
        markerIndent,
        isEntryMarkerLine,
        isUnderIndentedField: !isEntryMarkerLine && markerIndent === indent,
        valuePositionKey: column !== undefined ? getValuePositionKey(lines[lineIdx] ?? '', column) : null,
    };
}

// Low-level line helpers

function getIndent(line: string): number {
    return line.length - line.trimStart().length;
}

// A bare "-" counts as a marker too, for a cursor sitting right after typing it but before the space.
function isListMarkerLine(trimmed: string): boolean {
    return trimmed === '-' || trimmed.startsWith('- ');
}

function isBlankOrComment(trimmed: string): boolean {
    return trimmed === '' || trimmed.startsWith('#');
}

// A blank line has no real indent to read, so it has to be inferred: whitespace already typed
// on the line wins, then the cursor's column (0 chars typed = 0 indent), then neighboring
// lines as a last resort. Falls back to 2 for an empty section (e.g. cursor right after "routes:").
function getEffectiveIndent(lines: string[], lineIdx: number, column?: number): number {
    const raw = lines[lineIdx] ?? '';
    if (raw.trim() !== '') return getIndent(raw);
    if (raw.length > 0) return raw.length;
    if (column !== undefined) return column - 1;

    for (let i = lineIdx + 1; i < lines.length; i++) {
        if (lines[i].trim()) return getIndent(lines[i]);
    }
    for (let i = lineIdx - 1; i >= 0; i--) {
        if (!lines[i].trim()) continue;
        const behind = getIndent(lines[i]);
        if (behind === 0) break; // a section header's indent isn't ours to inherit
        return behind;
    }
    return 2;
}

// Category (which APISIX section - routes, upstreams, ... - the cursor is inside)

// Category isn't tracked anywhere, so it's inferred from the nearest indent-0 section
// header (e.g. "routes:") found by scanning upward.
function findCategoryFromLines(lines: string[], lineIdx: number): string | undefined {
    for (let i = lineIdx; i >= 0; i--) {
        const raw = lines[i] ?? '';
        if (raw.trim() === '') continue;
        if (getIndent(raw) > 0) continue;
        const colonIdx = raw.indexOf(':');
        if (colonIdx > 0) return CATEGORY_KEY_MAP[raw.substring(0, colonIdx).trim()];
        return undefined;
    }
    return undefined;
}

// Schema path + entry marker (walking up from the cursor to its entry root)

interface EntryWalk {
    path: string[];
    markerIndent: number | null;
}

// Parent keys aren't tracked as the file is edited, so the schema path is rebuilt each time
// by walking upward from the cursor to the entry's marker line.
function walkEntryStructure(lines: string[], lineIdx: number, column?: number): EntryWalk {
    const path: string[] = [];
    let currentIndent = getEffectiveIndent(lines, lineIdx, column);
    if (currentIndent === 0) return { path, markerIndent: null };

    for (let i = lineIdx - 1; i >= 0; i--) {
        const raw = lines[i];
        const trimmed = raw.trim();
        if (isBlankOrComment(trimmed)) continue;

        const indent = getIndent(raw);
        const isMarker = isListMarkerLine(trimmed);

        if (indent >= currentIndent) {
            // Same-indent marker is the start of the entry itself.
            if (indent === currentIndent && isMarker) return { path, markerIndent: indent };
            continue;
        }

        // A marker at a shallower indent is the entry root.
        if (isMarker) return { path, markerIndent: indent };

        // Indent 0 is a section header (routes:, upstreams:, ...) - nothing to find above it.
        if (indent === 0) return { path, markerIndent: null };

        const colonIdx = trimmed.indexOf(':');
        if (colonIdx > 0) {
            const key = trimmed.substring(0, colonIdx).trim();
            if (key) {
                path.unshift(key);
                currentIndent = indent;
            }
        }
    }

    return { path, markerIndent: null };
}

// Tracks brace depth backward from col to find the flow mapping the cursor sits inside, if any.
function findFlowOpenBrace(line: string, col: number): number {
    let depth = 0;
    let openBracePos = -1;
    for (let i = 0; i < col; i++) {
        if (line[i] === '{') {
            if (depth === 0) openBracePos = i;
            depth++;
        } else if (line[i] === '}') {
            depth--;
            if (depth === 0) openBracePos = -1;
        }
    }
    return depth > 0 ? openBracePos : -1;
}

// The opening "{" alone doesn't say which field it belongs to - the schema path also needs
// the owning key (e.g. "timeout" in "timeout: {connect: |}").
function getFlowParentKey(line: string, col: number): string | null {
    const openBracePos = findFlowOpenBrace(line, col);
    if (openBracePos === -1) return null;
    const beforeBrace = line.substring(0, openBracePos).trimEnd();
    if (!beforeBrace.endsWith(':')) return null;
    return beforeBrace.slice(0, -1).trimEnd().replace(/^\s*(?:-\s+)?/, '') || null;
}

// walkEntryStructure only sees block-style YAML, so a flow mapping's parent key has to be
// appended separately here.
function appendFlowParentKey(path: string[], lineText: string, column: number | undefined): string[] {
    if (column === undefined) return path;
    const flowKey = getFlowParentKey(lineText, column - 1);
    return flowKey ? [...path, flowKey] : path;
}

// Sibling keys (what's already used in the cursor's current mapping)

// collectKeysAbove/Below only see block-style YAML, so a flow object's own siblings have to
// be parsed directly from the text before the cursor. Returns null outside a flow object.
function getFlowSiblingKeys(line: string, col: number): Set<string> | null {
    const openBracePos = findFlowOpenBrace(line, col);
    if (openBracePos === -1) return null;

    const content = line.substring(openBracePos + 1, col);
    const keys = new Set<string>();
    for (const part of content.split(',')) {
        const c = part.indexOf(':');
        if (c > 0) {
            const k = part.substring(0, c).trim();
            if (k) keys.add(k);
        }
    }
    return keys;
}

// Stops at the entry's own marker line rather than scanning the whole file, so a previous
// entry's keys are never picked up as siblings.
function collectKeysAbove(lines: string[], lineIdx: number, targetIndent: number, cursorIsMarker: boolean): Set<string> {
    const keys = new Set<string>();

    for (let i = lineIdx - 1; i >= 0; i--) {
        const raw = lines[i];
        const trimmed = raw.trim();
        if (isBlankOrComment(trimmed)) continue;

        const indent = getIndent(raw);
        const isMarker = isListMarkerLine(trimmed);

        // A same-indent marker only means "different entry" when the cursor is itself a fresh
        // marker line - otherwise it's the cursor's own entry, just under-indented.
        if (indent < targetIndent || (indent === targetIndent && isMarker && !cursorIsMarker)) {
            if (trimmed.startsWith('- ')) {
                const rest = trimmed.slice(2).trim();
                const c = rest.indexOf(':');
                if (c > 0) keys.add(rest.substring(0, c).trim());
            }
            break;
        }
        if (indent > targetIndent) continue;

        // A marker here belongs to a different array entry - its keys don't apply.
        if (isMarker) break;

        const c = trimmed.indexOf(':');
        if (c > 0) keys.add(trimmed.substring(0, c).trim());
    }

    return keys;
}

// Downward counterpart to collectKeysAbove - here a same-indent marker always starts a new
// entry, so it ends the scan unconditionally.
function collectKeysBelow(lines: string[], lineIdx: number, targetIndent: number): Set<string> {
    const keys = new Set<string>();

    for (let i = lineIdx + 1; i < lines.length; i++) {
        const raw = lines[i];
        const trimmed = raw.trim();
        if (isBlankOrComment(trimmed)) continue;

        const indent = getIndent(raw);
        if (indent < targetIndent) break;
        if (indent > targetIndent) continue;
        if (isListMarkerLine(trimmed)) break;

        const c = trimmed.indexOf(':');
        if (c > 0) keys.add(trimmed.substring(0, c).trim());
    }

    return keys;
}

function getExistingKeys(
    lines: string[],
    lineIdx: number,
    indent: number,
    isEntryMarkerLine: boolean,
    column: number | undefined,
): Set<string> {
    if (column !== undefined) {
        const flowKeys = getFlowSiblingKeys(lines[lineIdx], column - 1);
        if (flowKeys) return flowKeys;
    }
    if (indent === 0) return new Set();

    const above = collectKeysAbove(lines, lineIdx, indent, isEntryMarkerLine);
    const below = collectKeysBelow(lines, lineIdx, indent);
    return new Set([...above, ...below]);
}

// Value position (is the cursor right after "key: ")

// Detects "key: " (or "key:" with trailing space) immediately before the cursor, so completions
// can offer values instead of keys right after the colon.
function getValuePositionKey(lineText: string, column: number): string | null {
    const textUpToCursor = lineText.substring(0, column - 1);
    if (!textUpToCursor.includes(': ')) return null;
    const match = textUpToCursor.match(/(?:^|[{,\s])([a-zA-Z_][a-zA-Z0-9_-]*):\s*$/);
    return match ? match[1] : null;
}
