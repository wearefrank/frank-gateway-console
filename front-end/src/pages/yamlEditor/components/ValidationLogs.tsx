import { useState, useEffect, useRef } from 'react';
import React from 'react';
import { ValidationLog } from '../../../actions/ValidationLogger';
import { type ApisixConfig } from '../../../actions/SchemaValidation';
import styles from '../YamlEditor.module.css';

interface ValidationLogsProps {
    logs: ValidationLog[];
    onClear: () => void;
    config?: ApisixConfig | null;
    onLogClick?: (log: ValidationLog) => void;
    highlightedLog?: ValidationLog | null;
    headerExtra?: React.ReactNode;
}

export const ValidationLogs = ({ logs, onClear, config, onLogClick, highlightedLog, headerExtra }: ValidationLogsProps) => {
    const [hideInfo, setHideInfo] = useState(true);
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

    const filteredLogs = hideInfo ? logs.filter(log => log.type !== 'info') : logs;

    useEffect(() => {
        if (!highlightedLog) return;
        const idx = filteredLogs.indexOf(highlightedLog);
        if (idx !== -1) {
            itemRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [highlightedLog, filteredLogs]);

    const logTypeClass = (type: string) => {
        switch (type) {
            case 'error': return styles.logItemError;
            case 'success': return styles.logItemSuccess;
            case 'warning': return styles.logItemWarning;
            default: return styles.logItem;
        }
    };

    return (
        <div className={`card flex flex-column ${styles.configCard}`}>
            <div className="flex justify-between align-center card-header">
                Validation Results
                <div className="flex align-center gap-sm">
                    {headerExtra}
                    <label className="flex align-center gap-xs text-small cursor-pointer">
                        <input
                            type="checkbox"
                            checked={hideInfo}
                            onChange={(e) => setHideInfo(e.target.checked)}
                        />
                        Hide Info
                    </label>
                    <button className={`text-small ${styles.btnIcon}`} onClick={onClear}>Clear</button>
                </div>
            </div>
            <div className={`flex flex-column gap-sm scroll-y ${styles.logContainer}`}>
                {/* Loop over logs */}
                {filteredLogs.map((log, index) => {
                    const isClickable = (log.type === 'error' || log.type === 'warning') && log.path;
                    const isHighlighted = log === highlightedLog;
                    return (
                        <div
                            key={index}
                            ref={el => { itemRefs.current[index] = el; }}
                            className={`${logTypeClass(log.type)} ${isClickable ? styles.logItemClickable : ''} ${isHighlighted ? styles.logItemHighlighted : ''}`}
                            onClick={() => isClickable && onLogClick?.(log)}
                        >
                            <div className={`flex justify-between mb-1 ${styles.logHeader}`}>
                                <strong className={styles.logType}>{log.type}</strong>
                                {(() => {
                                    const resourceType = log.getResourceType()
                                    const resourceName = log.getResourceName(config || null);
                                    const parentName = log.getParentName();

                                    const contextStr = [resourceType, resourceName, parentName].filter(Boolean).join(' - ');
                                    return contextStr ? <span>{contextStr}</span> : null;
                                })()}
                                <span>{log.timestamp}</span>
                            </div>
                            <p className={styles.logFooter}>
                                {log.formatErrorMessage() || 'No Message given'}
                                {/* REGEX101 LINK */}
                                {(() => {
                                    const pattern = log.errorObject?.keyword === 'pattern' ? log.errorObject.params?.pattern as string | undefined : undefined;
                                    if (!pattern) return null;
                                    const url = `https://regex101.com/?regex=${encodeURIComponent(pattern)}&flavor=pcre2`;
                                    return <a href={url} target="_blank" rel="noopener noreferrer" className={styles.patternLink}>regex101</a>;
                                })()}
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
