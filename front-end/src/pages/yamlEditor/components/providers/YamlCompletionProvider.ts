// Monaco adapter - converts candidates to CompletionItems.
// To add or change completion logic, see:
//  * CursorContext.ts     - classifies the cursor position
//  * CandidateResolver.ts - resolves candidates from the schema (no Monaco dependency)

import type * as MonacoType from 'monaco-editor';
import type { ApisixConfig, SchemaCatalog } from '../../../../actions/SchemaValidation';
import { CATEGORY_DEFINITIONS } from '../../../../config/categoryDefinitions';
import { resolveCursorContext, type CursorContext } from './CursorContext';
import { resolveCandidates, type Candidate } from './CandidateResolver';

/**
 * Registers a context-aware YAML completion provider against the Monaco instance.
 * Returns a disposable that must be called when the editor is unmounted.
 *
 * @param getSchema - returns the current APISIX schema catalog
 * @param getConfig - returns the current parsed APISIX config
 */
export function registerYamlCompletion(
    monaco: typeof MonacoType,
    getSchema: () => SchemaCatalog | null | undefined,
    getConfig: () => ApisixConfig | null | undefined,
): MonacoType.IDisposable {
    return monaco.languages.registerCompletionItemProvider('yaml', {
        triggerCharacters: [' '],
        provideCompletionItems(
            model: MonacoType.editor.ITextModel,
            position: MonacoType.Position,
            completionContext: MonacoType.languages.CompletionContext,
        ) {
            const catalog = getSchema();
            if (!catalog?.main) return { suggestions: [] };

            // On a blank line only suggest when explicitly invoked (Ctrl+Space), not while indenting.
            const textBeforeCursor = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
            const isExplicitInvoke = completionContext.triggerKind === monaco.languages.CompletionTriggerKind.Invoke;
            if (!isExplicitInvoke && textBeforeCursor.trim() === '') return { suggestions: [] };

            // Only suggest at the end of a word - mid-word would splice text ahead of the rest.
            const wordAtPosition = model.getWordAtPosition(position);
            if (wordAtPosition && wordAtPosition.endColumn !== position.column) return { suggestions: [] };

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
            const lineText = model.getLineContent(position.lineNumber);
            const charBeforeWord = lineText[word.startColumn - 2];
            const stringRange: MonacoType.IRange = charBeforeWord === '"'
                ? { ...baseRange, startColumn: baseRange.startColumn - 1 }
                : baseRange;
            // Right after a bare "-" the space is still missing, so "-key:" would not be a list item.
            const prefix = /^\s*-$/.test(lineText.slice(0, word.startColumn - 1)) ? ' ' : '';

            return {
                suggestions: candidates.map(c => toCompletionItem(c, context, monaco, baseRange, stringRange, prefix)),
            };
        },
    });
}

function toCompletionItem(
    candidate: Candidate,
    context: CursorContext,
    monaco: typeof MonacoType,
    baseRange: MonacoType.IRange,
    stringRange: MonacoType.IRange,
    prefix: string,
): MonacoType.languages.CompletionItem {
    const Kind = monaco.languages.CompletionItemKind;
    const isContainerKey = candidate.schemaType === 'object' || candidate.schemaType === 'array';
    const kindByContext: Record<CursorContext['kind'], MonacoType.languages.CompletionItemKind> = {
        'category': Kind.Module,
        'plugin-name': Kind.Module,
        'key': isContainerKey ? Kind.Module : Kind.Field,
        'plugin-key': isContainerKey ? Kind.Module : Kind.Field,
        'value': Kind.Value,
        'plugin-value': Kind.Value,
        'reference': Kind.Reference,
        'unknown': Kind.Text,
    };

    return {
        label: candidate.label,
        kind: kindByContext[context.kind],
        insertText: prefix + (candidate.isString ? `"${candidate.insertText}"` : candidate.insertText),
        range: candidate.isString ? stringRange : baseRange,
        detail: candidate.schemaType ?? '',
        documentation: candidate.description ?? '',
    };
}
