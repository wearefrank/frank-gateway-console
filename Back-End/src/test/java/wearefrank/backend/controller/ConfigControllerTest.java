package wearefrank.backend.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import wearefrank.backend.dto.YamlApisixConfig;
import wearefrank.backend.service.ApisixClient;
import wearefrank.backend.service.YamlStoreService;

import java.util.ArrayList;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ConfigController.class)
class ConfigControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    YamlStoreService yamlStoreService;

    @MockitoBean
    ApisixClient apisixClient;

    @Test
    void getConfig_returnsDefaults_whenConfigFieldsNull() throws Exception {
        when(yamlStoreService.getFullConfig())
                .thenReturn(new YamlApisixConfig(null, null, null, null));

        mockMvc.perform(get("/api/config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.host").value("http://127.0.0.1"))
                .andExpect(jsonPath("$.controlPort").value(9092))
                .andExpect(jsonPath("$.metricsPort").value(9091));
    }

    @Test
    void getConfig_returnsStoredValues() throws Exception {
        when(yamlStoreService.getFullConfig())
                .thenReturn(new YamlApisixConfig("http://10.0.0.1", 8080, 8081, new ArrayList<>()));

        mockMvc.perform(get("/api/config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.host").value("http://10.0.0.1"))
                .andExpect(jsonPath("$.controlPort").value(8080))
                .andExpect(jsonPath("$.metricsPort").value(8081));
    }

    @Test
    void saveConfig_callsSaveApisixConfig_andReturns200() throws Exception {
        mockMvc.perform(post("/api/config")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"host\":\"http://x\",\"controlPort\":1111,\"metricsPort\":2222}"))
                .andExpect(status().isOk());

        verify(yamlStoreService).saveApisixConfig("http://x", 1111, 2222);
    }

    @Test
    void checkConnection_post_returnsTrue_whenCheckControlTrue() throws Exception {
        when(apisixClient.checkControl("http://host", 9092)).thenReturn(true);

        mockMvc.perform(post("/api/config/check")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"host\":\"http://host\",\"controlPort\":9092,\"metricsPort\":9091}"))
                .andExpect(status().isOk())
                .andExpect(content().string("true"));
    }

    @Test
    void checkConnection_post_returnsFalse_whenCheckControlFalse() throws Exception {
        when(apisixClient.checkControl("http://host", 9092)).thenReturn(false);

        mockMvc.perform(post("/api/config/check")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"host\":\"http://host\",\"controlPort\":9092,\"metricsPort\":9091}"))
                .andExpect(status().isOk())
                .andExpect(content().string("false"));
    }

    @Test
    void checkStoredConnection_get_defaultsToControlApi() throws Exception {
        when(yamlStoreService.getFullConfig())
                .thenReturn(new YamlApisixConfig("http://apisix", 9092, 9091, null));
        when(apisixClient.checkControl("http://apisix", 9092)).thenReturn(true);

        mockMvc.perform(get("/api/config/check"))
                .andExpect(status().isOk())
                .andExpect(content().string("true"));

        verify(apisixClient).checkControl("http://apisix", 9092);
        verify(apisixClient, never()).checkMetrics(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyInt());
    }

    @Test
    void checkStoredConnection_get_usesMetrics_whenApiParamIsMetrics() throws Exception {
        when(yamlStoreService.getFullConfig())
                .thenReturn(new YamlApisixConfig("http://apisix", 9092, 9091, null));
        when(apisixClient.checkMetrics("http://apisix", 9091)).thenReturn(true);

        mockMvc.perform(get("/api/config/check").param("api", "metrics"))
                .andExpect(status().isOk())
                .andExpect(content().string("true"));

        verify(apisixClient).checkMetrics("http://apisix", 9091);
    }

    @Test
    void checkStoredConnection_get_usesDefaultPort_whenConfigPortNull() throws Exception {
        when(yamlStoreService.getFullConfig())
                .thenReturn(new YamlApisixConfig(null, null, null, null));
        when(apisixClient.checkControl("http://127.0.0.1", 9092)).thenReturn(false);

        mockMvc.perform(get("/api/config/check"))
                .andExpect(status().isOk())
                .andExpect(content().string("false"));

        verify(apisixClient).checkControl("http://127.0.0.1", 9092);
    }
}
