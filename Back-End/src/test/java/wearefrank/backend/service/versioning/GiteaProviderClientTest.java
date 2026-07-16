package wearefrank.backend.service.versioning;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;
import wearefrank.backend.dto.ConfigVersionDto;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Base64;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class GiteaProviderClientTest {

    private static final GiteaConfig CONFIG =
            new GiteaConfig("tok123", "https://gitea.example.com", "owner/repo", "main", "routes.yaml");

    private HttpClient httpClient;
    private GiteaProviderClient client;

    @BeforeEach
    void setUp() {
        httpClient = mock(HttpClient.class);
        client = new GiteaProviderClient(httpClient);
    }

    @SuppressWarnings("unchecked")
    private HttpResponse<String> responseFor(int status, String body) {
        HttpResponse<String> response = mock(HttpResponse.class);
        lenient().when(response.statusCode()).thenReturn(status);
        lenient().when(response.body()).thenReturn(body);
        return response;
    }

    private void send(HttpResponse<String>... responses) throws Exception {
        doReturn(responses[0], (Object[]) java.util.Arrays.copyOfRange(responses, 1, responses.length))
                .when(httpClient).send(any(), any());
    }

    @Test
    void providerName_isGitea() {
        assertThat(client.providerName()).isEqualTo("gitea");
    }

    @Test
    void listVersions_returnsEmptyList_whenNotConfigured() {
        GiteaConfig incomplete = new GiteaConfig(null, "https://gitea.example.com", "owner/repo", "main", "routes.yaml");

        assertThat(client.listVersions(incomplete)).isEmpty();
        verifyNoInteractions(httpClient);
    }

    @Test
    void listVersions_parsesCommitsIntoSummaries() throws Exception {
        String body = """
                [
                  {"sha":"abcdef1234567890","commit":{"message":"fix bug\\nmore detail","author":{"date":"2024-01-01T00:00:00Z","name":"Alice"}},"html_url":"https://gitea.example.com/owner/repo/commit/abcdef1"}
                ]
                """;
        send(responseFor(200, body));

        List<ConfigVersionDto.Summary> versions = client.listVersions(CONFIG);

        assertThat(versions).hasSize(1);
        ConfigVersionDto.Summary summary = versions.get(0);
        assertThat(summary.id()).isEqualTo("abcdef1");
        assertThat(summary.message()).isEqualTo("fix bug");
        assertThat(summary.author()).isEqualTo("Alice");
        assertThat(summary.commitUrl()).isEqualTo("https://gitea.example.com/owner/repo/commit/abcdef1");
    }

    @Test
    void listVersions_normalizesTrailingSlashOnHost() throws Exception {
        GiteaConfig withSlash = new GiteaConfig("tok", "https://gitea.example.com/", "owner/repo", "main", "routes.yaml");
        send(responseFor(200, "[]"));

        client.listVersions(withSlash);

        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(captor.capture(), any());
        assertThat(captor.getValue().uri().toString()).doesNotContain("example.com//");
    }

    @Test
    void getVersion_returnsDecodedContentAndCommitMetadata() throws Exception {
        String encoded = Base64.getEncoder().encodeToString("routes: []".getBytes());
        send(responseFor(200, "{\"content\":\"" + encoded + "\"}"),
                responseFor(200, "{\"message\":\"initial\",\"author\":{\"date\":\"2024-02-02T00:00:00Z\"}}"));

        ConfigVersionDto version = client.getVersion("abc123", CONFIG);

        assertThat(version.content()).isEqualTo("routes: []");
        assertThat(version.message()).isEqualTo("initial");
        assertThat(version.createdAt()).isEqualTo("2024-02-02T00:00:00Z");
    }

    @Test
    void getVersion_throwsServiceUnavailable_whenNotConfigured() {
        GiteaConfig incomplete = new GiteaConfig(null, null, null, null, null);

        assertThatThrownBy(() -> client.getVersion("abc", incomplete))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Gitea integration not configured");
    }

    @Test
    void saveVersion_createsFile_whenNoneExists() throws Exception {
        send(responseFor(404, ""),
                responseFor(200, "{\"commit\":{\"sha\":\"newsha1234567\",\"author\":{\"date\":\"2024-03-03T00:00:00Z\",\"name\":\"Bob\"},\"html_url\":\"https://gitea.example.com/commit/new\"}}"));

        ConfigVersionDto.Summary summary = client.saveVersion("commit msg", "routes: []", CONFIG);

        assertThat(summary.id()).isEqualTo("newsha1");
        assertThat(summary.author()).isEqualTo("Bob");

        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient, times(2)).send(captor.capture(), any());
        assertThat(captor.getAllValues().get(1).method()).isEqualTo("POST");
        String postBody = TestHttpBodies.bodyOf(captor.getAllValues().get(1));
        assertThat(postBody).doesNotContain("\"sha\"");
        assertThat(postBody).contains("\"message\":\"commit msg\"");
        assertThat(postBody).contains("\"branch\":\"main\"");
    }

    @Test
    void saveVersion_updatesFile_whenShaFound() throws Exception {
        send(responseFor(200, "{\"sha\":\"oldsha\"}"),
                responseFor(200, "{\"commit\":{\"sha\":\"newsha1234567\",\"author\":{\"date\":\"2024-03-03T00:00:00Z\",\"name\":\"Bob\"},\"html_url\":\"https://gitea.example.com/commit/new\"}}"));

        client.saveVersion("commit msg", "routes: []", CONFIG);

        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient, times(2)).send(captor.capture(), any());
        assertThat(captor.getAllValues().get(1).method()).isEqualTo("PUT");
        String putBody = TestHttpBodies.bodyOf(captor.getAllValues().get(1));
        assertThat(putBody).contains("\"sha\":\"oldsha\"");
    }

    @Test
    void saveVersion_rethrowsNonNotFoundError_fromExistCheck() throws Exception {
        send(responseFor(500, "{}"));

        assertThatThrownBy(() -> client.saveVersion("msg", "content", CONFIG))
                .isInstanceOf(ResponseStatusException.class);
        verify(httpClient, times(1)).send(any(), any());
    }

    @Test
    void readCurrentFile_returnsDecodedContent() throws Exception {
        String encoded = Base64.getEncoder().encodeToString("routes: []".getBytes());
        send(responseFor(200, "{\"content\":\"" + encoded + "\"}"));

        assertThat(client.readCurrentFile(CONFIG)).isEqualTo("routes: []");
    }

    @Test
    void fileExists_true_on200() throws Exception {
        send(responseFor(200, "{\"content\":\"\"}"));

        assertThat(client.fileExists(CONFIG)).isTrue();
    }

    @Test
    void fileExists_false_on404() throws Exception {
        send(responseFor(404, ""));

        assertThat(client.fileExists(CONFIG)).isFalse();
    }

    @Test
    void fileExists_false_whenNotConfigured() {
        GiteaConfig incomplete = new GiteaConfig(null, null, null, null, null);

        assertThat(client.fileExists(incomplete)).isFalse();
    }

    @Test
    void fileExists_rethrowsNonNotFoundError() throws Exception {
        send(responseFor(500, "{}"));

        assertThatThrownBy(() -> client.fileExists(CONFIG))
                .isInstanceOf(ResponseStatusException.class);
        verify(httpClient, times(1)).send(any(), any());
    }

    @Test
    void baseRequest_setsGiteaTokenHeader() throws Exception {
        send(responseFor(200, "[]"));

        client.listVersions(CONFIG);

        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(captor.capture(), any());
        assertThat(captor.getValue().headers().firstValue("Authorization")).contains("token tok123");
    }
}
