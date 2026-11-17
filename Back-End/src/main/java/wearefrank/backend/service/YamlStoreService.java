package wearefrank.backend.service;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import wearefrank.backend.dto.YamlApisixConfig;

import java.io.File;
import java.io.IOException;

@Service
public class YamlStoreService {

    private final File file;
    private final YamlApisixConfig defaults;
    private final ObjectMapper mapper = new ObjectMapper(new YAMLFactory())
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    public YamlStoreService(
            @Value("${apisix.config.file:apisix_config.yaml}") String configFilePath,
            @Value("${apisix.default.host}") String defaultHost,
            @Value("${apisix.default.control-port}") int defaultControlPort,
            @Value("${apisix.default.metrics-port}") int defaultMetricsPort) {
        this.file = new File(configFilePath);
        this.defaults = new YamlApisixConfig(defaultHost, defaultControlPort, defaultMetricsPort);
        ensureConfigExist();
    }

    private YamlApisixConfig readConfig() {
        try {
            return mapper.readValue(file, YamlApisixConfig.class);
        } catch (IOException e) {
            throw new RuntimeException("Failed to read YAML", e);
        }
    }

    private void writeConfig(YamlApisixConfig config) {
        try {
            mapper.writeValue(file, config);
        } catch (IOException e) {
            throw new RuntimeException("Failed to write YAML", e);
        }
    }

    // Seeded once; the APISIX_* environment variables only count here, after that the saved settings win.
    public void ensureConfigExist() {
        if (file.exists()) return;
        try {
            if (file.createNewFile()) {
                writeConfig(new YamlApisixConfig(
                        System.getenv().getOrDefault("APISIX_HOST", defaults.host()),
                        Integer.parseInt(System.getenv().getOrDefault("APISIX_CONTROL_PORT", String.valueOf(defaults.controlPort()))),
                        Integer.parseInt(System.getenv().getOrDefault("APISIX_METRICS_PORT", String.valueOf(defaults.metricsPort())))));
            }
        } catch (IOException e) {
            throw new RuntimeException("Could not create config file", e);
        }
    }

    public void saveApisixConfig(String host, int controlPort, int metricsPort) {
        writeConfig(new YamlApisixConfig(host, controlPort, metricsPort));
    }

    // The saved settings, with any field an older file lacks filled from the defaults.
    public YamlApisixConfig getConfig() {
        YamlApisixConfig config = readConfig();
        return new YamlApisixConfig(
                config.host() != null ? config.host() : defaults.host(),
                config.controlPort() != null ? config.controlPort() : defaults.controlPort(),
                config.metricsPort() != null ? config.metricsPort() : defaults.metricsPort());
    }

    public String getControlUrl() {
        YamlApisixConfig config = getConfig();
        return config.host() + ":" + config.controlPort();
    }

    public String getMetricsUrl() {
        YamlApisixConfig config = getConfig();
        return config.host() + ":" + config.metricsPort();
    }
}
