import React from 'react';
import { useConfigManager } from '../../../hooks/useConfigManager';
import { CATEGORY_COLOR, CATEGORY_LABEL, CATEGORY_DEFINITIONS, getDisplayId } from '../../../config/categoryDefinitions';
import loaderStyles from '../YamlEditor.module.css';
import styles from './OverviewPanel.module.css';

interface OverviewPanelProps {
    headerExtra?: React.ReactNode;
    // Scroll the editor to a JSON pointer path (e.g. "/routes/2").
    // Provided by YamlEditor via handleNavigatePath.
    onNavigate?: (path: string) => void;
}

export const OverviewPanel: React.FC<OverviewPanelProps> = ({ headerExtra, onNavigate }) => {
    const { config } = useConfigManager();

    const sections = Object.entries(CATEGORY_DEFINITIONS).flatMap(([cat, def]) => {
        const raw = config ? (config as Record<string, unknown>)[cat + 's'] : undefined;
        if (!Array.isArray(raw) || raw.length === 0) return [];
        return [{ category: cat, def, entries: raw as Record<string, unknown>[] }];
    });

    return (
        <div className={`card flex flex-column ${loaderStyles.configCard}`}>
            <div className="flex justify-between align-center card-header">
                Overview
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
                                <span className={styles.sectionCount}>{entries.length}</span>
                            </div>
                            {entries.map((entry, i) => (
                                <button
                                    key={i}
                                    className={styles.entryName}
                                    onClick={() => onNavigate?.(`/${category}s/${i}`)}
                                    title="Click to scroll to this entry in the editor"
                                >
                                    {getDisplayId(category, entry, i)}
                                </button>
                            ))}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
