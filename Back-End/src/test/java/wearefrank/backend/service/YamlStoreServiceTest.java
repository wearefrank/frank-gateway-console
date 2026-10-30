package wearefrank.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import wearefrank.backend.dto.YamlApisixConfig;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class YamlStoreServiceTest {

    @TempDir
    Path tempDir;

    private File testFile;
    private YamlStoreService service;

    @BeforeEach
    void setUp() {
        testFile = tempDir.resolve("apisix_config.yaml").toFile();
        service = new YamlStoreService(testFile.getAbsolutePath(), "http://127.0.0.1", 9882, 9881);
    }

    private void writeRaw(YamlApisixConfig config) throws Exception {
        new ObjectMapper(new YAMLFactory()).writeValue(testFile, config);
    }

    @Test
    void ensureConfigExist_createsFileWithDefaults_whenFileAbsent() {
        YamlApisixConfig config = service.getConfig();

        assertThat(testFile).exists();
        assertThat(config.host()).isEqualTo("http://127.0.0.1");
        assertThat(config.controlPort()).isEqualTo(9882);
        assertThat(config.metricsPort()).isEqualTo(9881);
    }

    @Test
    void ensureConfigExist_doesNotOverwrite_existingFile() {
        service.saveApisixConfig("http://custom", 1234, 5678);

        service.ensureConfigExist();

        assertThat(service.getConfig().host()).isEqualTo("http://custom");
        assertThat(service.getConfig().controlPort()).isEqualTo(1234);
    }

    @Test
    void getConfig_fillsMissingFieldsFromTheDefaults() throws Exception {
        writeRaw(new YamlApisixConfig(null, null, null));

        assertThat(service.getConfig()).isEqualTo(new YamlApisixConfig("http://127.0.0.1", 9882, 9881));
    }

    @Test
    void getConfig_ignoresTheRoutesListOlderFilesCarry() throws Exception {
        Files.writeString(testFile.toPath(), "host: http://old\ncontrolPort: 1\nmetricsPort: 2\nroutes: []\n");

        assertThat(service.getConfig()).isEqualTo(new YamlApisixConfig("http://old", 1, 2));
    }

    @Test
    void getControlUrl_returnsHostColonControlPort() {
        service.saveApisixConfig("http://apisix.local", 9092, 9091);

        assertThat(service.getControlUrl()).isEqualTo("http://apisix.local:9092");
    }

    @Test
    void getControlUrl_usesDefaults_whenConfigFieldsNull() throws Exception {
        writeRaw(new YamlApisixConfig(null, null, null));

        assertThat(service.getControlUrl()).isEqualTo("http://127.0.0.1:9882");
    }

    @Test
    void getMetricsUrl_returnsHostColonMetricsPort() {
        service.saveApisixConfig("http://apisix.local", 9092, 9091);

        assertThat(service.getMetricsUrl()).isEqualTo("http://apisix.local:9091");
    }

    @Test
    void getMetricsUrl_usesDefaults_whenConfigFieldsNull() throws Exception {
        writeRaw(new YamlApisixConfig(null, null, null));

        assertThat(service.getMetricsUrl()).isEqualTo("http://127.0.0.1:9881");
    }
}
