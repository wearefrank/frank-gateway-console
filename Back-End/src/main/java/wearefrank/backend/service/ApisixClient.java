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

    public String adminGet(String path) {
        String url = yamlStoreService.getAdminUrl() + path;
        String key  = yamlStoreService.getApiSixKey();

        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .GET();

            if (key != null && !key.isBlank()) {
                builder.header("X-API-KEY", key);
            }

            HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                throw new RuntimeException("APISIX admin API returned " + response.statusCode() + " for " + path);
            }

            return response.body();
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Failed to reach APISIX admin API at " + url + ": " + e.getMessage(), e);
        }
    }

    public String metricsGet(String path) {
        String url = yamlStoreService.getMetricsUrl() + path;
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                throw new RuntimeException("Metrics endpoint returned " + response.statusCode() + " for " + path);
            }
            return response.body();
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Failed to reach metrics endpoint at " + url + ": " + e.getMessage(), e);
        }
    }

    public String controlGet(String path) {
        String url = yamlStoreService.getControlUrl() + path;

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                throw new RuntimeException("APISIX control API returned " + response.statusCode() + " for " + path);
            }

            return response.body();
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Failed to reach APISIX control API at " + url + ": " + e.getMessage(), e);
        }
    }

    public boolean isAdminReachable() {
        try {
            adminGet("/apisix/admin/routes");
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public boolean isControlReachable() {
        try {
            controlGet("/v1/healthcheck");
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public boolean checkAdmin(String host, int port, String key) {
        String url = host + ":" + port + "/apisix/admin/routes";
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .GET();
            if (key != null && !key.isBlank()) builder.header("X-API-KEY", key);
            return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString()).statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }

    public boolean checkControl(String host, int port) {
        String url = host + ":" + port + "/v1/schema";
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build();
            return httpClient.send(request, HttpResponse.BodyHandlers.ofString()).statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }

    public boolean checkMetrics(String host, int port) {
        String url = host + ":" + port + "/apisix/prometheus/metrics";
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build();
            return httpClient.send(request, HttpResponse.BodyHandlers.ofString()).statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }
}
