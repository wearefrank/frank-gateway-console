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

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public VersioningService(HttpClient httpClient) {
        this.httpClient = httpClient;
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    // strip the full GitHub URL prefix and any trailing slashes so callers can pass either form
    private String normalizeRepo(String repo) {
        if (repo == null) return null;
        repo = repo.strip();

        if (repo.startsWith("https://github.com/")) repo = repo.substring("https://github.com/".length());

        if (repo.startsWith("github.com/")) repo = repo.substring("github.com/".length());
        return repo.replaceAll("/+$", "");
    }

    // fail fast when GitHub integration settings are missing
    private void assertEmptyConfig(String token, String repo, String branch, String filePath) {
        if (isBlank(token) || isBlank(repo) || isBlank(branch) || isBlank(filePath)) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "GitHub integration not configured");
        }
    }

    // shared headers required by every GitHub API call
    private HttpRequest.Builder baseRequest(String url, String token) {
        return HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Bearer " + token)
                .header("Accept", "application/vnd.github+json")
                .header("X-GitHub-Api-Version", "2022-11-28");
    }

    // generic GET - maps 404 to NOT_FOUND, other 4xx/5xx to BAD_GATEWAY
    private JsonNode get(String url, String token) {
        try {
            HttpRequest request = baseRequest(url, token).GET().build();
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

    // generic PUT - used for creating/updating file contents via the GitHub contents API
    private JsonNode put(String url, ObjectNode body, String token) {
        try {
            String bodyStr = objectMapper.writeValueAsString(body);
            HttpRequest request = baseRequest(url, token)
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

    // GitHub returns file content as base64 with embedded newlines - strip whitespace before decoding
    private String decodeContent(String base64Content) {
        byte[] decoded = Base64.getDecoder().decode(base64Content.replaceAll("\\s", ""));
        return new String(decoded, StandardCharsets.UTF_8);
    }

    // returns empty list instead of throwing when integration is unconfigured, so the UI can gracefully hide the panel
    public List<ConfigVersionDto.Summary> listVersions(String token, String repo, String branch, String filePath) {
        repo = normalizeRepo(repo);
        if (isBlank(token) || isBlank(repo) || isBlank(branch) || isBlank(filePath)) {
            return new ArrayList<>();
        }
        String url = GITHUB_API + "/repos/" + repo + "/commits?path=" + filePath + "&sha=" + branch + "&per_page=50";
        JsonNode commits = get(url, token);

        // map each commit to a summary with only the first line of the message
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

    public ConfigVersionDto getVersion(String id, String token, String repo, String branch, String filePath) {
        repo = normalizeRepo(repo);
        assertEmptyConfig(token, repo, branch, filePath);

        // fetch file content at the given commit sha
        String contentsUrl = GITHUB_API + "/repos/" + repo + "/contents/" + filePath + "?ref=" + id;
        JsonNode node = get(contentsUrl, token);
        String content = decodeContent(node.get("content").asText());

        // fetch commit metadata separately - metadata is optional, content is what matters
        String message = "";
        String createdAt = "";
        String commitUrl = GITHUB_API + "/repos/" + repo + "/commits/" + id;
        try {
            JsonNode commitNode = get(commitUrl, token);
            message = commitNode.path("commit").path("message").asText("").lines().findFirst().orElse("");
            createdAt = commitNode.path("commit").path("author").path("date").asText("");
        } catch (ResponseStatusException ignored) {
        }
        return new ConfigVersionDto(id, message, createdAt, content);
    }

    public ConfigVersionDto.Summary saveVersion(String message, String content, String token, String repo, String branch, String filePath) {
        repo = normalizeRepo(repo);
        assertEmptyConfig(token, repo, branch, filePath);

        // the GitHub contents API requires the current blob sha to prevent conflicts
        String contentsUrl = GITHUB_API + "/repos/" + repo + "/contents/" + filePath + "?ref=" + branch;
        JsonNode current = get(contentsUrl, token);
        String blobSha = current.get("sha").asText();

        // content must be base64-encoded for the API
        String encoded = Base64.getEncoder().encodeToString(content.getBytes(StandardCharsets.UTF_8));
        ObjectNode body = objectMapper.createObjectNode();
        body.put("message", message);
        body.put("content", encoded);
        body.put("sha", blobSha);
        body.put("branch", branch);

        // response contains the new commit - extract what we need for the summary
        JsonNode result = put(contentsUrl, body, token);
        String newSha = result.path("commit").path("sha").asText();
        String shortId = newSha.length() >= 7 ? newSha.substring(0, 7) : newSha;
        String createdAt = result.path("commit").path("author").path("date").asText("");
        String author = result.path("commit").path("author").path("name").asText("");
        String commitUrl = "https://github.com/" + repo + "/commit/" + newSha;
        return new ConfigVersionDto.Summary(shortId, message, createdAt, commitUrl, author);
    }

    public String readCurrentFile(String token, String repo, String branch, String filePath) {
        repo = normalizeRepo(repo);
        assertEmptyConfig(token, repo, branch, filePath);
        String url = GITHUB_API + "/repos/" + repo + "/contents/" + filePath + "?ref=" + branch;
        JsonNode node = get(url, token);
        return decodeContent(node.get("content").asText());
    }
}
