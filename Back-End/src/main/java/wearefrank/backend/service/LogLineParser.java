package wearefrank.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import wearefrank.backend.dto.LogEntryDto;
import wearefrank.backend.dto.LogField;
import wearefrank.backend.dto.LogFieldType;
import wearefrank.backend.dto.LogFields;
import wearefrank.backend.dto.LogKind;

import java.time.Instant;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** Turns one Loki line into a table row, reading the fields declared in {@link LogFields}. */
@Component
public class LogLineParser {

    private final ObjectMapper objectMapper;
    private final LogFields logFields;

    public LogLineParser(ObjectMapper objectMapper, LogFields logFields) {
        this.objectMapper = objectMapper;
        this.logFields = logFields;
    }

    /** Shape decides the kind: JSON is an access record, anything else an nginx error line. */
    public LogEntryDto parse(long tsNanos, String line, String namespace, LogKind streamKind) {
        String timestamp = Instant.ofEpochSecond(tsNanos / 1_000_000_000L, tsNanos % 1_000_000_000L)
                .toString();
        String cursor = String.valueOf(tsNanos);

        JsonNode json;
        try {
            json = objectMapper.readTree(line);
        } catch (Exception e) {
            json = null;
        }
        return (json == null || !json.isObject())
                ? errorEntry(namespace, timestamp, cursor, line)
                : auditEntry(streamKind, namespace, timestamp, cursor, line, json);
    }

    /** Flattens the access record using the paths in {@link LogFields}. */
    private LogEntryDto auditEntry(LogKind kind, String namespace, String timestamp, String tsNanos,
                                   String line, JsonNode json) {
        Map<String, Object> fields = new HashMap<>();
        for (LogField field : logFields.fields()) {
            if (!field.fills(kind)) continue;
            for (String path : field.paths()) {
                String value = text(json.at("/" + path.replace('.', '/')));
                // First path that resolves wins - a later one is a fallback, not an override.
                if (value != null) {
                    fields.put(field.id(), coerce(field.type(), value));
                    break;
                }
            }
        }
        return entry(kind, namespace, timestamp, tsNanos, line, fields);
    }

    /** An nginx error line, or - when it matches nothing - its text kept as the message. */
    private LogEntryDto errorEntry(String namespace, String timestamp, String tsNanos, String line) {
        Map<String, String> parsed = NginxErrorLine.parse(line).asMap();
        Map<String, Object> fields = new HashMap<>();
        for (LogField field : logFields.fields()) {
            if (!field.fills(LogKind.ERROR)) continue;
            String value = parsed.get(field.errorSource());
            if (value != null) {
                fields.put(field.id(), coerce(field.type(), value));
            }
        }
        return entry(LogKind.ERROR, namespace, timestamp, tsNanos, line, fields);
    }

    private LogEntryDto entry(LogKind kind, String namespace, String timestamp, String tsNanos,
                              String line, Map<String, Object> fields) {
        return new LogEntryDto(kind.param(), namespace, timestamp, tsNanos, fields, line);
    }

    /** nginx vars arrive as strings ("200"), so parse by field type. */
    private Object coerce(LogFieldType type, String value) {
        return switch (type) {
            case STATUS -> integer(value);
            case DURATION -> millis(value);
            case LEVEL -> value.toUpperCase(Locale.ROOT);
            default -> value;
        };
    }

    private Integer integer(String value) {
        try {
            return Integer.valueOf(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** nginx gives seconds, comma-separated per upstream; take the first, in ms. */
    private Double millis(String value) {
        try {
            return Double.parseDouble(value.split(",")[0].trim()) * 1000;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** Also used by LogsService for stream labels. */
    static String text(JsonNode value) {
        if (value.isMissingNode() || value.isNull()) return null;
        String asText = value.asText();
        // nginx writes "-" for a variable that was never set on this request.
        return (asText.isEmpty() || "-".equals(asText)) ? null : asText;
    }
}
