import type {SchemaField} from "../../actions/SchemaFormGenerator.ts";
import {SchemaFormGenerator} from "../../actions/SchemaFormGenerator.ts";
import type {JsonSchema, SchemaCatalog} from "../../actions/SchemaValidation.ts";

export function fieldMatchesSearch(field: SchemaField, term: string, value?: unknown): boolean {
    // if nothing is searched, show everything
    if (!term) return true;
    const terms = term.toLowerCase().split(/\s+/).filter(Boolean);
    return terms.some(s => fieldMatchesTerm(field, s, value));
}

function fieldMatchesTerm(field: SchemaField, s: string, value?: unknown): boolean {
    if (field.name.toLowerCase().includes(s)) return true;
    if (field.description?.toLowerCase().includes(s)) return true;

    if (field.type === 'plugin') {
        const catalog = field.schema as unknown as SchemaCatalog;
        const activePlugins = Object.keys((value as Record<string, unknown>) ?? {});
        const generator = new SchemaFormGenerator(catalog);
        return activePlugins.some(pluginName => {
            if (pluginName.toLowerCase().includes(s)) return true;
            const pluginDef = (catalog.plugins ?? {})[pluginName];
            const pluginSchema = (pluginDef?.schema ?? pluginDef) as JsonSchema;
            if (!pluginSchema || typeof pluginSchema !== 'object') return false;
            // go back to recursive calls
            return generator.getFieldsFromSchema(pluginSchema).some(f => fieldMatchesSearch(f, s));
        });
    }

    const nested = field.type === 'object' ? field.fields : [];
    // recursive call
    return nested.some(f => fieldMatchesSearch(f, s));
}