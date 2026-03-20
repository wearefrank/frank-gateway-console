package wearefrank.backend.controller;

import org.springframework.web.bind.annotation.*;
import wearefrank.backend.dto.RouteDto;
import wearefrank.backend.service.YamlStoreService;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/routes")
@CrossOrigin(origins = "http://localhost:5173")
public class RouteController {

    private final YamlStoreService yamlStoreService;
    private final HttpClient httpClient;

    public RouteController(YamlStoreService yamlStoreService, HttpClient httpClient) {
        this.yamlStoreService = yamlStoreService;
        this.httpClient = httpClient;
    }

    @GetMapping("/saved")
    public List<RouteDto> getAllRoutes() {
        return yamlStoreService.getRoutes();
    }

    @GetMapping("/live")
    public String getLiveRoutes() {
        String apiKey = yamlStoreService.getApiSixKey();
        String baseUrl = yamlStoreService.getApiSixUrl();

        if (baseUrl == null || baseUrl.isEmpty()) {
            baseUrl = "http://127.0.0.1:9180";
        }

        if (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        }

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/apisix/admin/routes"))
                    .header("X-API-KEY", apiKey)
                    .timeout(java.time.Duration.ofSeconds(10))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient
                    .send(request, HttpResponse.BodyHandlers.ofString());

            return response.body();
        } catch (Exception e) {
            throw new RuntimeException("Failed to connect to APISIX: " + e.getMessage());
        }
    }

    @PostMapping
    public RouteDto createRoute(@RequestBody RouteDto incomingData) {
        String id = incomingData.id() != null ? incomingData.id() : UUID.randomUUID().toString();
        
        RouteDto newRoute = new RouteDto(
                id,
                incomingData.uri(),
                incomingData.name(),
                incomingData.methods(),
                incomingData.host(),
                incomingData.hosts(),
                incomingData.upstreamId(),
                incomingData.upstream(),
                incomingData.plugins(),
                incomingData.priority(),
                incomingData.status() != null ? incomingData.status() : 1
        );

        yamlStoreService.addRoute(newRoute);
        return newRoute;
    }

    @DeleteMapping
    public void deleteRoute(@RequestBody RouteDto.DeleteRequest deleteRequest) {
        yamlStoreService.deleteRoute(deleteRequest.id());
    }
}