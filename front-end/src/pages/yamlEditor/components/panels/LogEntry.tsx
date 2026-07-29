import { ValidationLog } from '../../../../actions/ValidationLogger';
import { type ApisixConfig } from '../../../../actions/SchemaValidation';
import styles from '../../YamlEditor.module.css';

interface LogEntryProps {
    log: ValidationLog;
    config?: ApisixConfig | null;
    isHighlighted: boolean;
    onClick?: (log: ValidationLog) => void;
    itemRef: (el: HTMLDivElement | null) => void;
}

const logTypeClasses: Record<ValidationLog['type'], string> = {
    error: styles.logItemError,
    success: styles.logItemSuccess,
    warning: styles.logItemWarning,
    info: styles.logItem,
};

export const LogEntry = ({ log, config, isHighlighted, onClick, itemRef }: LogEntryProps) => {
    const isClickable = (log.type === 'error' || log.type === 'warning') && !!log.path;

    const resourceType = log.getResourceType();
    const nameParts = log.getResourceNameParts(config || null);
    const parentName = log.getParentName();

    const pattern = log.errorObject?.keyword === 'pattern' ? log.errorObject.params?.pattern as string | undefined : undefined;
    const regex101Url = pattern ? `https://regex101.com/?regex=${encodeURIComponent(pattern)}&flavor=pcre2` : undefined;

    return (
        <div
            ref={itemRef}
            className={`${logTypeClasses[log.type]} ${isClickable ? styles.logItemClickable : ''} ${isHighlighted ? styles.logItemHighlighted : ''}`}
            onClick={() => isClickable && onClick?.(log)}
        >
            <div className={styles.logHeader}>
                <strong className={styles.logType}>{log.type}</strong>
                {resourceType && <span className={styles.logContextType}>{resourceType}</span>}
                <span className={styles.logTimestamp}>{log.timestamp}</span>
            </div>
            {(nameParts || parentName) && (
                <div className={styles.logContext}>
                    {nameParts && (
                        <>
                            {nameParts.label && <span className={styles.logContextLabel}>{nameParts.label}:</span>}
                            <span className={styles.logContextValue}>{nameParts.value}</span>
                        </>
                    )}
                    {parentName && <span className={styles.logContextParent}>{parentName}</span>}
                </div>
            )}
            <p className={styles.logFooter}>
                {log.formatErrorMessage() || 'No Message given'}
                {regex101Url && (
                    <a href={regex101Url} target="_blank" rel="noopener noreferrer" className={styles.patternLink}>regex101</a>
                )}
            </p>
        </div>
    );
};
