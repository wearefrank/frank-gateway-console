package wearefrank.backend.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import wearefrank.backend.service.ApisixClient;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(SchemaController.class)
class SchemaControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    ApisixClient apisixClient;

    @Test
    void getFullSchema_returns200WithBody() throws Exception {
        when(apisixClient.controlGet("/v1/schema")).thenReturn("{\"main\":{}}");

        mockMvc.perform(get("/api/schema"))
                .andExpect(status().isOk())
                .andExpect(content().string("{\"main\":{}}"));

        verify(apisixClient).controlGet("/v1/schema");
    }

    @Test
    void getFullSchema_propagatesException_onServiceFailure() throws Exception {
        when(apisixClient.controlGet("/v1/schema")).thenThrow(new RuntimeException("APISIX down"));

        mockMvc.perform(get("/api/schema"))
                .andExpect(status().isBadGateway());
    }
}
