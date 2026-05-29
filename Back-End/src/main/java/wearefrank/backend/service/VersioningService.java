package wearefrank.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
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

@Service
public class VersioningService {

    private static final String GITHUB_API = "https://api.github.com";

    private final YamlStoreService yamlStoreService;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public VersioningService(YamlStoreService yamlStoreService, HttpClient httpClient) {
        this.yamlStoreService = yamlStoreService;
        this.httpClient = httpClient;
    }

    private String token() { return yamlStoreService.getFullConfig().githubToken(); }
    private String repo() {
        String repo = yamlStoreService.getFullConfig().githubRepo();
        if (repo == null) return null;
        repo = repo.strip();
        if (repo.startsWith("https://github.com/")) repo = repo.substring("https://github.com/".length());
        if (repo.startsWith("github.com/")) repo = repo.substring("github.com/".length());
        return repo.replaceAll("/+$", "");
    }
    private String branch() { return yamlStoreService.getFullConfig().githubBranch(); }
    private String filePath() { return yamlStoreService.getFullConfig().githubFilePath(); }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private void assertConfigured() {
        if (isBlank(token()) || isBlank(repo()) || isBlank(branch()) || isBlank(filePath())) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "GitHub integration not configured");
        }
    }

    private HttpRequest.Builder baseRequest(String url) {
        return HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Bearer " + token())
                .header("Accept", "application/vnd.github+json")
                .header("X-GitHub-Api-Version", "2022-11-28");
    }

    private JsonNode get(String url) {
        try {
            HttpRequest request = baseRequest(url).GET().build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 404) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Not found: " + url);
            }
            if (response.statusCode() >= 400) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "GitHub API error: " + response.statusCode());
            }
            return objectMapper.readTree(response.body());
        } catch (ResponseStatusException e) {
            throw e;
        } catch (IOException | InterruptedException e) {
            throw new RuntimeException("GitHub API request failed", e);
        }
    }

    private JsonNode put(String url, ObjectNode body) {
        try {
            String bodyStr = objectMapper.writeValueAsString(body);
            HttpRequest request = baseRequest(url)
                    .header("Content-Type", "application/json")
                    .PUT(HttpRequest.BodyPublishers.ofString(bodyStr))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 400) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "GitHub API error: " + response.statusCode() + " " + response.body());
            }
            return objectMapper.readTree(response.body());
        } catch (ResponseStatusException e) {
            throw e;
        } catch (IOException | InterruptedException e) {
            throw new RuntimeException("GitHub API request failed", e);
        }
    }

    private String decodeContent(String base64Content) {
        byte[] decoded = Base64.getDecoder().decode(base64Content.replaceAll("\\s", ""));
        return new String(decoded, StandardCharsets.UTF_8);
    }

    public List<ConfigVersionDto.Summary> listVersions() {
        if (isBlank(token()) || isBlank(repo()) || isBlank(branch()) || isBlank(filePath())) {
            return new ArrayList<>();
        }
        String url = GITHUB_API + "/repos/" + repo() + "/commits?path=" + filePath() + "&sha=" + branch() + "&per_page=50";
        JsonNode commits = get(url);
        List<ConfigVersionDto.Summary> result = new ArrayList<>();
        for (JsonNode commit : commits) {
            String sha = commit.get("sha").asText();
            String shortId = sha.substring(0, 7);
            String message = commit.path("commit").path("message").asText("").lines().findFirst().orElse("");
            String createdAt = commit.path("commit").path("author").path("date").asText();
            String commitUrl = "https://github.com/" + repo() + "/commit/" + sha;
            result.add(new ConfigVersionDto.Summary(shortId, message, createdAt, commitUrl));
        }
        return result;
    }

    public ConfigVersionDto getVersion(String id) {
        assertConfigured();
        String contentsUrl = GITHUB_API + "/repos/" + repo() + "/contents/" + filePath() + "?ref=" + id;
        JsonNode node = get(contentsUrl);
        String content = decodeContent(node.get("content").asText());
        String message = "";
        String createdAt = "";
        String commitUrl = GITHUB_API + "/repos/" + repo() + "/commits/" + id;
        try {
            JsonNode commitNode = get(commitUrl);
            message = commitNode.path("commit").path("message").asText("").lines().findFirst().orElse("");
            createdAt = commitNode.path("commit").path("author").path("date").asText("");
        } catch (ResponseStatusException ignored) {
            // metadata is optional - content is what matters
        }
        return new ConfigVersionDto(id, message, createdAt, content);
    }

    public ConfigVersionDto.Summary saveVersion(String message, String content) {
        assertConfigured();
        String contentsUrl = GITHUB_API + "/repos/" + repo() + "/contents/" + filePath() + "?ref=" + branch();
        JsonNode current = get(contentsUrl);
        String blobSha = current.get("sha").asText();

        String encoded = Base64.getEncoder().encodeToString(content.getBytes(StandardCharsets.UTF_8));
        ObjectNode body = objectMapper.createObjectNode();
        body.put("message", message);
        body.put("content", encoded);
        body.put("sha", blobSha);
        body.put("branch", branch());

        JsonNode result = put(contentsUrl, body);
        String newSha = result.path("commit").path("sha").asText();
        String shortId = newSha.length() >= 7 ? newSha.substring(0, 7) : newSha;
        String createdAt = result.path("commit").path("author").path("date").asText("");
        String commitUrl = "https://github.com/" + repo() + "/commit/" + newSha;
        return new ConfigVersionDto.Summary(shortId, message, createdAt, commitUrl);
    }

    public String readCurrentFile() {
        assertConfigured();
        String url = GITHUB_API + "/repos/" + repo() + "/contents/" + filePath() + "?ref=" + branch();
        JsonNode node = get(url);
        return decodeContent(node.get("content").asText());
    }
}
