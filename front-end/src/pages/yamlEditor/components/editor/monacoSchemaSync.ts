import { type MonacoYaml, type JSONSchema as MonacoJsonSchema } from 'monaco-yaml';
import { CATEGORY_DEFINITIONS } from '../../../../config/categoryDefinitions';
import type { SchemaCatalog } from '../../../../actions/SchemaValidation';

// Schema is inlined here instead of using $ref (like SchemaValidation.ts does) because the
// monaco-yaml language service doesn't resolve $ref chains on its own. `definitions` is still
// passed through in case a future APISIX schema references one directly.
function buildApisixSchema(catalog: SchemaCatalog): MonacoJsonSchema {
    const defs = (catalog.main ?? {}) as Record<string, MonacoJsonSchema>;
    const properties: Record<string, MonacoJsonSchema> = {};
    for (const category of Object.keys(CATEGORY_DEFINITIONS)) {
        const categorySchema = defs[category];
        if (!categorySchema) continue;
        properties[`${category}s`] = { type: 'array', items: categorySchema };
    }
    return { type: 'object', properties, definitions: defs };
}

// Called both when the schema arrives before the editor mounts and when it updates later.
export function pushSchema(monacoYaml: MonacoYaml, catalog: SchemaCatalog): void {
    void monacoYaml.update({
        validate: false,
        schemas: [{ uri: 'file:///apisix-config-schema', fileMatch: ['**'], schema: buildApisixSchema(catalog) }],
    });
}
