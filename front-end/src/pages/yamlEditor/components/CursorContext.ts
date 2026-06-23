import type { CategoryDefinition } from '../../../config/categoryDefinitions';
import { getSchemaPathAtCursor, getSiblingKeysAtCursor } from '../yamlLineUtils';

export type CursorContext =
    | { kind: 'category' }
    | { kind: 'key';          category: string; path: string[];     existingKeys: Set<string> }
    | { kind: 'value';        category: string; schemaPath: string[] }
    | { kind: 'plugin-name';  category: string; existingKeys: Set<string> }
    | { kind: 'plugin-key';   category: string; pluginName: string; path: string[]; existingKeys: Set<string> }
    | { kind: 'plugin-value'; category: string; pluginName: string; schemaPath: string[]   }
    | { kind: 'reference';    category: string; field: string;      targetCategory: string }
    | { kind: 'unknown' }

/**
 * Determines the completion context at the given cursor position.
 * Returns one of the defined context types defined above in `CursorContext`
 *
 * @param text             - full YAML document text
 * @param line             - 1-indexed cursor line (Monaco convention)
 * @param column           - 1-indexed cursor column (Monaco convention)
 * @param categoryLineMap  - maps each line number to its APISIX category
 * @param categoryDefs     - category definition map (used for reference field lookup)
 */
export function resolveCursorContext(
    text: string,
    line: number,
    column: number,
    categoryLineMap: Map<number, string>,
    categoryDefs: Record<string, CategoryDefinition>,
): CursorContext {
    // Split the full document into single lines so we can inspect the cursor's line.
    const lines = text.split('\n');
    // Get the text of the cursor's line (line is 1-indexed, so subtract 1 for the array).
    const lineText = lines[line - 1] ?? '';

    const category = categoryLineMap.get(line);
    if (!category) {
        // At the root level (no indentation) suggest category keys like "routes:", "upstreams:", etc.
        const indent = lineText.length - lineText.trimStart().length;
        if (indent === 0) return { kind: 'category' };
        return { kind: 'unknown' };
    }

    const path = getSchemaPathAtCursor(text, line, column);
    const existingKeys = getSiblingKeysAtCursor(text, line, column);
    // Only look at the text before the cursor, everything after is irrelevant for context detection
    const textUpToCursor = lineText.substring(0, column - 1);
    // If the text before the cursor contains ": ", the cursor is on the value side of a key-value pair
    const isValuePosition = textUpToCursor.includes(': ');
    // Find which key the cursor is typing a value for (e.g. "method: " -> "method").
    // The regex also matches keys inside objects like {key: value}.
    const lastKeyMatch = textUpToCursor.match(/(?:^|[{,\s])([a-zA-Z_][a-zA-Z0-9_-]*):\s*$/);
    const currentLineKey = lastKeyMatch ? lastKeyMatch[1] : null;

    // Value completion
    if (isValuePosition && currentLineKey) {
        // Reference field: suggest IDs from the foreign-key target category.
        const refField = categoryDefs[category]?.referenceFields.find(r => r.field === currentLineKey);
        if (refField) {
            return { kind: 'reference', category, field: currentLineKey, targetCategory: refField.targetCategory };
        }

        // Plugin value: cursor is after "key: " somewhere inside a plugins block.
        const valuePath = [...path, currentLineKey];
        const pluginsIdx = valuePath.indexOf('plugins');
        if (pluginsIdx !== -1) {
            const subPath = valuePath.slice(pluginsIdx + 1);
            // subPath[0] = plugin name, subPath[1+] = path within plugin schema (including key)
            if (subPath.length >= 2) {
                return { kind: 'plugin-value', category, pluginName: subPath[0], schemaPath: subPath.slice(1) };
            }
            return { kind: 'unknown' };
        }

        return { kind: 'value', category, schemaPath: valuePath };
    }

    // Key completion: suggest property names from the schema.
    const pluginsIdx = path.indexOf('plugins');
    if (pluginsIdx !== -1) {
        const subPath = path.slice(pluginsIdx + 1);
        if (subPath.length === 0) {
            return { kind: 'plugin-name', category, existingKeys };
        }
        // subPath[0] = plugin name, subPath[1+] = nested path within plugin schema
        return { kind: 'plugin-key', category, pluginName: subPath[0], path: subPath.slice(1), existingKeys };
    }

    return { kind: 'key', category, path, existingKeys };
}
