package wearefrank.backend.service;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.springframework.stereotype.Service;
import wearefrank.backend.dto.YamlApisixConfig;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;

@Service
public class YamlStoreService {

    private final File file = new File("apisix_config.yaml");
    private final ObjectMapper mapper = new ObjectMapper(new YAMLFactory())
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    public YamlStoreService() {
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

    public void ensureConfigExist() {
        if (!file.exists()) {
            try {
                boolean created = file.createNewFile();
                if (created) {
                    YamlApisixConfig initial = new YamlApisixConfig("http://127.0.0.1", 9092, 9091, new ArrayList<>());
                    writeConfig(initial);
                }
            } catch (IOException e) {
                throw new RuntimeException("Could not create config file", e);
            }
        }
    }

    public void saveApisixConfig(String host, int controlPort, int metricsPort) {
        YamlApisixConfig current = readConfig();
        YamlApisixConfig updated = new YamlApisixConfig(
                host,
                controlPort,
                metricsPort,
                current.routes() != null ? current.routes() : new ArrayList<>()
        );
        writeConfig(updated);
    }

    public YamlApisixConfig getFullConfig() {
        return readConfig();
    }

    public String getControlUrl() {
        YamlApisixConfig config = getFullConfig();
        String host = config.host() != null ? config.host() : "http://127.0.0.1";
        int port = config.controlPort() != null ? config.controlPort() : 9092;
        return host + ":" + port;
    }

    public String getMetricsUrl() {
        YamlApisixConfig config = getFullConfig();
        String host = config.host() != null ? config.host() : "http://127.0.0.1";
        int port = config.metricsPort() != null ? config.metricsPort() : 9091;
        return host + ":" + port;
    }

}
