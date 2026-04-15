package wearefrank.backend.service;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.springframework.stereotype.Service;
import wearefrank.backend.dto.RouteDto;
import wearefrank.backend.dto.YamlApisixConfig;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

@Service
public class YamlStoreService {

    private static final String REMOTE_PATH = "/tmp/";

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
                    YamlApisixConfig initial = new YamlApisixConfig("", "http://127.0.0.1", 9180, 9092, 9091, new ArrayList<>());
                    writeConfig(initial);
                }
            } catch (IOException e) {
                throw new RuntimeException("Could not create config file", e);
            }
        }
    }

    public void saveApisixConfig(String newKey, String host, int adminPort, int controlPort, int metricsPort) {
        YamlApisixConfig current = readConfig();
        YamlApisixConfig updated = new YamlApisixConfig(
                newKey,
                host,
                adminPort,
                controlPort,
                metricsPort,
                current.routes() != null ? current.routes() : new ArrayList<>()
        );
        writeConfig(updated);
    }

    public YamlApisixConfig getFullConfig() {
        return readConfig();
    }

    public String getApiSixKey() {
        return getFullConfig().adminKey();
    }

    public String getAdminUrl() {
        YamlApisixConfig config = getFullConfig();
        String host = config.host() != null ? config.host() : "http://127.0.0.1";
        int port = config.adminPort() != null ? config.adminPort() : 9180;
        return host + ":" + port;
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

    public List<RouteDto> getRoutes() {
        YamlApisixConfig config = readConfig();
        return config.routes() != null ? config.routes() : new ArrayList<>();
    }

    public void addRoute(RouteDto route) {
        YamlApisixConfig current = readConfig();
        ArrayList<RouteDto> routes = current.routes() != null ? current.routes() : new ArrayList<>();
        routes.add(route);

        YamlApisixConfig updated = new YamlApisixConfig(
                current.adminKey(),
                current.host(),
                current.adminPort(),
                current.controlPort(),
                current.metricsPort(),
                routes
        );
        writeConfig(updated);
    }

    public void deleteRoute(String routeId) {
        YamlApisixConfig current = readConfig();
        ArrayList<RouteDto> routes = current.routes() != null ? current.routes() : new ArrayList<>();

        routes.removeIf(r -> r.id().equals(routeId));

        YamlApisixConfig updated = new YamlApisixConfig(
                current.adminKey(),
                current.host(),
                current.adminPort(),
                current.controlPort(),
                current.metricsPort(),
                routes
        );
        writeConfig(updated);
    }
}