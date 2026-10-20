package wearefrank.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import wearefrank.backend.dto.LogEntryDto;
import wearefrank.backend.dto.LogKind;
import wearefrank.backend.dto.TestLogFields;

import static org.assertj.core.api.Assertions.assertThat;

class LogLineParserTest {

    private final LogLineParser parser = new LogLineParser(new ObjectMapper(), TestLogFields.defaults());

    /**
     * One of the plugin's records, nested the way loki-logger.log_format in
     * config/apisix.yaml describes it - including the nginx variables arriving as strings.
     */
    private static final String ACCESS_LINE = """
            {"level":"INFO","timestamp":"2026-08-25T12:00:00+02:00","route_name":"system-b",\
            "source_addr":"172.18.0.4",\
            "request":{"request_method":"GET","request_path":"/anything/x","request_host":"apisix"},\
            "response":{"status":"200","upstream_latency_ms":"0.012",\
            "upstream_endpoint":{"address":"172.18.0.7:8080"}},\
            "audit":{"route_id":"12"}}""";

    /**
     * The other kind of line, captured off the gateway verbatim: nginx's own error log
     * format, with the plugin's whole configuration dumped into the middle of the message.
     * Kept intact because that blob is the hard part - it is full of commas, colons and
     * quoted keys, any of which a careless split of the trailing context would cut at.
     */
    private static final String ERROR_LINE = """
            2026/08/26 08:21:43 [info] 51#51: *5407 [lua] plugin.lua:898: conf_version(): \
            init plugin-level conf version: 2903643133, from {"_meta":[],"batch_max_size":1000,\
            "buffer_duration":60,"endpoint_addrs":["http://loki-gateway.monitoring.svc.cluster.local:80"],\
            "endpoint_uri":"/loki/api/v1/push","inactive_timeout":5,"include_req_body":false,\
            "include_resp_body":false,"keepalive":true,"keepalive_pool":5,"keepalive_timeout":60000,\
            "log_format":{"audit":{"route_id":"$route_id"},"gemeente_code":"TEST","level":"INFO",\
            "request":{"request_host":"$host","request_method":"$request_method","request_path":"$uri"},\
            "response":{"status":"$status","upstream_endpoint":{"address":"$upstream_addr",\
            "host":"$upstream_host","query":"$args","scheme":"$upstream_scheme","uri":"$upstream_uri"},\
            "upstream_latency_ms":"$upstream_response_time"},"route_name":"$route_name",\
            "source":"$http_x_forwarded_for","timestamp":"$time_iso8601"},"log_labels":{\
            "app_instance":"frank-gateway","app_name":"apisix","container":"apisix",\
            "instance":"wearefrank-gemeente-team-playground/frank-gateway:apisix","level":"INFO",\
            "log_type":"audit","namespace":"wearefrank-gemeente-team-playground","pod":"frank-gateway",\
            "service_name":"apisix"},"max_req_body_bytes":524288,"max_resp_body_bytes":524288,\
            "max_retry_count":0,"name":"loki logger","retry_delay":1,"ssl_verify":false,\
            "tenant_id":"local","timeout":3000} while logging request, client: 203.0.113.10, \
            server: _, request: "GET /test/anything HTTP/1.1", \
            upstream: "http://10.0.0.5:80/anything", \
            host: "gateway.example.org", \
            request_id: "d5ea29ea7e7f00b910d5e1e79e535cf9\"""";

    // 2023-11-14T22:13:20Z
    private static final long TS = 1_700_000_000_000_000_000L;

    private LogEntryDto parse(String line) {
        return parser.parse(TS, line, null, LogKind.MESSAGES);
    }

    private static Object field(LogEntryDto entry, String id) {
        return entry.fields().get(id);
    }

    // --- audit lines ---------------------------------------------------------------

    @Test
    void flattensNestedAccessLogLine() {
        LogEntryDto entry = parse(ACCESS_LINE);

        assertThat(entry.type()).isEqualTo("messages");
        assertThat(entry.timestamp()).isEqualTo("2023-11-14T22:13:20Z");
        assertThat(entry.tsNanos()).isEqualTo("1700000000000000000");
        assertThat(field(entry, "level")).isEqualTo("INFO");
        assertThat(field(entry, "routeName")).isEqualTo("system-b");
        assertThat(field(entry, "method")).isEqualTo("GET");
        assertThat(field(entry, "path")).isEqualTo("/anything/x");
        assertThat(field(entry, "host")).isEqualTo("apisix");
        assertThat(field(entry, "status")).isEqualTo(200);
        assertThat(field(entry, "source")).isEqualTo("172.18.0.4");
        assertThat(field(entry, "upstream")).isEqualTo("172.18.0.7:8080");
    }

    /** The error-only fields stay empty rather than being filled with something plausible. */
    @Test
    void leavesTheErrorFieldsEmptyOnAnAuditLine() {
        LogEntryDto entry = parse(ACCESS_LINE);
        assertThat(field(entry, "message")).isNull();
        assertThat(field(entry, "module")).isNull();
        assertThat(field(entry, "requestId")).isNull();
    }

    @Test
    void convertsUpstreamResponseTimeFromSecondsToMillis() {
        assertThat(field(parse(ACCESS_LINE), "latencyMs")).isEqualTo(12.0);
    }

    @Test
    void takesFirstHop_whenLatencyListsSeveralUpstreams() {
        String line = ACCESS_LINE.replace("\"upstream_latency_ms\":\"0.012\"",
                                          "\"upstream_latency_ms\":\"0.012, 0.500\"");

        assertThat(field(parse(line), "latencyMs")).isEqualTo(12.0);
    }

    @Test
    void leavesFieldsNull_whenNginxWroteADash() {
        String line = ACCESS_LINE
                .replace("\"upstream_latency_ms\":\"0.012\"", "\"upstream_latency_ms\":\"-\"")
                .replace("\"address\":\"172.18.0.7:8080\"", "\"address\":\"-\"");

        LogEntryDto entry = parse(line);
        assertThat(field(entry, "latencyMs")).isNull();
        assertThat(field(entry, "upstream")).isNull();
        assertThat(field(entry, "status")).isEqualTo(200);
    }

    /**
     * The production log_format fills `source` from $http_x_forwarded_for and never writes
     * source_addr - that field only exists in the compose config, which adds it because
     * APISIX leaves the forwarded header empty on its image. Reading only one of the two
     * left the Source column blank against a real gateway.
     */
    @Test
    void readsTheCallerAddressFromEitherSourceField() {
        String forwardedOnly = ACCESS_LINE.replace("\"source_addr\":\"172.18.0.4\"",
                                                   "\"source\":\"81.30.4.7\"");

        assertThat(field(parse(forwardedOnly), "source")).isEqualTo("81.30.4.7");
    }

    @Test
    void prefersSourceOverSourceAddr_whenBothArePresent() {
        String both = ACCESS_LINE.replace("\"source_addr\":\"172.18.0.4\"",
                                          "\"source\":\"81.30.4.7\",\"source_addr\":\"172.18.0.4\"");

        assertThat(field(parse(both), "source")).isEqualTo("81.30.4.7");
    }

    @Test
    void readsTheTenantOutOfGemeenteCode() {
        String line = ACCESS_LINE.replace("{\"level\":\"INFO\"", "{\"gemeente_code\":\"TEST\",\"level\":\"INFO\"");

        assertThat(field(parse(line), "gemeenteCode")).isEqualTo("TEST");
    }

    /** An unnamed route shows its id; some formats write it at the top level instead of under audit. */
    @Test
    void fallsBackToATopLevelRouteId() {
        String line = ACCESS_LINE
                .replace("\"route_name\":\"system-b\",", "")
                .replace(",\"audit\":{\"route_id\":\"12\"}", ",\"route_id\":\"arr_1\"");

        assertThat(field(parse(line), "routeName")).isEqualTo("arr_1");
    }

    /**
     * What the running gateway actually emits: loki-logger writes $status and
     * $upstream_response_time as JSON numbers, not the quoted strings the log_format's
     * "$status" template suggests. Both forms have to parse - a captured line from the
     * compose stack, verbatim.
     */
    @Test
    void readsStatusAndLatency_whenEmittedAsJsonNumbers() {
        String line = """
                {"level":"INFO","response":{"upstream_latency_ms":0.001,"status":200,                "upstream_endpoint":{"scheme":"http","address":"172.18.0.7:8080",                "host":"system-a-mock:8080","uri":"/anything/messages/974"}},                "audit":{"route_id":"system-b-to-system-a-route"},                "request":{"request_method":"GET","request_path":"/system-b/system-a/messages/974",                "request_host":"apisix"},"route_id":"system-b-to-system-a-route",                "timestamp":"2026-08-25T09:54:32+00:00","gemeente_code":"0000",                "source_addr":"172.18.0.9","route_name":"system-b-to-system-a-route"}""";

        LogEntryDto entry = parse(line);
        assertThat(field(entry, "status")).isEqualTo(200);
        // 0.001 seconds, so 1ms - not 0.001ms, whatever the field is called.
        assertThat(field(entry, "latencyMs")).isEqualTo(1.0);
        assertThat(field(entry, "routeName")).isEqualTo("system-b-to-system-a-route");
        assertThat(field(entry, "method")).isEqualTo("GET");
        assertThat(field(entry, "path")).isEqualTo("/system-b/system-a/messages/974");
        assertThat(field(entry, "upstream")).isEqualTo("172.18.0.7:8080");
        assertThat(field(entry, "source")).isEqualTo("172.18.0.9");
        assertThat(field(entry, "gemeenteCode")).isEqualTo("0000");
    }

    // --- error lines ---------------------------------------------------------------

    /** Everything nginx appended has to survive the plugin configuration sitting in front of it. */
    @Test
    void takesApartAnNginxErrorLine() {
        LogEntryDto entry = parse(ERROR_LINE);

        assertThat(entry.type()).isEqualTo("error");
        assertThat(field(entry, "level")).isEqualTo("INFO");
        assertThat(field(entry, "module")).isEqualTo("[lua] plugin.lua:898");
        assertThat((String) field(entry, "message"))
                .startsWith("conf_version(): init plugin-level conf version: 2903643133")
                .endsWith("while logging request");
        assertThat(field(entry, "source")).isEqualTo("203.0.113.10");
        assertThat(field(entry, "method")).isEqualTo("GET");
        assertThat(field(entry, "path")).isEqualTo("/test/anything");
        assertThat(field(entry, "host")).isEqualTo("gateway.example.org");
        assertThat(field(entry, "upstream")).isEqualTo("http://10.0.0.5:80/anything");
        assertThat(field(entry, "requestId")).isEqualTo("d5ea29ea7e7f00b910d5e1e79e535cf9");
        assertThat(entry.raw()).isEqualTo(ERROR_LINE);
    }

    /** No response was logged, so the access log's columns stay empty rather than zeroed. */
    @Test
    void leavesTheAuditFieldsEmptyOnAnErrorLine() {
        LogEntryDto entry = parse(ERROR_LINE);
        assertThat(field(entry, "status")).isNull();
        assertThat(field(entry, "latencyMs")).isNull();
        assertThat(field(entry, "routeName")).isNull();
        assertThat(field(entry, "gemeenteCode")).isNull();
    }

    /**
     * The line is read by its shape, not by the stream it was selected from. APISIX puts
     * the odd error line into the access stream, and one rendered against the audit columns
     * is a row of nothing.
     */
    @Test
    void readsAnErrorLineFoundInTheAuditStream() {
        assertThat(parser.parse(TS, ERROR_LINE, null, LogKind.AUDIT).type()).isEqualTo("error");
    }

    /** Anything that is neither shape keeps its text as the message, not an empty row. */
    @Test
    void keepsAnUnrecognisedLine_asTheMessage() {
        LogEntryDto entry = parse("plain error text");

        assertThat(entry.type()).isEqualTo("error");
        assertThat(field(entry, "message")).isEqualTo("plain error text");
        assertThat(entry.raw()).isEqualTo("plain error text");
        assertThat(field(entry, "level")).isNull();
        assertThat(field(entry, "status")).isNull();
        assertThat(entry.timestamp()).isEqualTo("2023-11-14T22:13:20Z");
    }

    @Test
    void takesTheAccessKindItIsGiven() {
        assertThat(parser.parse(TS, ACCESS_LINE, null, LogKind.AUDIT).type()).isEqualTo("audit");
    }

    @Test
    void carriesTheNamespaceThrough() {
        assertThat(parser.parse(TS, ACCESS_LINE, "team-a", LogKind.MESSAGES).namespace()).isEqualTo("team-a");
    }
}
