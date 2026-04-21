import type {ResolvedError} from '../../actions/ErrorResolver';
import styles from './RouteDesigner.module.css';

export type DesignerAction =
    | { type: 'set-field'; field: string; value: unknown }
    | { type: 'set-search'; term: string };

interface DesignerErrorLogsProps {
    resolvedErrors: ResolvedError[];
    onAction: (action: DesignerAction) => void;
}

export function DesignerErrorLogs({resolvedErrors, onAction}: DesignerErrorLogsProps) {
    return (
        <div className={`card ${styles.validationCard}`}>
            <div className="card-header">Validation</div>
            <div className={styles.validationBody}>
                {resolvedErrors.map((err, i) => (
                    <div key={i} className={styles.errorMessage}>
                        {err.path && <strong>[{err.path}] </strong>}
                        {err.message}
                        <ErrorActions error={err} onAction={onAction} />
                    </div>
                ))}
            </div>
        </div>
    );
}

interface ErrorActionsProps {
    error: ResolvedError;
    onAction: (action: DesignerAction) => void;
}

function ErrorActions({error, onAction}: ErrorActionsProps) {
    const {hint} = error;
    if (!hint) return null;

    if (hint.type === 'anyof' && Array.isArray(hint.possibleOptions)) {
        return (
            <div className={styles.errorActions}>
                {hint.possibleOptions.map((variant: string[], i: number) => (
                    <button
                        key={i}
                        className={styles.actionButton}
                        onClick={() => onAction({type: 'set-search', term: variant.join(' ')})}
                    >
                        Use: {variant.join(', ')}
                    </button>
                ))}
            </div>
        );
    }

    return (
        <div className={styles.errorActions}>
            {hint.default !== undefined && (
                <button
                    className={styles.actionButton}
                    onClick={() => onAction({type: 'set-field', field: hint.field, value: hint.default})}
                >
                    Apply default: {String(hint.default)}
                </button>
            )}
        </div>
    );
}
