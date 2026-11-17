package wearefrank.backend.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import wearefrank.backend.dto.YamlApisixConfig;
import wearefrank.backend.service.ApisixClient;
import wearefrank.backend.service.YamlStoreService;

import java.util.Map;

// Public liveness check for APISIX, kept out of /actuator/health so a down gateway never marks the console itself down.
@RestController
public class ApisixHealthController {

    private final YamlStoreService yamlStoreService;
    private final ApisixClient apisixClient;

    public ApisixHealthController(YamlStoreService yamlStoreService, ApisixClient apisixClient) {
        this.yamlStoreService = yamlStoreService;
        this.apisixClient = apisixClient;
    }

    @GetMapping("/api/health/apisix")
    public ResponseEntity<Map<String, String>> apisixHealth() {
        YamlApisixConfig config = yamlStoreService.getConfig();
        if (apisixClient.checkControl(config.host(), config.controlPort())) {
            return ResponseEntity.ok(Map.of("status", "UP"));
        }
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("status", "DOWN"));
    }
}
