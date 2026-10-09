package wearefrank.backend.dto;

import java.util.Map;

/**
 * One log line, flattened.
 *
 * Two shapes arrive from Loki and both land here, told apart by {@link #type()}:
 *
 *   audit - the loki-logger plugin's access record, a nested JSON object per request.
 *   error - APISIX's nginx error log, plain text, taken apart by {@code NginxErrorLine}.
 *
 * What a line carries is whatever {@link LogFields} declares, so it sits in {@link #fields()}
 * keyed by field id rather than in fixed components. A key the line did not carry is absent.
 *
 * A line that parses as neither still gets a row, with its text in raw.
 */
public record LogEntryDto(
        /** {@link LogKind#param()} - "messages" or "error". Decided by the line, not the query. */
        String type,
        /**
         * The namespace label off the Loki stream the line came out of, null if the stream
         * carries none. Read off the stream rather than the line, so it is filled whether or
         * not LOKI_NAMESPACE pins the query - what it answers is "which namespace is this
         * from", which matters most when the pin names several and the table merges them.
         */
        String namespace,
        // ISO-8601 UTC, from Loki's own timestamp rather than the line's. The audit record's
        // $time_iso8601 and the error line's date prefix are both second-resolution local
        // time, so they sort badly and disagree with each other.
        String timestamp,
        /**
         * The same instant as raw nanoseconds, and the cursor for paging: pass the oldest
         * row's value back as endCursor to get the page below it.
         *
         * A string, not a long. Nanoseconds land around 1.8e18 and JSON numbers stop being
         * exact above 2^53, so a browser parsing this as a number would round it and start
         * re-requesting lines it already has.
         */
        String tsNanos,
        /** Field id to value: a String, or an Integer/Double for STATUS/DURATION fields. */
        Map<String, Object> fields,
        String raw
) {}
