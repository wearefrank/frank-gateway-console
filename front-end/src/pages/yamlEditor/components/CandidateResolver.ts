import type { JSONSchema as MonacoJsonSchema } from 'monaco-yaml';
import type { ApisixConfig, SchemaCatalog } from '../../../actions/SchemaValidation';
import { CATEGORY_DEFINITIONS, getCategoryArray, getDisplayId } from '../../../config/categoryDefinitions';
import type { CursorContext } from './CursorContext';

export interface Candidate {
    label: string;
    insertText: string;
    schemaType?: string;
    description?: string;
    isString?: boolean;
}

// Follows a $ref pointer to its target in the definitions map.
function resolveRef(schema: MonacoJsonSchema, defs: Record<string, MonacoJsonSchema>): MonacoJsonSchema {
    const ref = (schema as Record<string, unknown>)['$ref'];
    if (typeof ref !== 'string') return schema;
    if (ref.startsWith('#/definitions/')) return defs[ref.slice('#/definitions/'.length)] ?? schema;
    return schema;
}

// Walks a JSON Schema along a property path, resolving $refs at each step.
// Returns null if any step in the path is missing.
function walkSchemaToPath(
    schema: MonacoJsonSchema,
    path: string[],
    defs: Record<string, MonacoJsonSchema>,
): MonacoJsonSchema | null {
    let current = resolveRef(schema, defs);
    for (const key of path) {
        const props = (current as Record<string, unknown>).properties as Record<string, MonacoJsonSchema> | undefined;
        if (!props || !(key in props)) return null;
        current = resolveRef(props[key], defs);
    }
    return current;
}

// Builds key candidates from the schema at the given path, filtering already-present keys.
// Object-type fields (e.g. "nodes", "plugins") insert a newline + child indent so the cursor
// lands ready to type the first nested key, instead of just "key: ".
function keyCandidates(
    rootSchema: MonacoJsonSchema,
    path: string[],
    defs: Record<string, MonacoJsonSchema>,
    existingKeys: Set<string>,
    indent: number,
): Candidate[] {
    const targetSchema = walkSchemaToPath(rootSchema, path, defs);
    if (!targetSchema) return [];

    const properties = (targetSchema as Record<string, unknown>).properties as Record<string, MonacoJsonSchema> | undefined;
    if (!properties) return [];

    return Object.entries(properties)
        .filter(([key]) => !existingKeys.has(key))
        .map(([key, propSchema]) => {
            const resolved = resolveRef(propSchema as MonacoJsonSchema, defs);
            const schemaType = (resolved as { type?: string }).type;
            const description = (resolved as { description?: string }).description;
            const insertText = schemaType === 'object'
                ? `${key}:\n${' '.repeat(indent)}`
                : `${key}: `;
            return { label: key, insertText, schemaType, description };
        });
}

// Builds value candidates from a schema node - enum values or true/false for booleans.
function valueCandidates(
    valueSchema: MonacoJsonSchema,
    defs: Record<string, MonacoJsonSchema>,
): Candidate[] {
    const resolved = resolveRef(valueSchema, defs);
    const schemaType = (resolved as { type?: string }).type;
    const enumValues = (resolved as { enum?: unknown[] }).enum;

    if (enumValues) {
        return enumValues.map(v => ({
            label: String(v),
            insertText: String(v),
            schemaType,
            isString: typeof v === 'string',
        }));
    }

    if (schemaType === 'boolean') {
        return [
            { label: 'true',  insertText: 'true',  schemaType: 'boolean' },
            { label: 'false', insertText: 'false', schemaType: 'boolean' },
        ];
    }

    return [];
}

// Builds reference candidates by looking up existing entries in the target category.
function referenceCandidates(
    targetCategory: string,
    config: ApisixConfig,
): Candidate[] {
    const targetDef = CATEGORY_DEFINITIONS[targetCategory];
    const idField = targetDef?.idField ?? 'id';
    const categoryLabel = targetDef?.label ?? targetCategory;

    const candidates: Candidate[] = [];
    for (const entry of getCategoryArray(config, targetCategory)) {
        if (!entry || typeof entry !== 'object') continue;

        const id = entry[idField];
        if (id === undefined || id === null || String(id).trim() === '') continue;

        const idStr = String(id);
        const displayId = getDisplayId(targetCategory, entry);

        candidates.push({
            label: idStr,
            insertText: idStr,
            schemaType: categoryLabel,
            description: displayId !== idStr ? displayId : undefined,
            isString: typeof id === 'string',
        });
    }
    return candidates;
}

// Resolves the JSON Schema for a plugin, using consumer_schema when in a consumer context.
function getPluginSchema(
    catalog: SchemaCatalog,
    pluginName: string,
    category: string,
): MonacoJsonSchema | null {
    const entry = ((catalog.plugins ?? {})[pluginName] ?? {}) as Record<string, unknown>;
    const schema = (category === 'consumer' ? entry['consumer_schema'] : null) ?? entry['schema'];
    return schema ? (schema as MonacoJsonSchema) : null;
}

/**
 * Resolves the entries that will be suggested in the auto complete based on the decided context (is decided in CursorContext.ts)
 */
export function resolveCandidates(
    context: CursorContext,
    catalog: SchemaCatalog,
    config: ApisixConfig | null | undefined,
): Candidate[] {
    const defs = catalog.main as Record<string, MonacoJsonSchema>;

    switch (context.kind) {
        case 'unknown':
            return [];

        case 'category':
            return Object.keys(CATEGORY_DEFINITIONS)
                .filter(name => (config as Record<string, unknown> | undefined)?.[`${name}s`] === undefined)
                .map(name => ({
                    label: `${name}s`,
                    insertText: `${name}s:\n  - `,
                    schemaType: 'array',
                }));

        case 'key': {
            const categorySchema = defs[context.category];
            if (!categorySchema) return [];

            return keyCandidates(categorySchema, context.location.schemaPath, defs, context.location.existingKeys, context.location.indent);
        }

        case 'value': {
            const categorySchema = defs[context.category];
            if (!categorySchema) return [];

            const valueSchema = walkSchemaToPath(categorySchema, context.schemaPath, defs);
            if (!valueSchema) return [];

            return valueCandidates(valueSchema, defs);
        }

        case 'plugin-name':
            return Object.keys(catalog.plugins ?? {})
                .filter(name => !context.location.existingKeys.has(name))
                .map(name => ({
                    label: name,
                    insertText: `${name}: `,
                    schemaType: 'plugin',
                }));

        case 'plugin-key': {
            const ps = getPluginSchema(catalog, context.pluginName, context.category);
            if (!ps) return [];

            return keyCandidates(ps, context.location.schemaPath, defs, context.location.existingKeys, context.location.indent);
        }

        case 'plugin-value': {
            const ps = getPluginSchema(catalog, context.pluginName, context.category);
            if (!ps) return [];

            const valueSchema = walkSchemaToPath(ps, context.schemaPath, defs);
            if (!valueSchema) return [];

            return valueCandidates(valueSchema, defs);
        }

        case 'reference':
            if (!config) return [];

            return referenceCandidates(context.targetCategory, config);
    }
}
