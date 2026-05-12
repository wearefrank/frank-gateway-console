package wearefrank.backend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ApisixClientTest {

    @Mock
    YamlStoreService yamlStoreService;

    @Mock
    HttpClient httpClient;

    @SuppressWarnings("unchecked")
    @Mock
    HttpResponse<String> httpResponse;

    @InjectMocks
    ApisixClient apisixClient;

    @Test
    void controlGet_returnsBody_on200() throws Exception {
        when(yamlStoreService.getControlUrl()).thenReturn("http://apisix:9092");
        doReturn(httpResponse).when(httpClient).send(any(), any());
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn("{\"schema\":true}");

        String result = apisixClient.controlGet("/v1/schema");

        assertThat(result).isEqualTo("{\"schema\":true}");
    }

    @Test
    void controlGet_throwsRuntimeException_onNon200() throws Exception {
        when(yamlStoreService.getControlUrl()).thenReturn("http://apisix:9092");
        doReturn(httpResponse).when(httpClient).send(any(), any());
        when(httpResponse.statusCode()).thenReturn(503);

        assertThatThrownBy(() -> apisixClient.controlGet("/v1/schema"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("503");
    }

    @Test
    void controlGet_throwsRuntimeException_onNetworkException() throws Exception {
        when(yamlStoreService.getControlUrl()).thenReturn("http://apisix:9092");
        doThrow(new IOException("connection refused")).when(httpClient).send(any(), any());

        assertThatThrownBy(() -> apisixClient.controlGet("/v1/schema"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Failed to reach APISIX control API");
    }

    @Test
    void metricsGet_returnsBody_on200() throws Exception {
        when(yamlStoreService.getMetricsUrl()).thenReturn("http://apisix:9091");
        doReturn(httpResponse).when(httpClient).send(any(), any());
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn("prometheus_text 1");

        String result = apisixClient.metricsGet("/apisix/prometheus/metrics");

        assertThat(result).isEqualTo("prometheus_text 1");
    }

    @Test
    void metricsGet_throwsRuntimeException_onNon200() throws Exception {
        when(yamlStoreService.getMetricsUrl()).thenReturn("http://apisix:9091");
        doReturn(httpResponse).when(httpClient).send(any(), any());
        when(httpResponse.statusCode()).thenReturn(404);

        assertThatThrownBy(() -> apisixClient.metricsGet("/apisix/prometheus/metrics"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("404");
    }

    @Test
    void metricsGet_throwsRuntimeException_onNetworkException() throws Exception {
        when(yamlStoreService.getMetricsUrl()).thenReturn("http://apisix:9091");
        doThrow(new IOException("timeout")).when(httpClient).send(any(), any());

        assertThatThrownBy(() -> apisixClient.metricsGet("/apisix/prometheus/metrics"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Failed to reach metrics endpoint");
    }

    @Test
    void checkControl_returnsTrue_on200() throws Exception {
        doReturn(httpResponse).when(httpClient).send(any(), any());
        when(httpResponse.statusCode()).thenReturn(200);

        assertThat(apisixClient.checkControl("http://host", 9092)).isTrue();
    }

    @Test
    void checkControl_returnsFalse_onNon200() throws Exception {
        doReturn(httpResponse).when(httpClient).send(any(), any());
        when(httpResponse.statusCode()).thenReturn(503);

        assertThat(apisixClient.checkControl("http://host", 9092)).isFalse();
    }

    @Test
    void checkControl_returnsFalse_onException() throws Exception {
        doThrow(new IOException("network error")).when(httpClient).send(any(), any());

        assertThat(apisixClient.checkControl("http://host", 9092)).isFalse();
    }

    @Test
    void checkControl_buildsCorrectUrl() throws Exception {
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        doReturn(httpResponse).when(httpClient).send(captor.capture(), any());
        when(httpResponse.statusCode()).thenReturn(200);

        apisixClient.checkControl("http://apisix.local", 9092);

        assertThat(captor.getValue().uri().toString()).isEqualTo("http://apisix.local:9092/v1/schema");
    }

    @Test
    void checkMetrics_returnsTrue_on200() throws Exception {
        doReturn(httpResponse).when(httpClient).send(any(), any());
        when(httpResponse.statusCode()).thenReturn(200);

        assertThat(apisixClient.checkMetrics("http://host", 9091)).isTrue();
    }

    @Test
    void checkMetrics_returnsFalse_onNon200() throws Exception {
        doReturn(httpResponse).when(httpClient).send(any(), any());
        when(httpResponse.statusCode()).thenReturn(404);

        assertThat(apisixClient.checkMetrics("http://host", 9091)).isFalse();
    }

    @Test
    void checkMetrics_returnsFalse_onException() throws Exception {
        doThrow(new IOException("network error")).when(httpClient).send(any(), any());

        assertThat(apisixClient.checkMetrics("http://host", 9091)).isFalse();
    }

    @Test
    void checkMetrics_buildsCorrectUrl() throws Exception {
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        doReturn(httpResponse).when(httpClient).send(captor.capture(), any());
        when(httpResponse.statusCode()).thenReturn(200);

        apisixClient.checkMetrics("http://apisix.local", 9091);

        assertThat(captor.getValue().uri().toString())
                .isEqualTo("http://apisix.local:9091/apisix/prometheus/metrics");
    }
}
