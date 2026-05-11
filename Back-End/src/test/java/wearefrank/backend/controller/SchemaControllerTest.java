package wearefrank.backend.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import wearefrank.backend.service.SchemaService;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
    SchemaService schemaService;

    @Test
    void getFullSchema_returns200WithBody() throws Exception {
        when(schemaService.getFullSchema()).thenReturn("{\"main\":{}}");

        mockMvc.perform(get("/api/schema"))
                .andExpect(status().isOk())
                .andExpect(content().string("{\"main\":{}}"));

        verify(schemaService).getFullSchema();
    }

    @Test
    void getFullSchema_propagatesException_onServiceFailure() {
        when(schemaService.getFullSchema()).thenThrow(new RuntimeException("APISIX down"));

        assertThatThrownBy(() -> mockMvc.perform(get("/api/schema")))
                .hasRootCauseInstanceOf(RuntimeException.class)
                .hasRootCauseMessage("APISIX down");
    }
}
