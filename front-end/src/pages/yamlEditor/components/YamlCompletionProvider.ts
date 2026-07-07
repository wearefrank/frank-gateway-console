// Monaco adapter - converts candidates to CompletionItems.
// To add or change completion logic, see:
//  * CursorContext.ts     - classifies the cursor position
//  * CandidateResolver.ts - resolves candidates from the schema (no Monaco dependency)

import type * as MonacoType from 'monaco-editor';
import type { ApisixConfig, SchemaCatalog } from '../../../actions/SchemaValidation';
import { CATEGORY_DEFINITIONS } from '../../../config/categoryDefinitions';
import { resolveCursorContext, type CursorContext } from './CursorContext';
import { resolveCandidates, type Candidate } from './CandidateResolver';

export class YamlCompletionProvider {
    private readonly monaco: typeof MonacoType;

    constructor(monaco: typeof MonacoType) {
        this.monaco = monaco;
    }

    /**
     * Registers a context-aware YAML completion provider against the Monaco instance.
     * Returns a disposable that must be called when the editor is unmounted.
     *
     * @param getSchema - returns the current APISIX schema catalog
     * @param getConfig - returns the current parsed APISIX config
     */
    register(
        getSchema: () => SchemaCatalog | null | undefined,
        getConfig: () => ApisixConfig | null | undefined,
    ): MonacoType.IDisposable {
        const monaco = this.monaco;

        return monaco.languages.registerCompletionItemProvider('yaml', {
            triggerCharacters: [' ', '\n'],
            provideCompletionItems(model: MonacoType.editor.ITextModel, position: MonacoType.Position) {
                const catalog = getSchema();
                if (!catalog?.main) return { suggestions: [] };

                // Force LF - a trailing \r on an otherwise-empty line defeats the blank-line indent checks
                const context = resolveCursorContext(
                    model.getValue(monaco.editor.EndOfLinePreference.LF),
                    position.lineNumber,
                    position.column,
                    CATEGORY_DEFINITIONS,
                );

                const candidates = resolveCandidates(context, catalog, getConfig());
                if (candidates.length === 0) return { suggestions: [] };

                const word = model.getWordUntilPosition(position);
                const baseRange: MonacoType.IRange = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn,
                };
                // Extend the range leftward to cover a leading quote that may already be typed,
                // so we don't end up inserting a double quote after an existing one.
                const charBeforeWord = model.getLineContent(position.lineNumber)[word.startColumn - 2];
                const stringRange: MonacoType.IRange = charBeforeWord === '"'
                    ? { ...baseRange, startColumn: baseRange.startColumn - 1 }
                    : baseRange;

                return {
                    suggestions: candidates.map(c => toCompletionItem(c, context, monaco, baseRange, stringRange)),
                };
            },
        });
    }
}

function toCompletionItem(
    candidate: Candidate,
    context: CursorContext,
    monaco: typeof MonacoType,
    baseRange: MonacoType.IRange,
    stringRange: MonacoType.IRange,
): MonacoType.languages.CompletionItem {
    let kind: MonacoType.languages.CompletionItemKind;
    switch (context.kind) {
        case 'category':
        case 'plugin-name':
            kind = monaco.languages.CompletionItemKind.Module;
            break;
        case 'key':
        case 'plugin-key':
            kind = (candidate.schemaType === 'object' || candidate.schemaType === 'array')
                ? monaco.languages.CompletionItemKind.Module
                : monaco.languages.CompletionItemKind.Field;
            break;
        case 'value':
        case 'plugin-value':
            kind = monaco.languages.CompletionItemKind.Value;
            break;
        case 'reference':
            kind = monaco.languages.CompletionItemKind.Reference;
            break;
        default:
            kind = monaco.languages.CompletionItemKind.Text;
    }

    return {
        label: candidate.label,
        kind,
        insertText: candidate.isString ? `"${candidate.insertText}"` : candidate.insertText,
        range: candidate.isString ? stringRange : baseRange,
        detail: candidate.schemaType ?? '',
        documentation: candidate.description ?? '',
    };
}
