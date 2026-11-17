import type { ApisixConfig, JsonSchema, SchemaCatalog } from '../../../../actions/SchemaValidation';
import { CATEGORY_DEFINITIONS, getCategoryEntries, getDisplayId, isEntry } from '../../../../config/categoryDefinitions';
import { LIST_ITEM, type CursorContext, type Siblings } from './CursorContext';

export interface Candidate {
    label: string;
    insertText: string;
    schemaType?: string;
    description?: string;
    isString?: boolean;
}

// Follows a $ref pointer to its target in the definitions map.
function resolveRef(schema: JsonSchema, defs: Record<string, JsonSchema>): JsonSchema {
    const ref = schema.$ref;
    if (typeof ref === 'string' && ref.startsWith('#/definitions/')) return defs[ref.slice('#/definitions/'.length)] ?? schema;
    return schema;
}

// A discriminator condition from "if.properties.<field>" (const or enum), compared
// as strings against sibling text.
interface IfCondition {
    field: string;
    values: string[];
}

type MatchResult = 'match' | 'no-match' | 'vacuous';

function parseIfConditions(ifSchema: Record<string, unknown>): IfCondition[] {
    const properties = ifSchema.properties as Record<string, unknown> | undefined;
    if (!properties) return [];

    const conditions: IfCondition[] = [];
    for (const [field, constraint] of Object.entries(properties)) {
        if (!constraint || typeof constraint !== 'object') continue;
        const c = constraint as Record<string, unknown>;
        if ('const' in c) {
            conditions.push({ field, values: [String(c.const)] });
        } else if (Array.isArray(c.enum)) {
            conditions.push({ field, values: c.enum.map(String) });
        }
    }
    return conditions;
}

// "vacuous" means the discriminator hasn't been typed yet - callers merge both branches
// then to avoid hiding valid fields.
function evaluateIfCondition(conditions: IfCondition[], siblingValues: Map<string, string>): MatchResult {
    if (conditions.length === 0) return 'vacuous';

    let allVacuous = true;
    for (const condition of conditions) {
        const value = siblingValues.get(condition.field);
        // An empty value means "key: " has been typed but not its value yet - treat that the
        // same as not-typed-at-all rather than as a (never-matching) real value.
        if (value === undefined || value === '') continue;

        allVacuous = false;
        if (!condition.values.includes(value)) return 'no-match';
    }

    return allVacuous ? 'vacuous' : 'match';
}

// Merges a schema's own properties with any nested inside if/then/else/allOf branches
// (e.g. limit-count's redis_host lives under a "then" for policy === "redis"), filtered
// to whichever branch matches siblingValues once the discriminator's been typed. Own
// properties win on collisions.
function resolveProperties(
    schema: JsonSchema,
    defs: Record<string, JsonSchema>,
    siblingValues: Map<string, string>,
): Record<string, JsonSchema> {
    const conditional = collectConditionalProperties(schema, defs, siblingValues);
    const own = schema.properties as Record<string, JsonSchema> | undefined;
    return { ...conditional, ...own };
}

function collectConditionalProperties(
    schema: JsonSchema,
    defs: Record<string, JsonSchema>,
    siblingValues: Map<string, string>,
): Record<string, JsonSchema> {
    const collected: Record<string, JsonSchema> = {};

    const ifSchema = schema.if as Record<string, unknown> | undefined;
    const matchResult = ifSchema ? evaluateIfCondition(parseIfConditions(ifSchema), siblingValues) : 'vacuous';

    const branches = [
        ...(matchResult !== 'no-match' ? [schema.then] : []),
        ...(matchResult !== 'match' ? [schema.else] : []),
        ...(Array.isArray(schema.allOf) ? schema.allOf as unknown[] : []),
    ];

    for (const branch of branches) {
        if (!branch || typeof branch !== 'object') continue;
        const branchSchema = resolveRef(branch as JsonSchema, defs);
        const branchProps = branchSchema.properties as Record<string, JsonSchema> | undefined;
        Object.assign(collected, branchProps);
        // then/else can nest their own if/then/else, so recurse.
        Object.assign(collected, collectConditionalProperties(branchSchema, defs, siblingValues));
    }

    return collected;
}

// The schema of one list item. Also looks through anyOf/oneOf, since e.g. upstream "nodes"
// is either a host map or an array of node objects.
function listItemSchema(schema: JsonSchema, defs: Record<string, JsonSchema>): JsonSchema | null {
    const { items, anyOf, oneOf } = schema;
    if (items && typeof items === 'object' && !Array.isArray(items)) {
        return resolveRef(items as JsonSchema, defs);
    }
    const variants = [...(Array.isArray(anyOf) ? anyOf : []), ...(Array.isArray(oneOf) ? oneOf : [])];
    for (const variant of variants as JsonSchema[]) {
        const items = listItemSchema(resolveRef(variant, defs), defs);
        if (items) return items;
    }
    return null;
}

// Walks a JSON Schema along a property path, resolving $refs at each step.
// Returns null if any step in the path is missing.
function walkSchemaToPath(
    schema: JsonSchema,
    path: string[],
    defs: Record<string, JsonSchema>,
    siblingValues: Map<string, string>,
): JsonSchema | null {
    let current = resolveRef(schema, defs);
    for (const key of path) {
        if (key === LIST_ITEM) {
            const items = listItemSchema(current, defs);
            if (!items) return null;
            current = items;
            continue;
        }
        const props = resolveProperties(current, defs, siblingValues);
        if (!(key in props)) return null;
        current = resolveRef(props[key], defs);
    }
    return current;
}

// Builds key candidates from the schema at the given path, filtering already-present keys.
// Object-type fields (e.g. "nodes", "plugins") insert a newline + child indent so the cursor
// lands ready to type the first nested key, instead of just "key: ".
function keyCandidates(
    rootSchema: JsonSchema,
    path: string[],
    defs: Record<string, JsonSchema>,
    siblings: Siblings,
    onListMarker: boolean,
): Candidate[] {
    const targetSchema = walkSchemaToPath(rootSchema, path, defs, siblings);
    if (!targetSchema) return [];

    // Monaco turns "\t" into one indent unit on top of the line's own indent; on a "- key"
    // line the key itself sits past the "- " as well.
    const childIndent = onListMarker ? '\t  ' : '\t';

    return Object.entries(resolveProperties(targetSchema, defs, siblings))
        .filter(([key]) => !siblings.has(key))
        .map(([key, propSchema]) => {
            const resolved = resolveRef(propSchema, defs);
            const schemaType = (resolved as { type?: string }).type;
            const description = (resolved as { description?: string }).description;
            const insertText = schemaType === 'object'
                ? `${key}:\n${childIndent}`
                : `${key}: `;
            return { label: key, insertText, schemaType, description };
        });
}

// Builds value candidates from a schema node - enum values or true/false for booleans.
function valueCandidates(
    valueSchema: JsonSchema,
    defs: Record<string, JsonSchema>,
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
    for (const entry of getCategoryEntries(config, targetCategory)) {
        if (!isEntry(entry)) continue;

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
): JsonSchema | null {
    const entry = ((catalog.plugins ?? {})[pluginName] ?? {}) as Record<string, unknown>;
    const schema = (category === 'consumer' ? entry['consumer_schema'] : null) ?? entry['schema'];
    return schema ? (schema as JsonSchema) : null;
}

/**
 * Resolves the entries that will be suggested in the auto complete based on the decided context (is decided in CursorContext.ts)
 */
export function resolveCandidates(
    context: CursorContext,
    catalog: SchemaCatalog,
    config: ApisixConfig | null | undefined,
): Candidate[] {
    const defs = catalog.main as Record<string, JsonSchema>;

    switch (context.kind) {
        case 'unknown':
            return [];

        case 'category':
            return Object.keys(CATEGORY_DEFINITIONS)
                .filter(name => (config as Record<string, unknown> | undefined)?.[`${name}s`] === undefined)
                .map(name => ({
                    label: `${name}s`,
                    // "\t" becomes one indent unit, whatever width the editor uses.
                    insertText: `${name}s:\n\t- `,
                    schemaType: 'array',
                }));

        case 'key':
        case 'plugin-key':
        case 'value':
        case 'plugin-value': {
            const root = 'pluginName' in context ? getPluginSchema(catalog, context.pluginName, context.category) : defs[context.category];
            if (!root) return [];

            if (context.kind === 'key' || context.kind === 'plugin-key') {
                return keyCandidates(root, context.schemaPath, defs, context.siblings, context.onListMarker);
            }
            const valueSchema = walkSchemaToPath(root, context.schemaPath, defs, context.siblings);
            return valueSchema ? valueCandidates(valueSchema, defs) : [];
        }

        case 'plugin-name':
            return Object.keys(catalog.plugins ?? {})
                .filter(name => !context.siblings.has(name))
                .map(name => ({
                    label: name,
                    insertText: `${name}: `,
                    schemaType: 'plugin',
                }));

        case 'reference':
            if (!config) return [];

            return referenceCandidates(context.targetCategory, config);
    }
}
