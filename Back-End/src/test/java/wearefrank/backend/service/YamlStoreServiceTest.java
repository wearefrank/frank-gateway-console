package wearefrank.backend.service;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import wearefrank.backend.dto.YamlApisixConfig;

import java.io.File;
import java.nio.file.Path;
import java.util.ArrayList;

import static org.assertj.core.api.Assertions.assertThat;

@ExtendWith(MockitoExtension.class)
class YamlStoreServiceTest {

    @TempDir
    Path tempDir;

    private YamlStoreService service;

    @BeforeEach
    void setUp() {
        service = new YamlStoreService();
        File testFile = tempDir.resolve("apisix_config.yaml").toFile();
        ReflectionTestUtils.setField(service, "file", testFile);
        service.ensureConfigExist();
    }

    @Test
    void ensureConfigExist_createsFileWithDefaults_whenFileAbsent() {
        YamlApisixConfig config = service.getFullConfig();

        assertThat(tempDir.resolve("apisix_config.yaml").toFile()).exists();
        assertThat(config.host()).isEqualTo("http://127.0.0.1");
        assertThat(config.controlPort()).isEqualTo(9092);
        assertThat(config.metricsPort()).isEqualTo(9091);
        assertThat(config.routes()).isEmpty();
    }

    @Test
    void ensureConfigExist_doesNotOverwrite_existingFile() {
        service.saveApisixConfig("http://custom", 1234, 5678);

        service.ensureConfigExist();

        assertThat(service.getFullConfig().host()).isEqualTo("http://custom");
        assertThat(service.getFullConfig().controlPort()).isEqualTo(1234);
    }

    @Test
    void getControlUrl_returnsHostColonControlPort() {
        service.saveApisixConfig("http://apisix.local", 9092, 9091);

        assertThat(service.getControlUrl()).isEqualTo("http://apisix.local:9092");
    }

    @Test
    void getControlUrl_usesDefaults_whenConfigFieldsNull() throws Exception {
        ObjectMapper yamlMapper = new ObjectMapper(new YAMLFactory())
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        File testFile = tempDir.resolve("apisix_config.yaml").toFile();
        yamlMapper.writeValue(testFile, new YamlApisixConfig(null, null, null, new ArrayList<>()));

        assertThat(service.getControlUrl()).isEqualTo("http://127.0.0.1:9092");
    }

    @Test
    void getMetricsUrl_returnsHostColonMetricsPort() {
        service.saveApisixConfig("http://apisix.local", 9092, 9091);

        assertThat(service.getMetricsUrl()).isEqualTo("http://apisix.local:9091");
    }

    @Test
    void getMetricsUrl_usesDefaults_whenConfigFieldsNull() throws Exception {
        ObjectMapper yamlMapper = new ObjectMapper(new YAMLFactory())
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        File testFile = tempDir.resolve("apisix_config.yaml").toFile();
        yamlMapper.writeValue(testFile, new YamlApisixConfig(null, null, null, new ArrayList<>()));

        assertThat(service.getMetricsUrl()).isEqualTo("http://127.0.0.1:9091");
    }

    @Test
    void getFullConfig_returnsCompleteConfigObject() {
        service.saveApisixConfig("http://host", 1111, 2222);

        YamlApisixConfig config = service.getFullConfig();

        assertThat(config.host()).isEqualTo("http://host");
        assertThat(config.controlPort()).isEqualTo(1111);
        assertThat(config.metricsPort()).isEqualTo(2222);
    }
}
