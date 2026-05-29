import React from 'react';
import { type VersionSummary } from '../../hooks/useVersionHistory';
import { formatRelativeTime } from '../../utils/time';
import styles from './VersionList.module.css';

interface VersionListProps {
    versions: VersionSummary[];
    currentSentinel: string;
    loading?: boolean;
    busy?: boolean;
    onView: (version: VersionSummary) => void;
    onRestore: (version: VersionSummary) => void;
}

interface VersionRowProps {
    version: VersionSummary;
    isCurrent: boolean;
    busy?: boolean;
    onView: () => void;
    onRestore: () => void;
}

const VersionRow: React.FC<VersionRowProps> = ({ version, isCurrent, busy, onView, onRestore }) => {
    const shortId = version.id.slice(0, 7);
    const hashEl = version.commitUrl
        ? <a className={styles.hash} href={version.commitUrl} target="_blank" rel="noreferrer">{shortId}</a>
        : <span className={styles.hash}>{shortId}</span>;

    return (
        <div className={styles.row}>
            <div className={styles.rowMain}>
                {hashEl}
                <span className={version.message ? styles.message : styles.noMessage}>
                    {version.message || '(no message)'}
                </span>
                {!isCurrent && <span className={styles.time}>{formatRelativeTime(version.createdAt)}</span>}
            </div>
            <div className={styles.rowActions}>
                <button className="text-small" onClick={onView} disabled={busy}>View</button>
                {!isCurrent && <button className="text-small" onClick={onRestore} disabled={busy}>Restore</button>}
            </div>
        </div>
    );
};

export const VersionList: React.FC<VersionListProps> = ({ versions, currentSentinel, loading, busy, onView, onRestore }) => {
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
                    onView={() => onView(sentinelVersion)}
                    onRestore={() => onRestore(sentinelVersion)}
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
                    onView={() => onView(version)}
                    onRestore={() => onRestore(version)}
                />
            ))}
        </div>
    );
};
