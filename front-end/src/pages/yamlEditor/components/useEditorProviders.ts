import { useRef, useEffect, useCallback } from 'react';
import type { RefObject } from 'react';
import type * as MonacoType from 'monaco-editor';
import type { Document, LineCounter } from 'yaml';
import type { ApisixConfig, SchemaCatalog } from '../../../actions/SchemaValidation';
import { CATEGORY_LABEL, CATEGORY_COLOR } from '../../../config/categoryDefinitions';
import { getDisplayId } from '../actions/checkReferences';
import { YamlCompletionProvider } from './YamlCompletionProvider';
import { ProviderContext } from './ProviderContext';

type ParsedDoc = { doc: Document; lineCounter: LineCounter };

/**
 * Manages the completion, definition, and hover language provider registrations.
 * Returns `registerProviders` to be called once from `handleMount`.
 * Disposes all providers automatically on unmount.
 */
export function useEditorProviders(
    categoryLineMapRef: RefObject<Map<number, string>>,
    schemaRef: RefObject<SchemaCatalog | null | undefined>,
    configRef: RefObject<ApisixConfig | null | undefined>,
    parsedDocRef: RefObject<ParsedDoc | null>,
    referenceValueRangesRef: RefObject<Map<number, { startCol: number; endCol: number }>>,
    referenceTargetMapRef: RefObject<Map<number, string>>,
    idLineMapRef: RefObject<Map<number, { category: string; idValue: string | number }>>,
) {
    const completionProviderRef = useRef<MonacoType.IDisposable | null>(null);
    const definitionProviderRef = useRef<MonacoType.IDisposable | null>(null);
    const hoverProviderRef = useRef<MonacoType.IDisposable | null>(null);
    const referenceProviderRef = useRef<MonacoType.IDisposable | null>(null);

    // Dispose of all registered Monaco providers when the component unmounts
    useEffect(() => {
        return () => {
            completionProviderRef.current?.dispose();
            definitionProviderRef.current?.dispose();
            hoverProviderRef.current?.dispose();
            referenceProviderRef.current?.dispose();
        };
    }, []);

    const registerProviders = useCallback((monaco: typeof MonacoType) => {
        // Provides suggestions for keys and values based on the YAML schema
        completionProviderRef.current = new YamlCompletionProvider(monaco).register(
            () => categoryLineMapRef.current,
            () => schemaRef.current,
            () => configRef.current,
        );

        // Go to Definition: Allows users to Ctrl+Click on a reference (like a service_id) to jump to its declaration
        definitionProviderRef.current = monaco.languages.registerDefinitionProvider('yaml', {
            provideDefinition(model: MonacoType.editor.ITextModel, position: MonacoType.Position) {
                const line = position.lineNumber;
                const valueRange = referenceValueRangesRef.current.get(line);

                if (!valueRange || position.column < valueRange.startCol || position.column > valueRange.endCol) return null;
                const targetPath = referenceTargetMapRef.current.get(line);

                if (!targetPath) return null;
                return ProviderContext.from(configRef, parsedDocRef, monaco)?.pathToLocation(model, targetPath) ?? null;
            },
        });

        // Shows a tooltip when hovering over an ID, listing all other resources that reference it
        hoverProviderRef.current = monaco.languages.registerHoverProvider('yaml', {
            provideHover(_model: MonacoType.editor.ITextModel, position: MonacoType.Position) {
                const idInfo = idLineMapRef.current.get(position.lineNumber);
                if (!idInfo) return null;
                const ctx = ProviderContext.from(configRef, parsedDocRef, monaco);
                if (!ctx) return null;
                const usages = ctx.getUsages(idInfo.category, idInfo.idValue);
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
        });

        // Find References: Allows users to right-click an ID and "Find All References" to see where it is used
        referenceProviderRef.current = monaco.languages.registerReferenceProvider('yaml', {
            provideReferences(model: MonacoType.editor.ITextModel, position: MonacoType.Position) {
                const idInfo = idLineMapRef.current.get(position.lineNumber);
                if (!idInfo) return null;
                return ProviderContext.from(configRef, parsedDocRef, monaco)?.usageLocations(model, idInfo.category, idInfo.idValue) ?? null;
            },
        });
    }, [categoryLineMapRef, schemaRef, configRef, parsedDocRef, referenceValueRangesRef, referenceTargetMapRef, idLineMapRef]);

    return { registerProviders };
}
