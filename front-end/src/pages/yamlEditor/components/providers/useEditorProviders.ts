import { useRef, useEffect, useCallback } from 'react';
import type { RefObject } from 'react';
import type * as MonacoType from 'monaco-editor';
import { format } from 'prettier/standalone';
import * as yamlPlugin from 'prettier/plugins/yaml';
import * as estreePlugin from 'prettier/plugins/estree';
import { parseDocument } from 'yaml';
import type { ApisixConfig, SchemaCatalog } from '../../../../actions/SchemaValidation';
import { CATEGORY_LABEL, CATEGORY_COLOR, getDisplayId } from '../../../../config/categoryDefinitions';
import { getUsages } from '../../actions/checkReferences';
import { resolvePathToNode, type ParsedDoc } from '../../yamlLineUtils';
import type { EditorAnnotations } from '../editor/configEditorAnnotations';
import { registerYamlCompletion } from './YamlCompletionProvider';

// The whole line holding the node at a JSON pointer path, as a Monaco location.
function pathToLocation(
    monaco: typeof MonacoType,
    model: MonacoType.editor.ITextModel,
    parsedDoc: ParsedDoc | null,
    path: string,
): MonacoType.languages.Location | null {
    if (!parsedDoc) return null;
    const node = resolvePathToNode(parsedDoc.doc, path);
    if (!node?.range) return null;
    const line = parsedDoc.lineCounter.linePos(node.range[0]).line;
    return { uri: model.uri, range: new monaco.Range(line, 1, line, model.getLineContent(line).length + 1) };
}

/**
 * Formats with prettier, falling back to a yaml round-trip for documents prettier's
 * parser rejects. Returns null when the document cannot be formatted at all.
 */
async function formatYaml(text: string, indentSize: number): Promise<string | null> {
    try {
        return await format(text, {
            parser: 'yaml',
            plugins: [yamlPlugin, estreePlugin],
            tabWidth: indentSize,
        });
    } catch (err) {
        console.warn('[yamlEditor] prettier could not format the document, falling back to yaml', err);
    }

    const doc = parseDocument(text);
    if (doc.errors.length > 0) {
        console.warn('[yamlEditor] document has YAML errors, not formatting:', doc.errors[0].message);
        return null;
    }
    // lineWidth 0 disables folding, which would otherwise wrap long URIs and regexes
    return doc.toString({ indent: indentSize, lineWidth: 0 });
}

/**
 * Manages the completion, definition, and hover language provider registrations.
 * Returns `registerProviders` to be called once from `handleMount`.
 * Disposes all providers automatically on unmount.
 */
export function useEditorProviders(
    schemaRef: RefObject<SchemaCatalog | null | undefined>,
    configRef: RefObject<ApisixConfig | null | undefined>,
    parsedDocRef: RefObject<ParsedDoc | null>,
    annotationsRef: RefObject<EditorAnnotations>,
) {
    const providersRef = useRef<MonacoType.IDisposable[]>([]);

    // Dispose of all registered Monaco providers when the component unmounts
    useEffect(() => {
        const providers = providersRef.current;
        return () => providers.forEach(p => p.dispose());
    }, []);

    const registerProviders = useCallback((monaco: typeof MonacoType) => {
        const providers = providersRef.current;

        // Provides suggestions for keys and values based on the YAML schema
        providers.push(registerYamlCompletion(monaco, () => schemaRef.current, () => configRef.current));

        // Go to Definition: Allows users to Ctrl+Click on a reference (like a service_id) to jump to its declaration
        providers.push(monaco.languages.registerDefinitionProvider('yaml', {
            provideDefinition(model: MonacoType.editor.ITextModel, position: MonacoType.Position) {
                const line = position.lineNumber;
                const valueRange = annotationsRef.current.referenceValueRanges.get(line);

                if (!valueRange || position.column < valueRange.startCol || position.column > valueRange.endCol) return null;
                const targetPath = annotationsRef.current.referenceTargetMap.get(line);

                if (!targetPath) return null;
                return pathToLocation(monaco, model, parsedDocRef.current, targetPath);
            },
        }));

        // Shows a tooltip when hovering over an ID, listing all other resources that reference it
        providers.push(monaco.languages.registerHoverProvider('yaml', {
            provideHover(_model: MonacoType.editor.ITextModel, position: MonacoType.Position) {
                const idInfo = annotationsRef.current.idLineMap.get(position.lineNumber);
                const config = configRef.current;
                if (!idInfo || !config) return null;
                const usages = getUsages(config, idInfo.category, idInfo.idValue);
                if (usages.length === 0) return null;
                // text selector for singular or dual
                const label = usages.length === 1 ? 'Used by 1 resource' : `Used by ${usages.length} resources`;
                const lines = usages.map(u => {
                    const catLabel = CATEGORY_LABEL[u.fromCategory] ?? u.fromCategory;
                    const catColor = CATEGORY_COLOR[u.fromCategory];
                    const displayId = getDisplayId(u.fromCategory, u.fromEntry, u.fromIndex);
                    return `<span style="color:${catColor};font-weight:600">${catLabel}</span> **"${displayId}"** via \`${u.field}\``;
                });
                return {
                    contents: [
                        { value: `**${label}**\n\n${lines.join('\n\n')}`, supportHtml: true, isTrusted: true },
                    ],
                };
            },
        }));

        // Find References: Allows users to right-click an ID and "Find All References" to see where it is used
        providers.push(monaco.languages.registerReferenceProvider('yaml', {
            provideReferences(model: MonacoType.editor.ITextModel, position: MonacoType.Position) {
                const idInfo = annotationsRef.current.idLineMap.get(position.lineNumber);
                const config = configRef.current;
                if (!idInfo || !config) return null;
                return getUsages(config, idInfo.category, idInfo.idValue)
                    .map(u => pathToLocation(monaco, model, parsedDocRef.current, `/${u.fromCategory}s/${u.fromIndex}/${u.field}`))
                    .filter((l): l is MonacoType.languages.Location => l !== null);
            },
        }));

        // Format Document: prettier, so the editor formats the same way the rest of the toolchain does.
        providers.push(monaco.languages.registerDocumentFormattingEditProvider('yaml', {
            displayName: 'yaml',
            // options.tabSize is the editor's indent setting.
            async provideDocumentFormattingEdits(model: MonacoType.editor.ITextModel, options: MonacoType.languages.FormattingOptions) {
                const text = model.getValue();
                const formatted = await formatYaml(text, options.tabSize);
                if (formatted === null || formatted === text) return [];
                return [{ range: model.getFullModelRange(), text: formatted }];
            },
        }));
    }, [schemaRef, configRef, parsedDocRef, annotationsRef]);

    return { registerProviders };
}
