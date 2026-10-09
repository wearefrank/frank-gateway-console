package wearefrank.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import wearefrank.backend.dto.LogField;
import wearefrank.backend.dto.LogFieldType;
import wearefrank.backend.dto.LogFields;
import wearefrank.backend.dto.LogKind;
import wearefrank.backend.dto.TestLogFields;

import java.io.IOException;
import java.lang.reflect.RecordComponent;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Holds the shipped log-fields.yaml against the log format it reads, and checks that a bad
 * file stops startup instead of silently emptying a column.
 */
class LogFieldsTest {

    /** The repo's apisix.yaml, from the Back-End module surefire runs in. */
    private static final Path APISIX_CONFIG = Path.of("..", "config", "apisix.yaml");

    private static final LogFields DEFAULTS = TestLogFields.defaults();

    @Test
    @DisplayName("the shipped file binds, in column order")
    void defaultsBind() {
        assertThat(DEFAULTS.fields()).extracting(LogField::id)
                .startsWith("level", "routeName", "method", "path");
        assertThat(DEFAULTS.typeOf("latencyMs")).isEqualTo(LogFieldType.DURATION);
        assertThat(DEFAULTS.statusPath()).isEqualTo("response.status");
    }

    @Test
    @DisplayName("every path still resolves in the gateway's log_format")
    void pathsExistInTheLogFormat() throws IOException {
        JsonNode logFormat = logFormat();

        for (LogField field : DEFAULTS.fields()) {
            if (field.paths().isEmpty()) continue;
            // At least one, not all: the later paths are fallbacks.
            boolean resolved = field.paths().stream().anyMatch(path -> resolves(logFormat, path));
            assertTrue(resolved, () -> "No path of " + field.id() + " resolves in log_format - tried "
                    + field.paths() + ". Either the log format renamed a key, or log-fields.yaml "
                    + "needs its path updated.");
        }
    }

    @Test
    @DisplayName("ERROR_SOURCES is exactly NginxErrorLine's components")
    void errorSourcesMatchTheParsedLine() {
        Set<String> components = Arrays.stream(NginxErrorLine.class.getRecordComponents())
                .map(RecordComponent::getName)
                .collect(Collectors.toSet());
        assertEquals(components, LogFields.ERROR_SOURCES);
    }

    @Test
    @DisplayName("a column that starts open is one its own kind actually fills")
    void defaultVisibleColumnsAreFilled() {
        for (LogField field : DEFAULTS.fields()) {
            assertTrue(field.fills(LogKind.MESSAGES) || field.fills(LogKind.ERROR),
                    field.id() + " declares neither a path nor an error source");
            for (LogKind kind : field.visibleFor()) {
                assertTrue(field.fills(kind),
                        field.id() + " starts open on the " + kind.param() + " table but nothing fills it there");
            }
        }
    }

    @Test
    @DisplayName("a custom file adds its own column")
    void customFileBinds() {
        LogFields custom = TestLogFields.fromYaml("""
                logs:
                  fields:
                    - id: userAgent
                      label: User agent
                      type: MUTED
                      paths: [request.headers.user-agent]
                      visible-for: [MESSAGES]
                """);

        assertThat(custom.fields()).hasSize(1);
        assertThat(custom.describe(Set.of(LogKind.MESSAGES)))
                .singleElement()
                .satisfies(dto -> {
                    assertThat(dto.id()).isEqualTo("userAgent");
                    assertThat(dto.label()).isEqualTo("User agent");
                    assertThat(dto.defaultVisible()).isTrue();
                });
        assertThat(custom.statusPath()).isNull();
    }

    @Test
    @DisplayName("the repo's config/ copies bind too")
    void repoExamplesBind() throws IOException {
        LogFields compose = TestLogFields.fromYaml(Files.readString(Path.of("..", "config", "log-fields.yaml")));
        assertEquals(DEFAULTS, compose, "config/log-fields.yaml drifted from the built-in defaults");

        // The ConfigMap's embedded file, out of the first document of the k8s example.
        JsonNode configMap = new ObjectMapper(new YAMLFactory())
                .readTree(Files.readString(Path.of("..", "config", "log-fields-k8s-example.yaml")));
        LogFields k8s = TestLogFields.fromYaml(configMap.path("data").path("log-fields.yaml").asText());
        assertThat(k8s.fields()).extracting(LogField::id).contains("route", "status", "userAgent");
        assertThat(k8s.statusPath()).isEqualTo("status");
    }

    @Test
    @DisplayName("a duplicate id, a reserved id or an unknown error source refuses to start")
    void badFilesAreRejected() {
        LogField route = new LogField("route", "Route", null, List.of("route_name"), null, null);

        assertThatThrownBy(() -> new LogFields(List.of(route, route)))
                .hasMessageContaining("declared twice");
        assertThatThrownBy(() -> new LogFields(List.of(
                new LogField("timestamp", "Time", null, List.of("t"), null, null))))
                .hasMessageContaining("reserved");
        assertThatThrownBy(() -> new LogFields(List.of(
                new LogField("x", "X", null, List.of(), "nope", null))))
                .hasMessageContaining("error-source");
    }

    /** plugins.loki-logger.log_format, off whichever global rule carries the plugin. */
    private JsonNode logFormat() throws IOException {
        assertTrue(Files.exists(APISIX_CONFIG),
                "Expected the gateway config at " + APISIX_CONFIG.toAbsolutePath());

        ObjectMapper yaml = new ObjectMapper(new YAMLFactory());
        JsonNode root = yaml.readTree(Files.readString(APISIX_CONFIG));

        for (JsonNode rule : root.path("global_rules")) {
            JsonNode format = rule.path("plugins").path("loki-logger").path("log_format");
            if (format.isObject()) return format;
        }
        throw new AssertionError(
                "No global rule in " + APISIX_CONFIG + " carries plugins.loki-logger.log_format");
    }

    private boolean resolves(JsonNode root, String path) {
        JsonNode node = root;
        for (String segment : path.split("\\.")) {
            node = node.path(segment);
        }
        return !node.isMissingNode();
    }
}
