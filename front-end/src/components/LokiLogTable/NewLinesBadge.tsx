import { useFetch } from '../../hooks/useFetch';
import type { LogCount } from '../MessagesCounter/messageVolume';
import { setSearchParams } from './useLogPage';
import styles from './LokiLogTable.module.css';

interface NewLinesBadgeProps {
    /** The normalised ?type= - see kindParam. */
    kind: string;
    search: string;
    /** The column the search is confined to, so the badge counts what the table shows. */
    searchField: string;
    errorsOnly: boolean;
    /** Nanosecond instant the visible snapshot was cut from. */
    anchor: string;
    refreshKey: number;
    onJump: () => void;
}

/**
 * How many lines have arrived since the snapshot was pinned, and one click back to them.
 * Mounted only past page 1, which is what makes the request conditional.
 */
export const NewLinesBadge = ({
    kind,
    search,
    searchField,
    errorsOnly,
    anchor,
    refreshKey,
    onJump,
}: NewLinesBadgeProps) => {
    // Nanoseconds to seconds by dropping nine digits, not dividing - a JS number is not exact
    // at that size.
    const params = new URLSearchParams({ type: kind, startTime: anchor.slice(0, -9) || '0' });
    setSearchParams(params, search, searchField, errorsOnly);
    // Not memoised: useFetch compares the endpoint by value, and an equal string is a no-op.
    const countFetch = useFetch<LogCount>(`/logs/count?${params}`, refreshKey);

    // Silent until something arrives, and on error - a failed count is not worth an alarm.
    const count = countFetch.error ? 0 : countFetch.data?.count ?? 0;
    if (count === 0) return null;

    return (
        <button type="button" className={styles.newLinesBadge} onClick={onJump}>
            {count.toLocaleString()} new {count === 1 ? 'line' : 'lines'} · back to newest
        </button>
    );
};
