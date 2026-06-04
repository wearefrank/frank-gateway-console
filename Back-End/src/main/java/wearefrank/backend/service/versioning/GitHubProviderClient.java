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
public class GitHubProviderClient {

    private static final String API_BASE = "https://api.github.com";

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public GitHubProviderClient(HttpClient httpClient) {
        this.httpClient = httpClient;
    }

    public List<ConfigVersionDto.Summary> listVersions(GitHubConfig config) {
        if (!isConfigured(config)) return new ArrayList<>();
        String repo = normalizeRepo(config.repo());
        String url = API_BASE + "/repos/" + repo + "/commits?path=" + config.filePath()
                + "&sha=" + config.branch() + "&per_page=50";
        JsonNode commits = get(url, config.token());

        List<ConfigVersionDto.Summary> result = new ArrayList<>();
        for (JsonNode commit : commits) {
            String sha = commit.get("sha").asText();
            String shortId = sha.substring(0, 7);
            String message = commit.path("commit").path("message").asText("").lines().findFirst().orElse("");
            String createdAt = commit.path("commit").path("author").path("date").asText();
            String author = commit.path("commit").path("author").path("name").asText("");
            String commitUrl = "https://github.com/" + repo + "/commit/" + sha;
            result.add(new ConfigVersionDto.Summary(shortId, message, createdAt, commitUrl, author));
        }
        return result;
    }

    public ConfigVersionDto getVersion(String id, GitHubConfig config) {
        assertConfigured(config);
        String repo = normalizeRepo(config.repo());

        String contentsUrl = API_BASE + "/repos/" + repo + "/contents/" + config.filePath() + "?ref=" + id;
        String content = GitProviderUtils.decodeBase64Content(get(contentsUrl, config.token()).get("content").asText());

        String message = "";
        String createdAt = "";
        try {
            JsonNode commitNode = get(API_BASE + "/repos/" + repo + "/commits/" + id, config.token());
            message = commitNode.path("commit").path("message").asText("").lines().findFirst().orElse("");
            createdAt = commitNode.path("commit").path("author").path("date").asText("");
        } catch (ResponseStatusException ignored) {}

        return new ConfigVersionDto(id, message, createdAt, content);
    }

    public ConfigVersionDto.Summary saveVersion(String message, String content, GitHubConfig config) {
        assertConfigured(config);
        String repo = normalizeRepo(config.repo());

        String contentsUrl = API_BASE + "/repos/" + repo + "/contents/" + config.filePath() + "?ref=" + config.branch();
        String blobSha = get(contentsUrl, config.token()).get("sha").asText();

        String encoded = Base64.getEncoder().encodeToString(content.getBytes(StandardCharsets.UTF_8));
        ObjectNode body = objectMapper.createObjectNode();
        body.put("message", message);
        body.put("content", encoded);
        body.put("sha", blobSha);
        body.put("branch", config.branch());

        JsonNode result = put(contentsUrl, body, config.token());
        String newSha = result.path("commit").path("sha").asText();
        String shortId = newSha.length() >= 7 ? newSha.substring(0, 7) : newSha;
        String createdAt = result.path("commit").path("author").path("date").asText("");
        String author = result.path("commit").path("author").path("name").asText("");
        String commitUrl = "https://github.com/" + repo + "/commit/" + newSha;
        return new ConfigVersionDto.Summary(shortId, message, createdAt, commitUrl, author);
    }

    public String readCurrentFile(GitHubConfig config) {
        assertConfigured(config);
        String repo = normalizeRepo(config.repo());
        String url = API_BASE + "/repos/" + repo + "/contents/" + config.filePath() + "?ref=" + config.branch();
        return GitProviderUtils.decodeBase64Content(get(url, config.token()).get("content").asText());
    }

    private boolean isConfigured(GitHubConfig config) {
        return !GitProviderUtils.isBlank(config.token())
                && !GitProviderUtils.isBlank(config.repo())
                && !GitProviderUtils.isBlank(config.branch())
                && !GitProviderUtils.isBlank(config.filePath());
    }

    private void assertConfigured(GitHubConfig config) {
        if (!isConfigured(config)) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "GitHub integration not configured");
        }
    }

    // strip optional URL prefix so callers can pass either "owner/repo" or the full GitHub URL
    private String normalizeRepo(String repo) {
        repo = repo.strip();
        if (repo.startsWith("https://github.com/")) repo = repo.substring("https://github.com/".length());
        if (repo.startsWith("github.com/")) repo = repo.substring("github.com/".length());
        return repo.replaceAll("/+$", "");
    }

    private HttpRequest.Builder baseRequest(String url, String token) {
        return HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Bearer " + token)
                .header("Accept", "application/vnd.github+json")
                .header("X-GitHub-Api-Version", "2022-11-28");
    }

    private JsonNode get(String url, String token) {
        try {
            HttpResponse<String> response = httpClient.send(
                    baseRequest(url, token).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 404) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Not found: " + url);
            if (response.statusCode() >= 400) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "GitHub API error: " + response.statusCode());
            return objectMapper.readTree(response.body());
        } catch (ResponseStatusException e) {
            throw e;
        } catch (IOException | InterruptedException e) {
            throw new RuntimeException("GitHub API request failed", e);
        }
    }

    private JsonNode put(String url, ObjectNode body, String token) {
        try {
            String bodyStr = objectMapper.writeValueAsString(body);
            HttpResponse<String> response = httpClient.send(
                    baseRequest(url, token)
                            .header("Content-Type", "application/json")
                            .PUT(HttpRequest.BodyPublishers.ofString(bodyStr))
                            .build(),
                    HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 400) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "GitHub API error: " + response.statusCode() + " " + response.body());
            return objectMapper.readTree(response.body());
        } catch (ResponseStatusException e) {
            throw e;
        } catch (IOException | InterruptedException e) {
            throw new RuntimeException("GitHub API request failed", e);
        }
    }
}
