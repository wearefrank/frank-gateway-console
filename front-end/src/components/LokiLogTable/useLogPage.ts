import { useEffect, useState } from 'react';
import type { PaginationState, SortingState } from '@tanstack/react-table';
import { useFetch } from '../../hooks/useFetch';
import { useTickWhile } from '../../hooks/useTickWhile';
import {
    DEFAULT_RANGE,
    rangeKey,
    rangeToQuery,
    type TimeRange,
} from '../TimeRangePicker/timeRange';
import type { LogPage } from './types';
import {usePersistedState} from "../../hooks/usePersistedState.ts";

const SEARCH_DEBOUNCE_MS = 300;

/** Searching every column at once, which is the default and what a term alone has always meant. */
export const ALL_COLUMNS = '';

/** Adds the error filter, search term and its column to a /logs request; shared with NewLinesBadge. */
export function setSearchParams(
    params: URLSearchParams,
    search: string,
    searchField: string,
    errorsOnly: boolean,
): void {
    if (errorsOnly) params.set('errorsOnly', 'true');
    if (!search) return;
    params.set('search', search);
    if (searchField !== ALL_COLUMNS) params.set('searchField', searchField);
}

interface UseLogPageOptions {
    /** The normalised ?type= - see kindParam. */
    kind: string;
    defaultPageSize: number;
    /** A term pushed in from outside, e.g. the route picked in the traffic table. */
    searchProp?: string;
    /** A window pushed in from outside, e.g. the span zoomed into on the traffic chart. */
    rangeProp?: TimeRange;
    refreshKey: number;
}

/** One server-side page of a Loki log, plus the paging, sorting and search controls behind it. */
export function useLogPage({
    kind,
    defaultPageSize,
    searchProp,
    rangeProp,
    refreshKey,
}: UseLogPageOptions) {

    const [range, setRange] = usePersistedState<TimeRange>('logRange', DEFAULT_RANGE)

    const [searchInput, setSearchInput] = useState(searchProp ?? '');
    // Debounced apart from the input, so typing does not fire a Loki query per keystroke.
    const [search, setSearch] = useState('');
    // Which column the term is looked for in, or ALL_COLUMNS for the whole line.
    const [searchField, setSearchField] = useState(ALL_COLUMNS);
    // Only lines with a 4xx/5xx status, filtered by Loki.
    const [errorsOnly, setErrorsOnly] = useState(false);
    const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: defaultPageSize });
    // Time descending is newest-first, which is Loki's `direction=backward`.
    const [sorting, setSorting] = useState<SortingState>([{ id: 'timestamp', desc: true }]);
    /** The instant this run of pages is cut from, so paging does not shift under new lines. */
    const [anchor, setAnchor] = useState<string | null>(null);

    const { windowSeconds, anchor: rangeAnchor } = rangeToQuery(range);
    const sortId = sorting[0]?.id ?? 'timestamp';
    const sortDesc = sorting[0]?.desc ?? true;

    useEffect(() => {
        const timer = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [searchInput]);

    // Only copy an outside term in when it changes, so it doesn't overwrite what the reader typed.
    const [lastSearchProp, setLastSearchProp] = useState(searchProp);
    if (searchProp !== undefined && searchProp !== lastSearchProp) {
        setLastSearchProp(searchProp);
        setSearchInput(searchProp);
    }

    // Compared by identity on purpose, so applying the same span twice still lands.
    const [lastRangeProp, setLastRangeProp] = useState(rangeProp);
    if (rangeProp !== undefined && rangeProp !== lastRangeProp) {
        setLastRangeProp(rangeProp);
        setRange(rangeProp);
    }

    // A new result set resets page and anchor during render, so no stale request goes out.
    const resetKey = `${kind}|${search}|${searchField}|${errorsOnly}|${rangeKey(range)}|${sortId}|${sortDesc}`;
    const [seenResetKey, setSeenResetKey] = useState(resetKey);
    if (seenResetKey !== resetKey) {
        setSeenResetKey(resetKey);
        setPagination(p => ({ ...p, pageIndex: 0 }));
        setAnchor(null);
    }

    // Page 1 of a relative window follows the log; any other page is pinned and takes no ticks.
    const following = range.kind === 'relative' && pagination.pageIndex === 0;
    const tick = useTickWhile(refreshKey, following);
    if (following && anchor) setAnchor(null);

    const params = new URLSearchParams({
        type: kind,
        windowSeconds: String(windowSeconds),
        page: String(pagination.pageIndex + 1),
        pageSize: String(pagination.pageSize),
        sort: sortId,
        direction: sortDesc ? 'backward' : 'forward',
    });
    setSearchParams(params, search, searchField, errorsOnly);
    const end = rangeAnchor ?? anchor;
    if (end) params.set('anchor', end);

    const pageFetch = useFetch<LogPage>(`/logs/page?${params}`, tick);
    const data = pageFetch.data;

    // Busy only while fetching a page the reader asked for, not on a background tick.
    const userBusy = pageFetch.loading && data != null
        && (data.page !== pagination.pageIndex + 1 || data.pageSize !== pagination.pageSize);

    /** Pins the snapshot as the reader navigates, adopting the backend's anchor. */
    const pinAnchor = () => {
        // An absolute range already ends at a fixed instant, so there is nothing to pin.
        if (range.kind === 'absolute') return;
        if (!anchor && data?.anchor) setAnchor(data.anchor);
    };

    /** Unpins, so the next fetch follows the log again. */
    const dropAnchor = () => setAnchor(null);

    const entries = data?.entries ?? NO_ENTRIES;

    return {
        range,
        setRange,
        searchInput,
        setSearchInput,
        search,
        searchField,
        setSearchField,
        errorsOnly,
        setErrorsOnly,
        pagination,
        setPagination,
        sorting,
        setSorting,
        sortId,
        sortDesc,
        anchor,
        pinAnchor,
        dropAnchor,
        data,
        entries,
        loading: pageFetch.loading,
        error: pageFetch.error,
        userBusy,
        totalCount: data?.totalCount ?? 0,
        // The server's page count wins, since Loki caps a query at 5000 entries.
        serverPageCount: data?.totalPages ?? 1,
    };
}

// Stable empty array, so a missing page doesn't invalidate memos in the table.
const NO_ENTRIES: never[] = [];
