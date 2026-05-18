import { useState } from 'react';
import React from 'react';
import { ValidationLog } from '../../../actions/ValidationLogger';
import { type ApisixConfig } from '../../../actions/SchemaValidation';
import styles from '../configLoader.module.css';

interface ValidationLogsProps {
    logs: ValidationLog[];
    onClear: () => void;
    config?: ApisixConfig | null;
    onLogClick?: (log: ValidationLog) => void;
    headerExtra?: React.ReactNode;
}

export const ValidationLogs = ({ logs, onClear, config, onLogClick, headerExtra }: ValidationLogsProps) => {
    const [hideInfo, setHideInfo] = useState(true);

    const filteredLogs = hideInfo ? logs.filter(log => log.type !== 'info') : logs;

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
                    return (
                        <div
                            key={index}
                            className={`${logTypeClass(log.type)} ${isClickable ? styles.logItemClickable : ''}`}
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
                            <p className={styles.logFooter}>{log.formatErrorMessage() || 'No Message given'}</p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
