import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useConfigManager } from '../../../hooks/useConfigManager';
import { CATEGORY_COLOR, CATEGORY_LABEL, CATEGORY_DEFINITIONS, getIdField, getDisplayId } from '../../../config/categoryDefinitions';
import loaderStyles from '../YamlEditor.module.css';
import styles from './ReferencesPanel.module.css';

interface ReferencesPanelProps {
    headerExtra?: React.ReactNode;
}

export const ReferencesPanel: React.FC<ReferencesPanelProps> = ({ headerExtra }) => {
    const { config } = useConfigManager();
    const [, setSearchParams] = useSearchParams();
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const handleCopy = (value: string, key: string) => {
        navigator.clipboard.writeText(value)
            .then(() => {
                setCopiedKey(key);
                setTimeout(() => setCopiedKey(null), 1500);
            })
            .catch(() => {});
    };

    const handleFocus = (category: string, entry: Record<string, unknown>) => {
        const idField = getIdField(category);
        const idValue = entry[idField];
        if (idValue === undefined || idValue === null) return;
        setSearchParams({ focusCategory: category, focusId: String(idValue) });
    };

    const sections = Object.entries(CATEGORY_DEFINITIONS).flatMap(([cat, def]) => {
        const raw = config ? (config as Record<string, unknown>)[cat + 's'] : undefined;
        if (!Array.isArray(raw) || raw.length === 0) return [];
        const entries = raw as Record<string, unknown>[];
        return [{ category: cat, def, entries }];
    });

    return (
        <div className={`card flex flex-column ${loaderStyles.configCard}`}>
            <div className="flex justify-between align-center card-header">
                References
                <div className="flex align-center gap-sm">
                    {headerExtra}
                </div>
            </div>

            <div className={`scroll-y ${loaderStyles.logContainer}`}>
                {sections.length === 0 ? (
                    <p className="text-muted text-small">
                        No entries found. Load a config to see its resources here.
                    </p>
                ) : (
                    sections.map(({ category, def, entries }) => (
                        <div key={category} className={styles.section}>
                            <div
                                className={styles.sectionLabel}
                                style={{ borderLeftColor: CATEGORY_COLOR[category] }}
                            >
                                {CATEGORY_LABEL[category]}
                            </div>
                            {entries.map((entry, i) => {
                                const displayName = getDisplayId(category, entry, i);
                                return (
                                    <div key={i} className={styles.entryBlock}>
                                        <button
                                            className={styles.entryName}
                                            onClick={() => handleFocus(category, entry)}
                                            title="Click to scroll to this entry in the editor"
                                        >
                                            {displayName}
                                        </button>
                                        {def.referenceableFields.map(field => {
                                            const val = entry[field];
                                            if (val === undefined || val === null) return null;
                                            const strVal = String(val);
                                            if (strVal === displayName) return null;
                                            const copyKey = `${category}-${i}-${field}`;
                                            return (
                                                <div key={field} className={styles.entryRow}>
                                                    <span className={styles.refField}>{field}:</span>
                                                    <code className={styles.entryId}>{strVal}</code>
                                                    <button
                                                        className={`text-small ${loaderStyles.btnIcon} ${styles.copyBtn}`}
                                                        onClick={() => handleCopy(strVal, copyKey)}
                                                    >
                                                        {copiedKey === copyKey ? '✓' : 'Copy'}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
