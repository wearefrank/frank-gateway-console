import { useMemo, useState } from 'react';
import type { ColumnVisibilityState } from '@tanstack/react-table';
import { useFetch } from '../../hooks/useFetch';
import { buildCodeMaps } from '../chart/palette';
import { spansMoreThanADay, type TimeRange } from '../TimeRangePicker/timeRange';
import { buildColumns, defaultVisibility } from './columns';
import type { LogEntry, LogFieldDescriptor } from './types';

/**
 * The table's columns, described by the server rather than declared here - see LogFields on
 * the back end. A field added to the gateway's log format becomes a column on its own.
 */
export function useLogColumns(kind: string, entries: LogEntry[], range: TimeRange) {
    const fieldsFetch = useFetch<LogFieldDescriptor[]>(`/logs/fields?type=${kind}`);
    const fields = fieldsFetch.data;

    // Seeded from the descriptors, then owned by the reader: the visibility menu is theirs and
    // a later render must not push their choices back to the defaults. Seeded during render
    // rather than in an effect, which would show every column for a frame first. Once per kind,
    // not per arrival of `fields` - a refetch hands back an equal-but-new array.
    const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
    const [seededKind, setSeededKind] = useState<string | null>(null);
    if (fields && seededKind !== kind) {
        setSeededKind(kind);
        setColumnVisibility(defaultVisibility(fields));
    }

    // Status colours off the shared palette, so a 502 is the same red as everywhere else.
    const colorMap = useMemo(() => {
        const statusIds = (fields ?? []).filter(field => field.type === 'STATUS').map(field => field.id);
        const codes = entries.flatMap(entry => statusIds
            .map(id => entry.fields[id])
            .filter(code => code != null)
            .map(String));
        return buildCodeMaps([...new Set(codes)]).colorMap;
    }, [entries, fields]);

    // A window that can cross midnight needs the date in the Time column.
    const showDate = spansMoreThanADay(range);

    const columns = useMemo(
        () => buildColumns(fields ?? [], colorMap, showDate),
        [fields, colorMap, showDate],
    );

    return {
        fields,
        fieldsError: fieldsFetch.error,
        columns,
        columnVisibility,
        setColumnVisibility,
    };
}
