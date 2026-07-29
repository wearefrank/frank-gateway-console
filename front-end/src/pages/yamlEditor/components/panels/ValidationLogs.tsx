import { useState, useEffect, useRef } from 'react';
import React from 'react';
import { ValidationLog } from '../../../../actions/ValidationLogger';
import { type ApisixConfig } from '../../../../actions/SchemaValidation';
import { LogEntry } from './LogEntry';
import styles from '../../YamlEditor.module.css';

interface ValidationLogsProps {
    logs: ValidationLog[];
    config?: ApisixConfig | null;
    onLogClick?: (log: ValidationLog) => void;
    highlightedLog?: ValidationLog | null;
    headerExtra?: React.ReactNode;
}

export const ValidationLogs = ({ logs, config, onLogClick, highlightedLog, headerExtra }: ValidationLogsProps) => {
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

    return (
        <div className={`card flex flex-column ${styles.configCard}`}>
            {headerExtra && <div className={styles.tabBar}>{headerExtra}</div>}
            <div className="flex justify-between align-center card-header">
                Validation Results
                <div className="flex align-center gap-sm">
                    <label className="flex align-center gap-xs text-small cursor-pointer">
                        <input
                            type="checkbox"
                            checked={hideInfo}
                            onChange={(e) => setHideInfo(e.target.checked)}
                        />
                        Hide Info
                    </label>
                </div>
            </div>
            <div className={`flex flex-column gap-sm scroll-y ${styles.logContainer}`}>
                {filteredLogs.map((log, index) => (
                    <LogEntry
                        key={index}
                        log={log}
                        config={config}
                        isHighlighted={log === highlightedLog}
                        onClick={onLogClick}
                        itemRef={el => { itemRefs.current[index] = el; }}
                    />
                ))}
            </div>
        </div>
    );
};
