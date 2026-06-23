package wearefrank.backend.controller;

import org.springframework.web.bind.annotation.*;
import wearefrank.backend.dto.ConfigDto;
import wearefrank.backend.dto.YamlApisixConfig;
import wearefrank.backend.service.ApisixClient;
import wearefrank.backend.service.YamlStoreService;

@RestController
@RequestMapping("/api/config")
@CrossOrigin(origins = "http://localhost:5173")
public class ConfigController {

    private final YamlStoreService yamlStoreService;
    private final ApisixClient apisixClient;

    public ConfigController(YamlStoreService yamlStoreService, ApisixClient apisixClient) {
        this.yamlStoreService = yamlStoreService;
        this.apisixClient = apisixClient;
    }

    // apply null fallbacks so the frontend always gets a usable response even on a fresh install
    @GetMapping
    public ConfigDto.ApisixConfig getConfig() {
        YamlApisixConfig config = yamlStoreService.getFullConfig();
        return new ConfigDto.ApisixConfig(
                config.host() != null ? config.host() : "http://127.0.0.1",
                config.controlPort() != null ? config.controlPort() : 9882,
                config.metricsPort() != null ? config.metricsPort() : 9881
        );
    }

    @PostMapping
    public void saveConfig(@RequestBody ConfigDto.ApisixConfig config) {
        yamlStoreService.saveApisixConfig(config.host(), config.controlPort(), config.metricsPort());
    }

    // POST /check - tests a candidate config before saving, body carries the settings to test
    @PostMapping("/check")
    public boolean checkConnection(@RequestBody ConfigDto.ApisixConfig payload) {
        return apisixClient.checkControl(payload.host(), payload.controlPort());
    }

    // GET /check - tests the currently stored config, api=control (default) or api=metrics
    @GetMapping("/check")
    public boolean checkStoredConnection(@RequestParam(defaultValue = "control") String api) {
        YamlApisixConfig config = yamlStoreService.getFullConfig();
        String host = config.host() != null ? config.host() : "http://127.0.0.1";
        if ("metrics".equals(api)) {
            int port = config.metricsPort() != null ? config.metricsPort() : 9881;
            return apisixClient.checkMetrics(host, port);
        }
        int port = config.controlPort() != null ? config.controlPort() : 9882;
        return apisixClient.checkControl(host, port);
    }
}
