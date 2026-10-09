package wearefrank.backend.dto;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.function.Function;

/**
 * Which column a page of logs is ordered by, and how that column compares.
 *
 * Loki orders by time and nothing else, so every other column is ordered here instead - see
 * {@code LogsService.getPage}, which fetches the reachable window and sorts it rather than
 * letting the browser reorder the twenty-five rows it happens to be holding.
 *
 * Sortable is derived from {@link LogFields} rather than listed again: any field that draws
 * a column can be sorted on, plus the two structural columns the table shows - Time and
 * Namespace. A field added to log-fields.yaml becomes a sortable column with no change here.
 *
 * How a column compares comes from its {@link LogFieldType}, for the same reason the cell
 * renderer does: status is an integer even though it arrives as text, latency is a number,
 * and Level is worth ordering by severity rather than alphabetically.
 */
public final class LogSort {

    /** The default, and the only one Loki resolves itself. */
    public static final String TIME = "timestamp";

    private static final String NAMESPACE = "namespace";

    /**
     * nginx's levels, least severe first, so that a descending sort on Level puts the worst
     * at the top - which is the only reason anyone sorts that column. Alphabetical would
     * open with ALERT, CRIT, DEBUG and mean nothing.
     *
     * Anything unrecognised ranks below DEBUG rather than nowhere: it is still a level, and
     * a level this does not know is not more severe than one it does.
     */
    private static final List<String> SEVERITY =
            List.of("DEBUG", "INFO", "NOTICE", "WARN", "ERROR", "CRIT", "ALERT", "EMERG");

    /**
     * The requested column, or {@link #TIME} when it is absent or names something this log
     * has no column for.
     *
     * Falls back rather than rejecting: a sort can go stale simply because the table
     * switched kind, and dropping the user on a 400 for that is worse than newest-first.
     */
    public static String resolve(LogFields fields, String requested) {
        if (requested == null || requested.isBlank()) return TIME;
        String id = requested.trim();
        if (TIME.equals(id) || NAMESPACE.equals(id)) return id;
        return fields.isColumn(id) ? id : TIME;
    }

    /** Whether this column is the one Loki can order itself, via its `direction`. */
    public static boolean isTime(String id) {
        return TIME.equals(id);
    }

    /**
     * How to order by a column, already resolved by {@link #resolve}.
     *
     * Empty values sort last either way. A row with no status is not "before every status"
     * in one direction and "after every status" in the other - it has no place in the
     * ordering at all, and the end of the page is where it stays out of the way.
     *
     * Ties break on time, newest first, so that a page is a stable slice: without it two
     * lines sharing a status could swap places between the request for page 1 and the one
     * for page 2, and a row would show up on both or on neither.
     */
    public static Comparator<LogEntryDto> comparator(LogFields fields, String id, boolean ascending) {
        Comparator<LogEntryDto> byColumn = isTime(id)
                ? byKey(entry -> Long.valueOf(entry.tsNanos()), ascending)
                : byKey(keyOf(fields, id), ascending);
        return byColumn.thenComparing(
                entry -> Long.valueOf(entry.tsNanos()), Comparator.reverseOrder());
    }

    /**
     * What a column's value compares as. Keyed off the field's type rather than its name,
     * so this stays a list of meanings rather than a list of columns.
     */
    @SuppressWarnings("rawtypes")
    private static Function<LogEntryDto, Comparable> keyOf(LogFields fields, String id) {
        return switch (fields.typeOf(id)) {
            // Already Integer and Double: coerce() read them out of the line.
            case STATUS, DURATION -> entry -> (Comparable) value(entry, id);
            case LEVEL -> entry -> severity((String) value(entry, id));
            default -> entry -> text((String) value(entry, id));
        };
    }

    /** Case-insensitive, because "GET" sorting before "delete" is not what anyone means. */
    private static String text(String value) {
        return value == null ? null : value.toLowerCase(Locale.ROOT);
    }

    private static Integer severity(String level) {
        return level == null ? null : SEVERITY.indexOf(level.toUpperCase(Locale.ROOT));
    }

    /**
     * Ascending is the natural order of the key; descending reverses it but leaves the
     * empties at the end, which is what nullsLast around the reversed order does.
     */
    @SuppressWarnings({"rawtypes", "unchecked"})
    private static Comparator<LogEntryDto> byKey(Function<LogEntryDto, Comparable> key, boolean ascending) {
        Comparator<Comparable> order = ascending ? Comparator.naturalOrder() : Comparator.reverseOrder();
        return Comparator.comparing(key, Comparator.nullsLast(order));
    }

    /** A column's value off an entry; namespace is the one column held outside the map. */
    static Object value(LogEntryDto entry, String id) {
        return NAMESPACE.equals(id) ? entry.namespace() : entry.fields().get(id);
    }

    private LogSort() {}
}
