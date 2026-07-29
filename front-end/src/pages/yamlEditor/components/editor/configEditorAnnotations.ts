import { resolvePathToNode, type ParsedDoc } from '../../yamlLineUtils';
import { CATEGORY_DEFINITIONS, getDisplayId } from '../../../../config/categoryDefinitions';
import type { ApisixConfig } from '../../../../actions/SchemaValidation';
import type { ValidationLog } from '../../../../actions/ValidationLogger';
import type { LogEntry } from './useEditorDecorations';

// Line numbers aren't resolved here - offsets are handed to Monaco's model.getPositionAt() in
// the decoration effect instead, since it converts offset-to-position natively and sidesteps
// the off-by-one bugs hand-rolled line counting tends to introduce.
export function buildErrorAnnotations(parsedDoc: ParsedDoc, validationLogs: ValidationLog[]) {
    const errorEntries: LogEntry[] = [];
    const warningEntries: LogEntry[] = [];
    const syntaxErrorOffsets: number[] = [];
    const { doc } = parsedDoc;

    for (const err of doc.errors) {
        if (err.pos && err.pos.length >= 1) {
            syntaxErrorOffsets.push(err.pos[0]);
        }
    }

    for (const log of validationLogs) {
        if ((log.type !== 'error' && log.type !== 'warning') || !log.path) continue;
        const node = resolvePathToNode(doc, log.path);
        if (!node?.range) continue;
        const list = log.type === 'error' ? errorEntries : warningEntries;
        const existing = list.find(e => e.startOffset === node.range![0] && e.endOffset === node.range![1]);
        if (existing) {
            existing.logs.push(log);
        } else {
            list.push({ startOffset: node.range[0], endOffset: node.range[1], logs: [log] });
        }
    }

    return { errorEntries, warningEntries, syntaxErrorOffsets };
}

// Finds every reference field (e.g. upstream_id on a route) that resolves to a real target
// entry and precomputes its hint text, jump target, and column range - so the decoration and
// go-to-definition providers don't each re-walk the whole config on every call.
export function buildReferenceAnnotations(parsedDoc: ParsedDoc, config: ApisixConfig) {
    const hintMap = new Map<number, string>();
    const targetMap = new Map<number, string>();
    const valueRanges = new Map<number, { startCol: number; endCol: number }>();
    const { doc, lineCounter } = parsedDoc;

    for (const [category, def] of Object.entries(CATEGORY_DEFINITIONS)) {
        if (def.referenceFields.length === 0) continue;

        const rawEntries = (config as Record<string, unknown>)[category + 's'];
        if (!Array.isArray(rawEntries)) continue;

        for (const [i, entry] of (rawEntries as Record<string, unknown>[]).entries()) {
            if (!entry || typeof entry !== 'object') continue;

            for (const ref of def.referenceFields) {
                const val = (entry as Record<string, unknown>)[ref.field];
                if (typeof val !== 'string' && typeof val !== 'number') continue;

                const rawTargetEntries = (config as Record<string, unknown>)[ref.targetCategory + 's'];
                if (!Array.isArray(rawTargetEntries)) continue;
                const targetDef = CATEGORY_DEFINITIONS[ref.targetCategory];
                if (!targetDef) continue;

                const targetEntries = rawTargetEntries as Record<string, unknown>[];
                const targetIdx = targetEntries.findIndex(
                    e => e && typeof e === 'object' && (e as Record<string, unknown>)[targetDef.idField] === val,
                );
                // An unresolved reference gets no hint - it's either broken or not written yet.
                if (targetIdx === -1) continue;

                const node = resolvePathToNode(doc, `/${category}s/${i}/${ref.field}`);
                if (!node?.range) continue;

                const displayId = getDisplayId(ref.targetCategory, targetEntries[targetIdx]);
                const startPos = lineCounter.linePos(node.range[0]);
                const endPos = lineCounter.linePos(node.range[1]);
                const line = startPos.line;

                hintMap.set(line, `→ ${targetDef.label}: "${displayId}"`);
                targetMap.set(line, `/${ref.targetCategory}s/${targetIdx}`);
                valueRanges.set(line, { startCol: startPos.col, endCol: endPos.col });
            }
        }
    }

    return { referenceHintMap: hintMap, referenceTargetMap: targetMap, referenceValueRanges: valueRanges };
}

// Maps each referenceable id/username value to its line, so the hover provider can answer
// "what points to this?" in O(1) instead of re-scanning the config on every hover.
export function buildIdLineMap(parsedDoc: ParsedDoc, config: ApisixConfig) {
    const idLineMap = new Map<number, { category: string; idValue: string | number }>();
    const { doc, lineCounter } = parsedDoc;

    for (const [category, def] of Object.entries(CATEGORY_DEFINITIONS)) {
        if (def.referenceableFields.length === 0) continue;
        const rawEntries = (config as Record<string, unknown>)[category + 's'];
        if (!Array.isArray(rawEntries)) continue;

        for (const [i, entry] of (rawEntries as Record<string, unknown>[]).entries()) {
            if (!entry || typeof entry !== 'object') continue;
            const idValue = (entry as Record<string, unknown>)[def.idField];
            if (typeof idValue !== 'string' && typeof idValue !== 'number') continue;

            const node = resolvePathToNode(doc, `/${category}s/${i}/${def.idField}`);
            if (!node?.range) continue;

            const line = lineCounter.linePos(node.range[0]).line;
            idLineMap.set(line, { category, idValue });
        }
    }

    return idLineMap;
}
