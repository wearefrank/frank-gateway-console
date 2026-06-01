import React from 'react';
import { type VersionSummary } from '../../hooks/useVersionHistory';
import { formatRelativeTime, formatExactDate } from '../../utils/time';
import styles from './VersionList.module.css';

interface VersionListProps {
    versions: VersionSummary[];
    currentSentinel: string;
    loading?: boolean;
    busy?: boolean;
    pendingRestoreId?: string;
    onView: (version: VersionSummary) => void;
    onRestore: (version: VersionSummary) => void;
    onConfirmRestore: (version: VersionSummary) => void;
    onCancelRestore: () => void;
}

interface VersionRowProps {
    version: VersionSummary;
    isCurrent: boolean;
    busy?: boolean;
    isPendingRestore?: boolean;
    onView: () => void;
    onRestore: () => void;
    onConfirmRestore: () => void;
    onCancelRestore: () => void;
}

const VersionRow: React.FC<VersionRowProps> = ({ version, isCurrent, busy, isPendingRestore, onView, onRestore, onConfirmRestore, onCancelRestore }) => {
    const shortId = version.id.slice(0, 7);
    const hashEl = version.commitUrl
        ? <a className={styles.hash} href={version.commitUrl} target="_blank" rel="noreferrer">{shortId}</a>
        : <span className={styles.hash}>{shortId}</span>;

    const hasDate = !isCurrent && !!version.createdAt;

    return (
        <div className={styles.row}>
            <div className={styles.rowHeader}>
                {hashEl}
            </div>
            <span className={version.message ? styles.message : styles.noMessage}>
                {version.message || '(no message)'}
            </span>
            {hasDate && (
                <div className={styles.rowMeta}>
                    <span title={version.createdAt}>{formatRelativeTime(version.createdAt)}</span>
                    <span className={styles.metaSep}>·</span>
                    <span>{formatExactDate(version.createdAt)}</span>
                </div>
            )}
            {isPendingRestore ? (
                <div className={styles.rowActions}>
                    <span className={`text-small ${styles.restoreConfirmText}`}>Overwrite current config?</span>
                    <button className={`btn-primary text-small ${styles.actionBtn}`} onClick={onConfirmRestore} disabled={busy}>Yes, restore</button>
                    <button className={`text-small ${styles.actionBtn}`} onClick={onCancelRestore} disabled={busy}>Cancel</button>
                </div>
            ) : (
                <div className={styles.rowActions}>
                    <button className={`text-small ${styles.actionBtn}`} onClick={onView} disabled={busy}>{isCurrent ? 'View unsaved changes' : 'View'}</button>
                    {!isCurrent && <button className={`text-small ${styles.actionBtn}`} onClick={onRestore} disabled={busy}>Restore</button>}
                    {version.author && (
                        <span className={styles.rowAuthor}>{version.author}</span>
                    )}
                </div>
            )}
        </div>
    );
};

export const VersionList: React.FC<VersionListProps> = ({ versions, currentSentinel, loading, busy, pendingRestoreId, onView, onRestore, onConfirmRestore, onCancelRestore }) => {
    const historicVersions = versions.filter(v => v.id !== currentSentinel);
    const sentinelVersion = versions.find(v => v.id === currentSentinel);

    return (
        <div className={styles.list}>
            {sentinelVersion && (
                <VersionRow
                    key={sentinelVersion.id}
                    version={sentinelVersion}
                    isCurrent={true}
                    busy={busy}
                    isPendingRestore={pendingRestoreId === sentinelVersion.id}
                    onView={() => onView(sentinelVersion)}
                    onRestore={() => onRestore(sentinelVersion)}
                    onConfirmRestore={() => onConfirmRestore(sentinelVersion)}
                    onCancelRestore={onCancelRestore}
                />
            )}
            {loading && (
                <>
                    <div className={styles.skeletonRow}>
                        <div className={styles.skeletonHash} />
                        <div className={styles.skeletonText} />
                    </div>
                    <div className={styles.skeletonRow}>
                        <div className={styles.skeletonHash} />
                        <div className={`${styles.skeletonText}`} />
                    </div>
                    <div className={styles.skeletonRow}>
                        <div className={styles.skeletonHash} />
                        <div className={styles.skeletonText} />
                    </div>
                </>
            )}
            {!loading && historicVersions.length === 0 && (
                <div className={`text-muted text-small ${styles.empty}`}>
                    No versions saved yet. Use "Save Version" to get started.
                </div>
            )}
            {!loading && historicVersions.map(version => (
                <VersionRow
                    key={version.id}
                    version={version}
                    isCurrent={false}
                    busy={busy}
                    isPendingRestore={pendingRestoreId === version.id}
                    onView={() => onView(version)}
                    onRestore={() => onRestore(version)}
                    onConfirmRestore={() => onConfirmRestore(version)}
                    onCancelRestore={onCancelRestore}
                />
            ))}
        </div>
    );
};
