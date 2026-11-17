package wearefrank.backend.controller;

import org.springframework.web.bind.annotation.*;
import wearefrank.backend.dto.YamlApisixConfig;
import wearefrank.backend.service.ApisixClient;
import wearefrank.backend.service.YamlStoreService;

@RestController
@RequestMapping("/api/config")
public class ConfigController {

    private final YamlStoreService yamlStoreService;
    private final ApisixClient apisixClient;

    public ConfigController(YamlStoreService yamlStoreService, ApisixClient apisixClient) {
        this.yamlStoreService = yamlStoreService;
        this.apisixClient = apisixClient;
    }

    @GetMapping
    public YamlApisixConfig getConfig() {
        return yamlStoreService.getConfig();
    }

    @PostMapping
    public void saveConfig(@RequestBody YamlApisixConfig config) {
        yamlStoreService.saveApisixConfig(config.host(), config.controlPort(), config.metricsPort());
    }

    // POST /check - tests a candidate config before saving, body carries the settings to test
    @PostMapping("/check")
    public boolean checkConnection(@RequestBody YamlApisixConfig payload) {
        return apisixClient.checkControl(payload.host(), payload.controlPort());
    }

    // GET /check - tests the currently stored config, api=control (default) or api=metrics
    @GetMapping("/check")
    public boolean checkStoredConnection(@RequestParam(defaultValue = "control") String api) {
        YamlApisixConfig config = yamlStoreService.getConfig();
        if ("metrics".equals(api)) return apisixClient.checkMetrics(config.host(), config.metricsPort());
        return apisixClient.checkControl(config.host(), config.controlPort());
    }
}
