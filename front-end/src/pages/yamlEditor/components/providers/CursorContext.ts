import type { CategoryDefinition } from '../../../../config/categoryDefinitions';
import { buildCursorLocation, type CursorLocation } from './CursorLocation';

export type CursorContext =
    | { kind: 'category' }
    | { kind: 'key';          category: string; location: CursorLocation }
    | { kind: 'value';        category: string; location: CursorLocation; schemaPath: string[] }
    | { kind: 'plugin-name';  category: string; location: CursorLocation }
    | { kind: 'plugin-key';   category: string; location: CursorLocation; pluginName: string; schemaPath: string[] }
    | { kind: 'plugin-value'; category: string; location: CursorLocation; pluginName: string; schemaPath: string[] }
    | { kind: 'reference';    category: string; field: string;      targetCategory: string }
    | { kind: 'unknown' }

// Splits a schema path at "plugins", returning what follows it (plugin name, then any nested
// path within that plugin's own schema), or null if the path isn't inside a plugins block.
function pluginSubPath(path: string[]): string[] | null {
    const pluginsIdx = path.indexOf('plugins');
    return pluginsIdx === -1 ? null : path.slice(pluginsIdx + 1);
}

/**
 * Determines the completion context at the given cursor position.
 * Returns one of the defined context types defined above in `CursorContext`
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
    const location = buildCursorLocation(text, line, column);

    if (!location || location.indent === 0) return { kind: 'category' };

    const category = location.category;
    if (!category) return { kind: 'category' };

    // A field sharing its entry's "- " marker column (instead of being one level deeper) is
    // under-indented - don't invite writing more invalid YAML by offering completions there.
    if (location.isUnderIndentedField) return { kind: 'unknown' };

    const currentLineKey = location.valuePositionKey;

    if (currentLineKey) {
        const refField = categoryDefs[category]?.referenceFields.find(r => r.field === currentLineKey);
        if (refField) {
            return { kind: 'reference', category, field: currentLineKey, targetCategory: refField.targetCategory };
        }

        const valuePath = [...location.schemaPath, currentLineKey];
        const pluginRest = pluginSubPath(valuePath);
        if (pluginRest) {
            // pluginRest[0] = plugin name, pluginRest[1+] = path within plugin schema (including key)
            if (pluginRest.length < 2) return { kind: 'unknown' };
            return { kind: 'plugin-value', category, location, pluginName: pluginRest[0], schemaPath: pluginRest.slice(1) };
        }

        return { kind: 'value', category, location, schemaPath: valuePath };
    }

    const pluginRest = pluginSubPath(location.schemaPath);
    if (pluginRest) {
        if (pluginRest.length === 0) return { kind: 'plugin-name', category, location };
        // pluginRest[0] = plugin name, pluginRest[1+] = nested path within plugin schema
        return { kind: 'plugin-key', category, location, pluginName: pluginRest[0], schemaPath: pluginRest.slice(1) };
    }

    return { kind: 'key', category, location };
}
