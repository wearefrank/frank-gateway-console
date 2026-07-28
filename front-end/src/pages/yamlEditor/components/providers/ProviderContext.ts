import type { RefObject } from 'react';
import type * as MonacoType from 'monaco-editor';
import type { ApisixConfig } from '../../../../actions/SchemaValidation';
import { getUsages } from '../../actions/checkReferences';
import { resolvePathToNode, type ParsedDoc } from '../../yamlLineUtils';

// Holds the validated context needed by all language providers.
// Use ProviderContext.from() to create an instance - returns null if any required
// ref is not yet populated, so providers never have to do their own null-checks.
export class ProviderContext {
    private readonly config: ApisixConfig;
    private readonly parsedDoc: ParsedDoc;
    private readonly monaco: typeof MonacoType;

    private constructor(
        config: ApisixConfig,
        parsedDoc: ParsedDoc,
        monaco: typeof MonacoType,
    ) {
        this.config = config;
        this.parsedDoc = parsedDoc;
        this.monaco = monaco;
    }

    static from(
        configRef: RefObject<ApisixConfig | null | undefined>,
        parsedDocRef: RefObject<ParsedDoc | null>,
        monaco: typeof MonacoType,
    ): ProviderContext | null {
        const config = configRef.current;
        const parsedDoc = parsedDocRef.current;
        if (!config || !parsedDoc) return null;
        return new ProviderContext(config, parsedDoc, monaco);
    }

    pathToLocation(model: MonacoType.editor.ITextModel, path: string): MonacoType.languages.Location | null {
        const node = resolvePathToNode(this.parsedDoc.doc, path);
        if (!node?.range) return null;
        const startPos = this.parsedDoc.lineCounter.linePos(node.range[0]);
        const lineLength = model.getLineContent(startPos.line).length;
        return {
            uri: model.uri,
            range: new this.monaco.Range(startPos.line, 1, startPos.line, lineLength + 1),
        };
    }

    usageLocations(model: MonacoType.editor.ITextModel, category: string, idValue: string | number): MonacoType.languages.Location[] {
        return getUsages(this.config, category, idValue)
            .map(u => this.pathToLocation(model, `/${u.fromCategory}s/${u.fromIndex}/${u.field}`))
            .filter((l): l is MonacoType.languages.Location => l !== null);
    }

    getUsages(category: string, idValue: string | number) {
        return getUsages(this.config, category, idValue);
    }
}
