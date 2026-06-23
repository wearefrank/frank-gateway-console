package wearefrank.backend.controller;

import org.springframework.beans.factory.annotation.Value;
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
    private final String defaultHost;
    private final int defaultControlPort;
    private final int defaultMetricsPort;

    public ConfigController(
            YamlStoreService yamlStoreService,
            ApisixClient apisixClient,
            @Value("${apisix.default.host}") String defaultHost,
            @Value("${apisix.default.control-port}") int defaultControlPort,
            @Value("${apisix.default.metrics-port}") int defaultMetricsPort
    ) {
        this.yamlStoreService = yamlStoreService;
        this.apisixClient = apisixClient;
        this.defaultHost = defaultHost;
        this.defaultControlPort = defaultControlPort;
        this.defaultMetricsPort = defaultMetricsPort;
    }

    // apply null fallbacks so the frontend always gets a usable response even on a fresh install
    @GetMapping
    public ConfigDto.ApisixConfig getConfig() {
        YamlApisixConfig config = yamlStoreService.getFullConfig();
        return new ConfigDto.ApisixConfig(
                config.host() != null ? config.host() : defaultHost,
                config.controlPort() != null ? config.controlPort() : defaultControlPort,
                config.metricsPort() != null ? config.metricsPort() : defaultMetricsPort
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
        String host = config.host() != null ? config.host() : defaultHost;
        if ("metrics".equals(api)) {
            int port = config.metricsPort() != null ? config.metricsPort() : defaultMetricsPort;
            return apisixClient.checkMetrics(host, port);
        }
        int port = config.controlPort() != null ? config.controlPort() : defaultControlPort;
        return apisixClient.checkControl(host, port);
    }
}
