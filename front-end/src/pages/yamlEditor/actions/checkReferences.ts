import { ValidationLog } from '../../../actions/ValidationLogger';
import type { ApisixConfig } from '../../../actions/SchemaValidation';
import { CATEGORY_DEFINITIONS, getCategoryEntries, isEntry } from '../../../config/categoryDefinitions';

export interface Usage {
    fromCategory: string;
    fromEntry: Record<string, unknown>;
    fromIndex: number;
    field: string;
}

export function getUsages(
    config: ApisixConfig,
    targetCategory: string,
    idValue: string | number,
): Usage[] {
    const results: Usage[] = [];
    for (const [cat, def] of Object.entries(CATEGORY_DEFINITIONS)) {
        for (const ref of def.referenceFields) {
            if (ref.targetCategory !== targetCategory) continue;
            for (const [i, entry] of getCategoryEntries(config, cat).entries()) {
                if (!isEntry(entry)) continue;
                const val = entry[ref.field];
                if (val !== undefined && String(val) === String(idValue)) {
                    results.push({ fromCategory: cat, fromEntry: entry, fromIndex: i, field: ref.field });
                }
            }
        }
    }
    return results;
}

function getIds(config: ApisixConfig, category: string): Set<string | number> {
    const idField = CATEGORY_DEFINITIONS[category]?.idField ?? 'id';
    return new Set(
        getCategoryEntries(config, category)
            .filter(isEntry)
            .map(e => e[idField])
            .filter((id): id is string | number => typeof id === 'string' || typeof id === 'number'),
    );
}

const DUPLICATE_CHECK_CATEGORIES: { cat: string; idField: string }[] = [
    ...Object.entries(CATEGORY_DEFINITIONS).map(([cat, def]) => ({ cat, idField: def.idField })),
    { cat: 'stream_route', idField: 'id' },
];

function checkDuplicateIds(config: ApisixConfig): ValidationLog[] {
    const logs: ValidationLog[] = [];

    for (const { cat, idField } of DUPLICATE_CHECK_CATEGORIES) {
        const seen = new Map<string, number>();

        for (const entry of getCategoryEntries(config, cat).filter(isEntry)) {
            const id = entry[idField];
            if (typeof id !== 'string' && typeof id !== 'number') continue;
            const key = String(id);
            seen.set(key, (seen.get(key) ?? 0) + 1);
        }

        for (const [id, count] of seen) {
            if (count < 2) continue;
            logs.push(new ValidationLog(
                'error',
                `Duplicate ${cat} ${idField} "${id}" (appears ${count} times)`,
                `/${cat}s`,
            ));
        }
    }

    return logs;
}

export function checkReferences(config: ApisixConfig): ValidationLog[] {
    const logs: ValidationLog[] = [];

    // Cache of valid ID sets per category, built on first access
    const idSetCache = new Map<string, Set<string | number>>();
    const getTargetIds = (category: string): Set<string | number> => {
        if (!idSetCache.has(category)) idSetCache.set(category, getIds(config, category));
        return idSetCache.get(category)!;
    };

    for (const [category, def] of Object.entries(CATEGORY_DEFINITIONS)) {
        if (def.referenceFields.length === 0) continue;
        for (const [i, entry] of getCategoryEntries(config, category).entries()) {
            if (!isEntry(entry)) continue;
            const entryId = typeof entry[def.idField] === 'string' ? entry[def.idField] as string : `[${i}]`;
            for (const ref of def.referenceFields) {
                const val = entry[ref.field];
                if (typeof val !== 'string' && typeof val !== 'number') continue;
                if (!getTargetIds(ref.targetCategory).has(val)) {
                    logs.push(new ValidationLog(
                        'warning',
                        `${def.label} "${entryId}": ${ref.field} "${val}" not found in ${ref.targetCategory}s`,
                        `/${category}s/${i}/${ref.field}`,
                    ));
                }
            }
        }
    }

    logs.push(...checkDuplicateIds(config));

    return logs;
}
