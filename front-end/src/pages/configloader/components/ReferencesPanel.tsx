import React, { useState } from 'react';
import { useConfigManager } from '../../../hooks/useConfigManager';
import loaderStyles from '../configLoader.module.css';
import styles from './ReferencesPanel.module.css';

const CATEGORY_COLOR: Record<string, string> = {
    upstream:      '#22c55e',
    service:       '#f97316',
    consumer:      '#8b5cf6',
    plugin_config: '#0d9488',
    global_rule:   '#ef4444',
};

const CATEGORY_LABEL: Record<string, string> = {
    upstream:      'Upstream',
    service:       'Service',
    consumer:      'Consumer',
    plugin_config: 'Plugin Config',
    global_rule:   'Global Rule',
};

const CATEGORIES = ['upstream', 'service', 'consumer', 'plugin_config', 'global_rule'] as const;

interface ReferencesPanelProps {
    headerExtra?: React.ReactNode;
}

export const ReferencesPanel: React.FC<ReferencesPanelProps> = ({ headerExtra }) => {
    const { configManager } = useConfigManager();
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleCopy = (id: string) => {
        navigator.clipboard.writeText(id)
            .then(() => {
                setCopiedId(id);
                setTimeout(() => setCopiedId(null), 1500);
            })
            .catch(() => {});
    };

    const sections = CATEGORIES
        .map(cat => ({ category: cat, ids: configManager.getCategoryEntries(cat) }))
        .filter(s => s.ids.length > 0);

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
                        No referenceable entries found. Load a config that contains upstreams, services, or other linkable resources.
                    </p>
                ) : (
                    sections.map(({ category, ids }) => (
                        <div key={category} className={styles.section}>
                            <div
                                className={styles.sectionLabel}
                                style={{ borderLeftColor: CATEGORY_COLOR[category] }}
                            >
                                {CATEGORY_LABEL[category]}
                            </div>
                            {ids.map(id => (
                                <div key={id} className={styles.entryRow}>
                                    <code className={styles.entryId}>{id}</code>
                                    <button
                                        className={`text-small ${loaderStyles.btnIcon} ${styles.copyBtn}`}
                                        onClick={() => handleCopy(id)}
                                    >
                                        {copiedId === id ? '✓' : 'Copy'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
