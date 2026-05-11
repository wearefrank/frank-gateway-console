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
class PrometheusClientTest {

    @Mock
    HttpClient httpClient;

    @SuppressWarnings("unchecked")
    @Mock
    HttpResponse<String> httpResponse;

    @InjectMocks
    PrometheusClient prometheusClient;

    @Test
    void query_returnsBody_on200() throws Exception {
        doReturn(httpResponse).when(httpClient).send(any(), any());
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn("{\"status\":\"success\"}");

        String result = prometheusClient.query("up");

        assertThat(result).isEqualTo("{\"status\":\"success\"}");
    }

    @Test
    void query_throwsRuntimeException_onNon200() throws Exception {
        doReturn(httpResponse).when(httpClient).send(any(), any());
        when(httpResponse.statusCode()).thenReturn(503);

        assertThatThrownBy(() -> prometheusClient.query("up"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("503");
    }

    @Test
    void query_throwsRuntimeException_onNetworkException() throws Exception {
        doThrow(new IOException("connection refused")).when(httpClient).send(any(), any());

        assertThatThrownBy(() -> prometheusClient.query("up"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Failed to reach Prometheus");
    }

    @Test
    void query_urlEncodesPromQL() throws Exception {
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        doReturn(httpResponse).when(httpClient).send(captor.capture(), any());
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn("result");

        prometheusClient.query("http_requests_total{job=\"apisix\"}");

        String uri = captor.getValue().uri().toString();
        assertThat(uri).contains("query=http_requests_total%7Bjob%3D%22apisix%22%7D");
    }

    @Test
    void query_usesBaseUrlPrefix() throws Exception {
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        doReturn(httpResponse).when(httpClient).send(captor.capture(), any());
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn("result");

        prometheusClient.query("up");

        assertThat(captor.getValue().uri().toString())
                .startsWith("http://localhost:9090/api/v1/query");
    }

    @Test
    void rangeQuery_returnsBody_on200() throws Exception {
        doReturn(httpResponse).when(httpClient).send(any(), any());
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn("{\"status\":\"success\"}");

        String result = prometheusClient.rangeQuery("up", 1700000000L, 1700003600L, "60");

        assertThat(result).isEqualTo("{\"status\":\"success\"}");
    }

    @Test
    void rangeQuery_throwsRuntimeException_onNon200() throws Exception {
        doReturn(httpResponse).when(httpClient).send(any(), any());
        when(httpResponse.statusCode()).thenReturn(500);

        assertThatThrownBy(() -> prometheusClient.rangeQuery("up", 1000L, 2000L, "30"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("500");
    }

    @Test
    void rangeQuery_buildsCorrectUrlWithAllParameters() throws Exception {
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        doReturn(httpResponse).when(httpClient).send(captor.capture(), any());
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn("result");

        prometheusClient.rangeQuery("up", 1000L, 2000L, "30");

        String uri = captor.getValue().uri().toString();
        assertThat(uri).contains("query=up");
        assertThat(uri).contains("start=1000");
        assertThat(uri).contains("end=2000");
        assertThat(uri).contains("step=30");
    }
}
