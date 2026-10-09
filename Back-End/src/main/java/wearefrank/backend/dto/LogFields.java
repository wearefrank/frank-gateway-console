package wearefrank.backend.dto;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Log fields from log-fields.yaml (LOG_FIELDS_FILE overrides); list order is column order. */
@ConfigurationProperties("logs")
public record LogFields(List<LogField> fields) {

    /** LogEntryDto keys that describe the line, not its contents; reserved as ids. */
    public static final Set<String> STRUCTURAL =
            Set.of("type", "namespace", "timestamp", "tsNanos", "raw");

    /** What {@code NginxErrorLine.asMap} can supply - {@code LogFieldsTest} holds the two together. */
    public static final Set<String> ERROR_SOURCES = Set.of(
            "level", "module", "message", "client", "method", "path",
            "protocol", "host", "upstream", "requestId");

    /** Checked at startup, so a typo in the file stops the app instead of emptying a column. */
    public LogFields {
        fields = fields == null ? List.of() : List.copyOf(fields);
        Set<String> seen = new HashSet<>();
        for (LogField field : fields) {
            if (field.id() == null || field.id().isBlank()) {
                throw new IllegalArgumentException("logs.fields: every field needs an id");
            }
            if (STRUCTURAL.contains(field.id())) {
                throw new IllegalArgumentException("logs.fields: '" + field.id()
                        + "' is reserved - it comes off the Loki stream, not the line");
            }
            if (!seen.add(field.id())) {
                throw new IllegalArgumentException("logs.fields: '" + field.id() + "' is declared twice");
            }
            if (field.errorSource() != null && !ERROR_SOURCES.contains(field.errorSource())) {
                throw new IllegalArgumentException("logs.fields: '" + field.id() + "' has error-source '"
                        + field.errorSource() + "', expected one of " + ERROR_SOURCES);
            }
        }
    }

    /** Columns for these kinds; a column starts visible if any kind shows it. */
    public List<LogFieldDto> describe(Set<LogKind> kinds) {
        return fields.stream()
                .filter(LogField::hasColumn)
                .map(field -> new LogFieldDto(
                        field.id(),
                        field.label(),
                        field.type(),
                        !Collections.disjoint(field.visibleFor(), kinds),
                        field.alignRight() ? "right" : null))
                .toList();
    }

    /** Whether this id draws a column - what sort and search accept. */
    public boolean isColumn(String id) {
        return fields.stream().anyMatch(field -> field.hasColumn() && field.id().equals(id));
    }

    /** The field's type, or TEXT for an id that is not a field (namespace, say). */
    public LogFieldType typeOf(String id) {
        return fields.stream()
                .filter(field -> field.id().equals(id))
                .map(LogField::type)
                .findFirst()
                .orElse(LogFieldType.TEXT);
    }

    /** First path of the first STATUS field, or null. */
    public String statusPath() {
        return fields.stream()
                .filter(field -> field.type() == LogFieldType.STATUS && !field.paths().isEmpty())
                .map(field -> field.paths().get(0))
                .findFirst()
                .orElse(null);
    }
}
