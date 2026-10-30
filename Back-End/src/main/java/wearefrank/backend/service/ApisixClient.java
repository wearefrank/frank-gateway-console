package wearefrank.backend.service;

import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

@Service
public class ApisixClient {

    private final YamlStoreService yamlStoreService;
    private final HttpClient httpClient;

    public ApisixClient(YamlStoreService yamlStoreService, HttpClient httpClient) {
        this.yamlStoreService = yamlStoreService;
        this.httpClient = httpClient;
    }

    // reads from the Prometheus-compatible metrics port
    public String metricsGet(String path) {
        return get(yamlStoreService.getMetricsUrl(), path, "metrics endpoint");
    }

    // reads from the APISIX control API - used for schema, routes, upstreams, health
    public String controlGet(String path) {
        return get(yamlStoreService.getControlUrl(), path, "APISIX control API");
    }

    // status methods - used by the config controller to test connectivity before saving settings
    // they return false instead of throwing so the UI can show a "offline" indicator gracefully

    public boolean checkControl(String host, int port) {
        return isUp(host + ":" + port + "/v1/schema");
    }

    public boolean checkMetrics(String host, int port) {
        return isUp(host + ":" + port + "/apisix/prometheus/metrics");
    }

    private HttpResponse<String> send(String url) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(10))
                .GET()
                .build();
        return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private String get(String baseUrl, String path, String what) {
        String url = baseUrl + path;
        HttpResponse<String> response;
        try {
            response = send(url);
        } catch (Exception e) {
            throw new RuntimeException("Failed to reach " + what + " at " + url + ": " + e.getMessage(), e);
        }
        if (response.statusCode() != 200) {
            throw new RuntimeException("The " + what + " returned " + response.statusCode() + " for " + path);
        }
        return response.body();
    }

    private boolean isUp(String url) {
        try {
            return send(url).statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }
}
