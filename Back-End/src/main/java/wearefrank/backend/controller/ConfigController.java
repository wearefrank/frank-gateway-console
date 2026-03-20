package wearefrank.backend.controller;

import org.springframework.web.bind.annotation.*;
import wearefrank.backend.dto.ConfigDto;
import wearefrank.backend.dto.YamlApisixConfig;
import wearefrank.backend.service.YamlStoreService;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

@RestController
@RequestMapping("/api/config")
@CrossOrigin(origins = "http://localhost:5173")
public class ConfigController {

    private final YamlStoreService yamlStoreService;
    private final HttpClient httpClient;

    public ConfigController(YamlStoreService yamlStoreService, HttpClient httpClient) {
        this.yamlStoreService = yamlStoreService;
        this.httpClient = httpClient;
    }

    @GetMapping
    public ConfigDto.ApisixConfig getConfig() {
        YamlApisixConfig config = yamlStoreService.getFullConfig();
        return new ConfigDto.ApisixConfig(
                config.adminKey() != null ? config.adminKey() : "",
                config.adminUrl() != null ? config.adminUrl() : ""
        );
    }

    @PostMapping
    public void saveConfig(@RequestBody ConfigDto.ApisixConfig config) {
        yamlStoreService.saveApisixConfig(config.key(), config.url());
    }

    @PostMapping("/check")
    public boolean checkConnection(@RequestBody ConfigDto.ApisixConfig payload) {
        String key = payload.key();
        String url = payload.url();

        if (url == null || url.isBlank()) return false;

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url + "/apisix/admin/routes"))
                    .header("X-API-KEY", key)
                    .timeout(java.time.Duration.ofSeconds(10))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient
                    .send(request, HttpResponse.BodyHandlers.ofString());

            return response.statusCode() == 200;
        } catch (Exception e) {
            System.err.println("Connection check failed: " + e.getMessage());
            return false;
        }
    }
}