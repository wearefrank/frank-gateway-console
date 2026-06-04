package wearefrank.backend.service.versioning;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import wearefrank.backend.dto.ConfigVersionDto;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

@Component
public class GiteaProviderClient {

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public GiteaProviderClient(HttpClient httpClient) {
        this.httpClient = httpClient;
    }

    public List<ConfigVersionDto.Summary> listVersions(GiteaConfig config) {
        if (!isConfigured(config)) return new ArrayList<>();
        String host = GitProviderUtils.normalizeHost(config.host());
        String url = host + "/api/v1/repos/" + config.repo() + "/commits?sha=" + config.branch()
                + "&path=" + config.filePath() + "&limit=50";
        JsonNode commits = get(url, config.token());

        // Gitea's commit structure mirrors GitHub's
        List<ConfigVersionDto.Summary> result = new ArrayList<>();
        for (JsonNode commit : commits) {
            String sha = commit.get("sha").asText();
            String shortId = sha.length() >= 7 ? sha.substring(0, 7) : sha;
            String message = commit.path("commit").path("message").asText("").lines().findFirst().orElse("");
            String createdAt = commit.path("commit").path("author").path("date").asText();
            String author = commit.path("commit").path("author").path("name").asText("");
            String commitUrl = commit.path("html_url").asText("");
            result.add(new ConfigVersionDto.Summary(shortId, message, createdAt, commitUrl, author));
        }
        return result;
    }

    public ConfigVersionDto getVersion(String id, GiteaConfig config) {
        assertConfigured(config);
        String host = GitProviderUtils.normalizeHost(config.host());

        String contentsUrl = host + "/api/v1/repos/" + config.repo() + "/contents/" + config.filePath() + "?ref=" + id;
        String content = GitProviderUtils.decodeBase64Content(get(contentsUrl, config.token()).get("content").asText());

        String message = "";
        String createdAt = "";
        try {
            JsonNode commitNode = get(host + "/api/v1/repos/" + config.repo() + "/git/commits/" + id, config.token());
            message = commitNode.path("message").asText("").lines().findFirst().orElse("");
            createdAt = commitNode.path("author").path("date").asText("");
        } catch (ResponseStatusException ignored) {}

        return new ConfigVersionDto(id, message, createdAt, content);
    }

    public ConfigVersionDto.Summary saveVersion(String message, String content, GiteaConfig config) {
        assertConfigured(config);
        String host = GitProviderUtils.normalizeHost(config.host());
        String contentsUrl = host + "/api/v1/repos/" + config.repo() + "/contents/" + config.filePath();

        String encoded = Base64.getEncoder().encodeToString(content.getBytes(StandardCharsets.UTF_8));
        ObjectNode body = objectMapper.createObjectNode();
        body.put("message", message);
        body.put("content", encoded);
        body.put("branch", config.branch());

        // include the current blob sha if the file already exists
        JsonNode result;
        try {
            JsonNode current = get(contentsUrl + "?ref=" + config.branch(), config.token());
            body.put("sha", current.get("sha").asText());
            result = put(contentsUrl, body, config.token());
        } catch (ResponseStatusException e) {
            if (e.getStatusCode().value() != 404) throw e;
            result = post(contentsUrl, body, config.token());
        }

        // Gitea's response mirrors GitHub's: result.commit contains the new commit info
        String newSha = result.path("commit").path("sha").asText();
        String shortId = newSha.length() >= 7 ? newSha.substring(0, 7) : newSha;
        String createdAt = result.path("commit").path("author").path("date").asText("");
        String author = result.path("commit").path("author").path("name").asText("");
        String commitUrl = result.path("commit").path("html_url").asText("");
        return new ConfigVersionDto.Summary(shortId, message, createdAt, commitUrl, author);
    }

    public String readCurrentFile(GiteaConfig config) {
        assertConfigured(config);
        String host = GitProviderUtils.normalizeHost(config.host());
        String url = host + "/api/v1/repos/" + config.repo() + "/contents/" + config.filePath() + "?ref=" + config.branch();
        return GitProviderUtils.decodeBase64Content(get(url, config.token()).get("content").asText());
    }

    private boolean isConfigured(GiteaConfig config) {
        return !GitProviderUtils.isBlank(config.token())
                && !GitProviderUtils.isBlank(config.host())
                && !GitProviderUtils.isBlank(config.repo())
                && !GitProviderUtils.isBlank(config.branch())
                && !GitProviderUtils.isBlank(config.filePath());
    }

    private void assertConfigured(GiteaConfig config) {
        if (!isConfigured(config)) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Gitea integration not configured");
        }
    }

    // Gitea uses "token <token>" rather than "Bearer <token>"
    private HttpRequest.Builder baseRequest(String url, String token) {
        return HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "token " + token)
                .header("Content-Type", "application/json");
    }

    private JsonNode get(String url, String token) {
        try {
            HttpResponse<String> response = httpClient.send(
                    baseRequest(url, token).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 404) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Not found: " + url);
            if (response.statusCode() >= 400) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Gitea API error: " + response.statusCode());
            return objectMapper.readTree(response.body());
        } catch (ResponseStatusException e) {
            throw e;
        } catch (IOException | InterruptedException e) {
            throw new RuntimeException("Gitea API request failed", e);
        }
    }

    private JsonNode put(String url, ObjectNode body, String token) {
        try {
            String bodyStr = objectMapper.writeValueAsString(body);
            HttpResponse<String> response = httpClient.send(
                    baseRequest(url, token).PUT(HttpRequest.BodyPublishers.ofString(bodyStr)).build(),
                    HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 400) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Gitea API error: " + response.statusCode() + " " + response.body());
            return objectMapper.readTree(response.body());
        } catch (ResponseStatusException e) {
            throw e;
        } catch (IOException | InterruptedException e) {
            throw new RuntimeException("Gitea API request failed", e);
        }
    }

    private JsonNode post(String url, ObjectNode body, String token) {
        try {
            String bodyStr = objectMapper.writeValueAsString(body);
            HttpResponse<String> response = httpClient.send(
                    baseRequest(url, token).POST(HttpRequest.BodyPublishers.ofString(bodyStr)).build(),
                    HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 400) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Gitea API error: " + response.statusCode() + " " + response.body());
            return objectMapper.readTree(response.body());
        } catch (ResponseStatusException e) {
            throw e;
        } catch (IOException | InterruptedException e) {
            throw new RuntimeException("Gitea API request failed", e);
        }
    }
}
