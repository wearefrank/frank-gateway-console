// Which of the gateway's log streams a table reads - mirrors Java LogKind. Audit and messages
// are the same access record under the old label and the current one.
export type LogKind = 'audit' | 'messages' | 'error';

/** What a table is pointed at: one stream, or several to show merged. */
export type LogKinds = LogKind | LogKind[];

/** One cell's value: a number for STATUS/DURATION fields, text otherwise. */
export type LogFieldValue = string | number | null;

/**
 * Mirrors Java LogEntryDto.
 */
export interface LogEntry {
    type: LogKind;
    // The Loki stream's namespace label. Earns its column when the console is pinned to
    // several namespaces and this table shows them merged.
    namespace: string | null;
    timestamp: string;
    // Nanoseconds, kept as a string. Never Number() this - a rounded value breaks paging.
    tsNanos: string;
    // Keyed by LogFieldDescriptor.id; a key the line did not carry is absent.
    fields: Record<string, LogFieldValue>;
    raw: string;
}

/**
 * Mirrors LogFieldType.
 * see buildRenderers in columns.tsx.
 */
export type LogFieldType =
    | 'TEXT'
    | 'MUTED'
    | 'CODE'
    | 'PATH'
    | 'MESSAGE'
    | 'LEVEL'
    | 'STATUS'
    | 'DURATION';

/** Mirrors LogFieldDto - one column, as GET /logs/fields?type= describes it, in column order. */
export interface LogFieldDescriptor {
    id: string;
    label: string;
    type: LogFieldType;
    defaultVisible: boolean;
    align: 'right' | null;
}

// Mirrors LogPageDto.
export interface LogPage {
    entries: LogEntry[];
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    anchor: string;
    depthCapped: boolean;
    searchField: string | null;
}
