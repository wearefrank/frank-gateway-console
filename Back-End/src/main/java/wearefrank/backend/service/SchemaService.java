package wearefrank.backend.service;

import org.springframework.stereotype.Service;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;


@Service
public class SchemaService {

    private final YamlStoreService yamlStoreService;
    private final HttpClient httpClient;

    public SchemaService(YamlStoreService yamlStoreService, HttpClient httpClient) {
        this.yamlStoreService = yamlStoreService;
        this.httpClient = httpClient;
    }

    public String getRouteSchema() {
        String apiKey = yamlStoreService.getApiSixKey();
        String baseUrl = yamlStoreService.getApiSixUrl();

        if (baseUrl == null || baseUrl.isEmpty()) {
            throw new RuntimeException("APISIX URL is not configured");
        }

        if (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        }

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/apisix/admin/schema/route"))
                    .header("X-API-KEY", apiKey)
                    .timeout(java.time.Duration.ofSeconds(10))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                throw new RuntimeException("Failed to fetch schema from APISIX. Status code: " + response.statusCode());
            }

            return response.body();
        } catch (Exception e) {
            throw new RuntimeException("Error connecting to APISIX: " + e.getMessage(), e);
        }
    }

    public String getFullSchema() {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("http://127.0.0.1:9092/v1/schema"))
                    .timeout(java.time.Duration.ofSeconds(10))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                throw new RuntimeException("Failed to fetch schema from APISIX. Status code: " + response.statusCode());
            }

            return response.body();
        } catch (Exception e) {
            throw new RuntimeException("Error connecting to APISIX: " + e.getMessage(), e);
        }
    }
}
