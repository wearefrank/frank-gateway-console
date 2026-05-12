package wearefrank.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import wearefrank.backend.dto.MetricsDto;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class MetricsService {

    private final ApisixClient apisixClient;
    private final PrometheusClient prometheusClient;
    private final ObjectMapper objectMapper;

    public MetricsService(ApisixClient apisixClient, PrometheusClient prometheusClient, ObjectMapper objectMapper) {
        this.apisixClient = apisixClient;
        this.prometheusClient = prometheusClient;
        this.objectMapper = objectMapper;
    }

    public String getHealthcheck() {
        return apisixClient.controlGet("/v1/healthcheck");
    }

    public Object getLiveRoutes() {
        try {
            return objectMapper.readValue(apisixClient.controlGet("/v1/routes"), Object.class);
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse live routes", e);
        }
    }

    public Object getLiveUpstreams() {
        try {
            return objectMapper.readValue(apisixClient.controlGet("/v1/upstreams"), Object.class);
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse live upstreams", e);
        }
    }

    public String prometheusQuery(String query) {
        return prometheusClient.query(query);
    }

    public String prometheusRangeQuery(String query) {
        long now = System.currentTimeMillis() / 1000;
        long start = now - 3600;
        return prometheusClient.rangeQuery(query, start, now, "60");
    }

    public String getPrometheusRaw() {
        return apisixClient.metricsGet("/apisix/prometheus/metrics");
    }

    public MetricsDto getPrometheusMetrics() {
        String raw = apisixClient.metricsGet("/apisix/prometheus/metrics");
        return parseMetrics(raw);
    }

    private MetricsDto parseMetrics(String raw) {
        long totalRequests = parseSimpleGauge(raw, "apisix_http_requests_total");
        Map<String, Long> connections = parseLabelledGauge(raw, "apisix_nginx_http_current_connections", "state");
        String version = parseLabelValue(raw, "apisix_node_info", "version");
        String hostname = parseLabelValue(raw, "apisix_node_info", "hostname");
        return new MetricsDto(totalRequests, connections, version, hostname);
    }

    private long parseSimpleGauge(String raw, String metricName) {
        Pattern p = Pattern.compile("^" + Pattern.quote(metricName) + "\\s+(\\S+)$", Pattern.MULTILINE);
        Matcher m = p.matcher(raw);
        if (m.find()) {
            try { return Long.parseLong(m.group(1).split("\\.")[0]); } catch (NumberFormatException ignored) {}
        }
        return 0;
    }

    private Map<String, Long> parseLabelledGauge(String raw, String metricName, String labelKey) {
        Map<String, Long> result = new HashMap<>();
        Pattern p = Pattern.compile(
                Pattern.quote(metricName) + "\\{[^}]*" + Pattern.quote(labelKey) + "=\"([^\"]+)\"[^}]*\\}\\s+(\\S+)",
                Pattern.MULTILINE
        );
        Matcher m = p.matcher(raw);
        while (m.find()) {
            try { result.put(m.group(1), Long.parseLong(m.group(2).split("\\.")[0])); } catch (NumberFormatException ignored) {}
        }
        return result;
    }

    private String parseLabelValue(String raw, String metricName, String labelKey) {
        Pattern p = Pattern.compile(
                Pattern.quote(metricName) + "\\{[^}]*" + Pattern.quote(labelKey) + "=\"([^\"]+)\"",
                Pattern.MULTILINE
        );
        Matcher m = p.matcher(raw);
        return m.find() ? m.group(1) : null;
    }
}
