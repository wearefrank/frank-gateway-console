package wearefrank.backend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SchemaServiceTest {

    @Mock
    ApisixClient apisixClient;

    @InjectMocks
    SchemaService schemaService;

    @Test
    void getFullSchema_delegatesToControlGet_withCorrectPath() {
        when(apisixClient.controlGet("/v1/schema")).thenReturn("{\"main\":{}}");

        String result = schemaService.getFullSchema();

        assertThat(result).isEqualTo("{\"main\":{}}");
        verify(apisixClient).controlGet("/v1/schema");
    }

    @Test
    void getFullSchema_propagatesRuntimeException() {
        when(apisixClient.controlGet("/v1/schema")).thenThrow(new RuntimeException("unreachable"));

        assertThatThrownBy(() -> schemaService.getFullSchema())
                .isInstanceOf(RuntimeException.class)
                .hasMessage("unreachable");
    }
}
