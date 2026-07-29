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

class GitHubProviderClientTest {

    private static final GitHubConfig CONFIG =
            new GitHubConfig("tok123", "owner/repo", "main", "routes.yaml");

    private HttpClient httpClient;
    private GitHubProviderClient client;

    @BeforeEach
    void setUp() {
        httpClient = mock(HttpClient.class);
        client = new GitHubProviderClient(httpClient);
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
    void providerName_isGithub() {
        assertThat(client.providerName()).isEqualTo("github");
    }

    @Test
    void listVersions_returnsEmptyList_whenNotConfigured() {
        GitHubConfig incomplete = new GitHubConfig(null, "owner/repo", "main", "routes.yaml");

        assertThat(client.listVersions(incomplete)).isEmpty();
        verifyNoInteractions(httpClient);
    }

    @Test
    void listVersions_parsesCommitsIntoSummaries() throws Exception {
        String body = """
                [
                  {"sha":"abcdef1234567890","commit":{"message":"fix bug\\nmore detail","author":{"date":"2024-01-01T00:00:00Z","name":"Alice"}}}
                ]
                """;
        send(responseFor(200, body));

        List<ConfigVersionDto.Summary> versions = client.listVersions(CONFIG);

        assertThat(versions).hasSize(1);
        ConfigVersionDto.Summary summary = versions.get(0);
        assertThat(summary.id()).isEqualTo("abcdef1");
        assertThat(summary.message()).isEqualTo("fix bug");
        assertThat(summary.createdAt()).isEqualTo("2024-01-01T00:00:00Z");
        assertThat(summary.author()).isEqualTo("Alice");
        assertThat(summary.commitUrl()).isEqualTo("https://github.com/owner/repo/commit/abcdef1234567890");
    }

    @Test
    void listVersions_normalizesFullRepoUrl() throws Exception {
        GitHubConfig withUrl = new GitHubConfig("tok", "https://github.com/owner/repo/", "main", "routes.yaml");
        send(responseFor(200, "[]"));

        client.listVersions(withUrl);

        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(captor.capture(), any());
        assertThat(captor.getValue().uri().toString()).contains("/repos/owner/repo/commits");
    }

    @Test
    void getVersion_returnsDecodedContentAndCommitMetadata() throws Exception {
        String encoded = Base64.getEncoder().encodeToString("routes: []".getBytes());
        send(responseFor(200, "{\"content\":\"" + encoded + "\"}"),
                responseFor(200, "{\"commit\":{\"message\":\"initial\",\"author\":{\"date\":\"2024-02-02T00:00:00Z\"}}}"));

        ConfigVersionDto version = client.getVersion("abc123", CONFIG);

        assertThat(version.id()).isEqualTo("abc123");
        assertThat(version.content()).isEqualTo("routes: []");
        assertThat(version.message()).isEqualTo("initial");
        assertThat(version.createdAt()).isEqualTo("2024-02-02T00:00:00Z");
    }

    @Test
    void getVersion_swallowsCommitMetadataFetchFailure() throws Exception {
        String encoded = Base64.getEncoder().encodeToString("routes: []".getBytes());
        send(responseFor(200, "{\"content\":\"" + encoded + "\"}"),
                responseFor(404, ""));

        ConfigVersionDto version = client.getVersion("abc123", CONFIG);

        assertThat(version.content()).isEqualTo("routes: []");
        assertThat(version.message()).isEmpty();
        assertThat(version.createdAt()).isEmpty();
    }

    @Test
    void getVersion_throwsServiceUnavailable_whenNotConfigured() {
        GitHubConfig incomplete = new GitHubConfig("", "owner/repo", "main", "routes.yaml");

        assertThatThrownBy(() -> client.getVersion("abc", incomplete))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("GitHub integration not configured");
    }

    @Test
    void getVersion_throwsNotFound_whenFileMissing() throws Exception {
        send(responseFor(404, ""));

        assertThatThrownBy(() -> client.getVersion("abc123", CONFIG))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Not found");
    }

    @Test
    void getVersion_throwsFriendlyMessage_onAuthFailure() throws Exception {
        send(responseFor(401, "{}"));

        assertThatThrownBy(() -> client.getVersion("abc123", CONFIG))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Authentication failed");
    }

    @Test
    void getVersion_fallsBackToJsonMessage_whenStatusHasNoFriendlyText() throws Exception {
        send(responseFor(418, "{\"message\":\"I'm a teapot\"}"));

        assertThatThrownBy(() -> client.getVersion("abc123", CONFIG))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("I'm a teapot");
    }

    @Test
    void getVersion_fallsBackToGenericMessage_whenBodyNotJson() throws Exception {
        send(responseFor(418, "not json"));

        assertThatThrownBy(() -> client.getVersion("abc123", CONFIG))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Unexpected error (418)");
    }

    @Test
    void listVersions_wrapsNetworkFailure() throws Exception {
        doThrow(new java.io.IOException("boom")).when(httpClient).send(any(), any());

        assertThatThrownBy(() -> client.listVersions(CONFIG))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("github API request failed");
    }

    @Test
    void getVersion_wrapsMalformedJsonResponse() throws Exception {
        send(responseFor(200, "not valid json"));

        assertThatThrownBy(() -> client.getVersion("abc123", CONFIG))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Failed to parse github API response");
    }

    @Test
    void saveVersion_createsNewFile_whenNoneExists() throws Exception {
        send(responseFor(404, ""),
                responseFor(200, "{\"commit\":{\"sha\":\"newsha1234567\",\"author\":{\"date\":\"2024-03-03T00:00:00Z\",\"name\":\"Bob\"}}}"));

        ConfigVersionDto.Summary summary = client.saveVersion("commit msg", "routes: []", CONFIG);

        assertThat(summary.id()).isEqualTo("newsha1");
        assertThat(summary.author()).isEqualTo("Bob");
        assertThat(summary.createdAt()).isEqualTo("2024-03-03T00:00:00Z");
        assertThat(summary.commitUrl()).isEqualTo("https://github.com/owner/repo/commit/newsha1234567");

        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient, times(2)).send(captor.capture(), any());
        String putBody = TestHttpBodies.bodyOf(captor.getAllValues().get(1));
        assertThat(putBody).doesNotContain("\"sha\"");
        assertThat(putBody).contains("\"message\":\"commit msg\"");
        assertThat(putBody).contains("\"branch\":\"main\"");
    }

    @Test
    void saveVersion_updatesExistingFile_whenShaFound() throws Exception {
        send(responseFor(200, "{\"sha\":\"oldsha\"}"),
                responseFor(200, "{\"commit\":{\"sha\":\"newsha1234567\",\"author\":{\"date\":\"2024-03-03T00:00:00Z\",\"name\":\"Bob\"}}}"));

        ConfigVersionDto.Summary summary = client.saveVersion("commit msg", "routes: []", CONFIG);

        assertThat(summary.id()).isEqualTo("newsha1");
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient, times(2)).send(captor.capture(), any());
        assertThat(captor.getAllValues().get(1).method()).isEqualTo("PUT");
        String putBody = TestHttpBodies.bodyOf(captor.getAllValues().get(1));
        assertThat(putBody).contains("\"sha\":\"oldsha\"");
    }

    @Test
    void saveVersion_rethrowsNonNotFoundError_fromShaLookup() throws Exception {
        send(responseFor(500, "{}"));

        assertThatThrownBy(() -> client.saveVersion("msg", "content", CONFIG))
                .isInstanceOf(ResponseStatusException.class);
        verify(httpClient, times(1)).send(any(), any());
    }

    @Test
    void saveVersion_throwsServiceUnavailable_whenNotConfigured() {
        GitHubConfig incomplete = new GitHubConfig(null, null, null, null);

        assertThatThrownBy(() -> client.saveVersion("msg", "content", incomplete))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("GitHub integration not configured");
    }

    @Test
    void readCurrentFile_returnsDecodedContent() throws Exception {
        String encoded = Base64.getEncoder().encodeToString("routes: []".getBytes());
        send(responseFor(200, "{\"content\":\"" + encoded + "\"}"));

        assertThat(client.readCurrentFile(CONFIG)).isEqualTo("routes: []");
    }

    @Test
    void readCurrentFile_decodesContentWithEmbeddedNewlines() throws Exception {
        String encoded = Base64.getEncoder().encodeToString("routes: []".getBytes());
        String withNewlines = encoded.substring(0, 2) + "\\n" + encoded.substring(2);
        send(responseFor(200, "{\"content\":\"" + withNewlines + "\"}"));

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
        GitHubConfig incomplete = new GitHubConfig(null, null, null, null);

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
    void baseRequest_setsGithubAuthHeaders() throws Exception {
        send(responseFor(200, "[]"));

        client.listVersions(CONFIG);

        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(captor.capture(), any());
        HttpRequest request = captor.getValue();
        assertThat(request.headers().firstValue("Authorization")).contains("Bearer tok123");
        assertThat(request.headers().firstValue("Accept")).contains("application/vnd.github+json");
        assertThat(request.headers().firstValue("X-GitHub-Api-Version")).contains("2022-11-28");
    }
}
