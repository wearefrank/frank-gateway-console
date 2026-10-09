package wearefrank.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import wearefrank.backend.dto.LogCountDto;
import wearefrank.backend.dto.LogEntryDto;
import wearefrank.backend.dto.LogFieldDto;
import wearefrank.backend.dto.LogFields;
import wearefrank.backend.dto.LogKind;
import wearefrank.backend.dto.LogPageDto;
import wearefrank.backend.dto.LogSearchField;
import wearefrank.backend.dto.LogSort;
import wearefrank.backend.dto.MessageVolumeDto;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

import static wearefrank.backend.service.LogLineParser.text;

/** Reads Loki logs, raw or as table rows; ?type= takes one or more {@link LogKind}s. */
@Service
public class LogsService {

    private static final int DEFAULT_LIMIT = 100;
    // Under Loki's 5000 cap so a typo can't pull a week of logs.
    private static final int MAX_LIMIT = 1000;
    private static final long WEEK_SECONDS = 7 * 24 * 3600L;
    private static final long NANOS_PER_SECOND = 1_000_000_000L;
    /** Loki's per-query max, so also the deepest reachable page. */
    private static final int MAX_FETCH = 5000;
    private static final int DEFAULT_PAGE_SIZE = 25;

    private final LokiClient lokiClient;
    private final ObjectMapper objectMapper;
    private final LokiScope scope;
    private final LogFields logFields;
    private final LogLineParser lineParser;

    public LogsService(LokiClient lokiClient, ObjectMapper objectMapper, LokiScope scope, LogFields logFields,
                       LogLineParser lineParser) {
        this.lokiClient = lokiClient;
        this.objectMapper = objectMapper;
        this.scope = scope;
        this.logFields = logFields;
        this.lineParser = lineParser;
    }

    // raw passthrough: startTime=null -> last hour, startTime=0 -> the whole retention window
    public String logRangeQuery(String type, String query, String search, Long startTime,
                                String endCursor, Integer limit, String direction) {
        long now = System.currentTimeMillis() / 1000;
        String resolvedDirection = "forward".equals(direction) ? "forward" : "backward";
        return lokiClient.queryRange(
                buildPipeline(scope.resolveKinds(type), query, search),
                resolveStart(startTime, now) * NANOS_PER_SECOND,
                resolveEndNanos(endCursor, now),
                resolveLimit(limit), resolvedDirection);
    }

    public List<LogEntryDto> getRecentLogs(String type, String query, String search, Long startTime,
                                           String endCursor, Integer limit) {
        String body = logRangeQuery(type, query, search, startTime, endCursor, limit, "backward");
        return parseStreams(body, resolveLimit(limit));
    }

    public List<LogFieldDto> describeFields(String type) {
        return logFields.describe(scope.resolveKinds(type));
    }

    // String cursor: nanos exceed JSON's 2^53; Loki's end is exclusive so pages don't overlap.
    private long resolveEndNanos(String endCursor, long now) {
        if (endCursor == null || endCursor.isBlank()) {
            return now * NANOS_PER_SECOND;
        }
        try {
            return Long.parseLong(endCursor.trim());
        } catch (NumberFormatException e) {
            // 400, not the handler's blanket 502 - otherwise a bad cursor reads like Loki is down.
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "endCursor must be a nanosecond timestamp, got: " + endCursor);
        }
    }

    /** Counted by Loki over the whole window, not the returned page. */
    public LogCountDto countLogs(String type, String query, String search, String searchField,
                                 boolean errorsOnly, Long startTime) {
        long now = System.currentTimeMillis() / 1000;
        return countBetween(scope.resolveKinds(type), query, search, searchField, errorsOnly,
                resolveStart(startTime, now), now, null);
    }

    // count_over_time takes range + eval point, so span = end-start evaluated at evalNanos (null = now).
    private LogCountDto countBetween(Set<LogKind> kinds, String query, String search, String searchField,
                                     boolean errorsOnly, long startSec, long endSec, Long evalNanos) {
        String column = searchColumn(search, searchField);
        String pipeline = buildPipeline(kinds, query, search, column, errorsOnly);
        if (column != null) {
            return countColumn(pipeline, search, column, startSec, endSec, evalNanos);
        }
        String logql = "sum(count_over_time(" + pipeline + "[" + (endSec - startSec) + "s]))";
        String body = lokiClient.instantQuery(logql, evalNanos);
        try {
            JsonNode result = objectMapper.readTree(body).path("data").path("result");
            // An empty vector means nothing matched, so zero - what a fresh Loki answers.
            long count = result.isEmpty() ? 0L : (long) result.get(0).path("value").get(1).asDouble();
            return new LogCountDto(count, logql, endSec - startSec);
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse Loki count response: " + e.getMessage(), e);
        }
    }

    /** Column search: Loki matches lines, so count here, capped at MAX_FETCH. */
    private LogCountDto countColumn(String pipeline, String search, String column,
                                    long startSec, long endSec, Long evalNanos) {
        long endNanos = evalNanos != null ? evalNanos : endSec * NANOS_PER_SECOND;
        long count = window(pipeline, startSec * NANOS_PER_SECOND, endNanos, MAX_FETCH).stream()
                .filter(entry -> LogSearchField.matches(logFields, entry, column, search))
                .count();
        return new LogCountDto(count, pipeline, endSec - startSec);
    }

    /** The column the search is confined to, or null when it runs over the whole line. */
    private String searchColumn(String search, String searchField) {
        String column = LogSearchField.resolve(logFields, searchField);
        return (search == null || search.isBlank()) ? null : column;
    }

    private List<LogEntryDto> window(String pipeline, long startNanos, long endNanos, int budget) {
        return parseStreams(lokiClient.queryRange(pipeline, startNanos, endNanos, budget, "backward"), budget);
    }

    // Adjacent windows; previous is evaluated at the boundary since count_over_time has no offset.
    public MessageVolumeDto messageVolume(String type, String query, String search, Long windowSeconds) {
        Set<LogKind> kinds = scope.resolveKinds(type);
        long window = resolveVolumeWindow(windowSeconds);
        long now = System.currentTimeMillis() / 1000;
        long boundary = now - window;

        LogCountDto currentCount = countBetween(kinds, query, search, null, false, boundary, now, null);
        LogCountDto previousCount = countBetween(kinds, query, search, null, false,
                boundary - window, boundary, boundary * NANOS_PER_SECOND);

        long current = currentCount.count();
        long previous = previousCount.count();
        // Null, not 0%: an empty previous window may just be past retention.
        Double changePercent = previous == 0
                ? null
                : Math.round((current - previous) * 1000.0 / previous) / 10.0;

        return new MessageVolumeDto(current, previous, changePercent, window, currentCount.query());
    }

    private long resolveVolumeWindow(Long windowSeconds) {
        if (windowSeconds == null) return WEEK_SECONDS;
        if (windowSeconds <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "windowSeconds must be positive, got: " + windowSeconds);
        }
        return windowSeconds;
    }

    /** Loki ignores offset, so a page is sliced from one over-fetch; depth capped at MAX_FETCH. */
    public LogPageDto getPage(String type, String query, String search, String searchField,
                              boolean errorsOnly, Long windowSeconds, String anchor, Integer page, Integer pageSize,
                              String direction, String sort) {
        Set<LogKind> kinds = scope.resolveKinds(type);
        long now = System.currentTimeMillis() / 1000;
        long anchorNanos = resolveEndNanos(anchor, now);
        // Both ends hang off the anchor so later pages cover the same span.
        long window = (windowSeconds == null) ? 3600L
                : (windowSeconds == 0 ? scope.retentionSeconds() : windowSeconds);
        long anchorSec = anchorNanos / NANOS_PER_SECOND;

        int size = resolvePageSize(pageSize);
        int reachablePages = Math.max(1, MAX_FETCH / size);
        int budget = reachablePages * size;

        // Clamped rather than 404'd: a page number goes stale simply because the search narrowed.
        int requested = (page == null || page < 1) ? 1 : page;

        boolean ascending = "forward".equals(direction);
        String resolvedDirection = ascending ? "forward" : "backward";
        String resolvedSort = LogSort.resolve(logFields, sort);
        String column = searchColumn(search, searchField);

        String pipeline = buildPipeline(kinds, query, search, column, errorsOnly);
        long startNanos = anchorNanos - window * NANOS_PER_SECOND;

        if (column != null) {
            return columnSearchPage(pipeline, startNanos, anchorNanos, requested, size, budget,
                    resolvedSort, ascending, resolvedDirection, search, column);
        }

        // Full window at anchor-1ns: count_over_time's (T-r, T] then equals query_range's [start, end).
        long total = countBetween(kinds, query, search, null, errorsOnly, anchorSec - window,
                anchorSec, anchorNanos - 1).count();
        int totalPages = (int) Math.min(reachablePages, Math.max(1, (total + size - 1) / size));
        boolean depthCapped = total > (long) budget;

        int resolvedPage = Math.min(requested, totalPages);

        List<LogEntryDto> entries = LogSort.isTime(resolvedSort)
                ? timePage(pipeline, startNanos, anchorNanos, resolvedPage, size, resolvedDirection)
                : sortedPage(pipeline, startNanos, anchorNanos, resolvedPage, size,
                        budget, resolvedSort, ascending);

        return new LogPageDto(entries, resolvedPage, size, total, totalPages,
                String.valueOf(anchorNanos), depthCapped, resolvedDirection, resolvedSort, null);
    }

    /** Column search: fetch the whole window, match and count here so pages are never empty. */
    private LogPageDto columnSearchPage(String pipeline, long startNanos, long anchorNanos,
                                        int requested, int size, int budget, String sort,
                                        boolean ascending, String direction, String search,
                                        String column) {
        List<LogEntryDto> fetched = window(pipeline, startNanos, anchorNanos, budget);
        List<LogEntryDto> matched = new ArrayList<>(fetched.stream()
                .filter(entry -> LogSearchField.matches(logFields, entry, column, search))
                .toList());

        long total = matched.size();
        int totalPages = (int) Math.max(1, (total + size - 1) / size);
        int resolvedPage = Math.min(requested, totalPages);

        matched.sort(LogSort.comparator(logFields, sort, ascending));

        return new LogPageDto(slice(matched, resolvedPage, size), resolvedPage, size, total, totalPages,
                String.valueOf(anchorNanos), fetched.size() >= budget, direction, sort, column);
    }

    private List<LogEntryDto> timePage(String pipeline, long startNanos, long anchorNanos,
                                       int page, int size, String direction) {
        int needed = page * size;
        String body = lokiClient.queryRange(pipeline, startNanos, anchorNanos, needed, direction);

        // parseStreams sorts newest-first; flip back for forward.
        List<LogEntryDto> overFetched = new ArrayList<>(parseStreams(body, needed));
        if ("forward".equals(direction)) {
            Collections.reverse(overFetched);
        }
        return slice(overFetched, page, size);
    }

    /** Non-time sort: sort the whole reachable window, not just the page. */
    private List<LogEntryDto> sortedPage(String pipeline, long startNanos, long anchorNanos,
                                         int page, int size, int budget, String sort, boolean ascending) {
        // Always backward: the budget is a depth from the anchor, whichever way the column sorts.
        List<LogEntryDto> reachable = new ArrayList<>(window(pipeline, startNanos, anchorNanos, budget));
        reachable.sort(LogSort.comparator(logFields, sort, ascending));
        return slice(reachable, page, size);
    }

    private List<LogEntryDto> slice(List<LogEntryDto> entries, int page, int size) {
        return entries.stream()
                .skip((long) (page - 1) * size)
                .limit(size)
                .toList();
    }

    private int resolvePageSize(Integer pageSize) {
        if (pageSize == null || pageSize < 1) return DEFAULT_PAGE_SIZE;
        // A page bigger than the fetch budget would make every page number unreachable.
        return Math.min(pageSize, MAX_FETCH);
    }

    private long resolveStart(Long startTime, long now) {
        if (startTime == null) return now - 3600;
        if (startTime == 0) return now - scope.retentionSeconds();
        return startTime;
    }

    String buildPipeline(Set<LogKind> kinds, String query, String search) {
        return buildPipeline(kinds, query, search, null, false);
    }

    /** Keeps Loki's line filter only when the column's text appears in the line (see prefiltersLine). */
    String buildPipeline(Set<LogKind> kinds, String query, String search, String column, boolean errorsOnly) {
        return scope.pipeline(kinds, query, LogSearchField.prefiltersLine(logFields, column) ? search : null)
                + errorFilter(errorsOnly);
    }

    /** LogQL that keeps 4xx/5xx access records and every nginx error line, or "" when off. */
    private String errorFilter(boolean errorsOnly) {
        String statusPath = logFields.statusPath();
        if (!errorsOnly || statusPath == null) return "";
        // Regex, not >=: it can't fail on a missing status, so dropping the nginx lines' JSON error is safe.
        return " | json status=\"" + statusPath + "\""
                + " | log_type=\"" + LogKind.ERROR.param() + "\" or status=~\"[45][0-9][0-9]\""
                + " | drop __error__, __error_details__";
    }

    private int resolveLimit(Integer limit) {
        if (limit == null || limit < 1) return DEFAULT_LIMIT;
        return Math.min(limit, MAX_LIMIT);
    }

    // Numeric ts for sorting; namespace and kind come off the stream.
    private record RawLine(long tsNanos, String line, String namespace, LogKind streamKind) {}

    private List<LogEntryDto> parseStreams(String body, int limit) {
        List<RawLine> lines = new ArrayList<>();
        try {
            JsonNode result = objectMapper.readTree(body).path("data").path("result");
            for (JsonNode stream : result) {
                // Labels are per stream, so read namespace and kind once.
                String namespace = text(stream.path("stream").path(scope.namespaceLabel()));
                LogKind streamKind = streamKind(stream.path("stream"));
                for (JsonNode value : stream.path("values")) {
                    try {
                        lines.add(new RawLine(Long.parseLong(value.path(0).asText()),
                                value.path(1).asText(), namespace, streamKind));
                    } catch (NumberFormatException ignored) {
                        // a value pair without a usable timestamp is not a log line
                    }
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse Loki response: " + e.getMessage(), e);
        }
        // Loki sorts within a stream only.
        lines.sort(Comparator.comparingLong(RawLine::tsNanos).reversed());
        return lines.stream().limit(limit)
                .map(raw -> lineParser.parse(raw.tsNanos(), raw.line(), raw.namespace(), raw.streamKind()))
                .toList();
    }

    /** Access kind from the log_type label; MESSAGES if missing. */
    private LogKind streamKind(JsonNode labels) {
        LogKind kind = LogKind.fromParam(text(labels.path("log_type")));
        return (kind != null && kind.isAccessRecord()) ? kind : LogKind.MESSAGES;
    }
}
