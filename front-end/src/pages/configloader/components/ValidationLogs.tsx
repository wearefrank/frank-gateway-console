import { useState } from 'react';
import { ValidationLog } from '../../../actions/ValidationLogger';
import { type ApisixConfig } from '../../../actions/SchemaValidation';

interface ValidationLogsProps {
    logs: ValidationLog[];
    onClear: () => void;
    config?: ApisixConfig | null;
    onLogClick?: (log: ValidationLog) => void;
}

export const ValidationLogs = ({ logs, onClear, config, onLogClick }: ValidationLogsProps) => {
    const [hideInfo, setHideInfo] = useState(true);

    const filteredLogs = hideInfo ? logs.filter(log => log.type !== 'info') : logs;

    return (
        <div className="card flex flex-column config-card">
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
                    <button className="text-small btn-icon" onClick={onClear}>Clear</button>
                </div>
            </div>
            <div className="flex flex-column gap-sm scroll-y log-container">
                {/* Loop over logs */}
                {filteredLogs.map((log, index) => (
                    <div
                        key={index}
                        className={`log-item ${log.type}`}
                        style={(log.type === 'error' || log.type === 'warning') && log.path ? { cursor: 'pointer' } : undefined}
                        onClick={() => (log.type === 'error' || log.type === 'warning') && log.path && onLogClick?.(log)}
                    >
                        <div className="flex justify-between mb-1 log-header">
                            <strong className="log-type">{log.type}</strong>
                            {(() => {
                                const resourceType = log.getResourceType()
                                const resourceName = log.getResourceName(config || null);
                                const parentName = log.getParentName();

                                const contextStr = [resourceType, resourceName, parentName].filter(Boolean).join(' - ');
                                return contextStr ? <span>{contextStr}</span> : null;
                            })()}
                            <span>{log.timestamp}</span>
                        </div>
                        <p className="log-footer">{log.formatErrorMessage() || 'No Message given'}</p>
                        {/* Extra details for errors */}
                        {/*{(log.type === 'error' || log.type === 'warning') && (*/}
                        {/*    <details>*/}
                        {/*        <summary>Extra info</summary>*/}
                        {/*        {log.errorObject && (*/}
                        {/*            <div className="log-details mb-1" style={{ fontSize: '0.8rem', opacity: 0.8 }}>*/}
                        {/*                <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(log.errorObject, null, 2)}</pre>*/}
                        {/*                <span className="log-footer">Path: {log.errorObject.instancePath || 'No path specified'}</span>*/}
                        {/*            </div>*/}
                        {/*        )}*/}

                        {/*    </details>*/}
                        {/*)}*/}
                    </div>
                ))}
            </div>
        </div>
    );
};
