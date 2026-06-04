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
public class GitLabProviderClient {

    private static final String DEFAULT_HOST = "https://gitlab.com";

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public GitLabProviderClient(HttpClient httpClient) {
        this.httpClient = httpClient;
    }

    public List<ConfigVersionDto.Summary> listVersions(GitLabConfig config) {
        if (!isConfigured(config)) return new ArrayList<>();
        String host = resolveHost(config.host());
        String url = host + "/api/v4/projects/" + encodePath(config.project())
                + "/repository/commits?path=" + config.filePath()
                + "&ref_name=" + config.branch() + "&per_page=50";
        JsonNode commits = get(url, config.token());

        List<ConfigVersionDto.Summary> result = new ArrayList<>();
        for (JsonNode commit : commits) {
            String sha = commit.get("id").asText();
            String message = commit.path("message").asText("").lines().findFirst().orElse("");
            String createdAt = commit.path("created_at").asText();
            String author = commit.path("author_name").asText("");
            String commitUrl = commit.path("web_url").asText("");
            result.add(new ConfigVersionDto.Summary(sha, message, createdAt, commitUrl, author));
        }
        return result;
    }

    public ConfigVersionDto getVersion(String id, GitLabConfig config) {
        assertConfigured(config);
        String host = resolveHost(config.host());

        String fileUrl = host + "/api/v4/projects/" + encodePath(config.project())
                + "/repository/files/" + encodePath(config.filePath()) + "?ref=" + id;
        String content = GitProviderUtils.decodeBase64Content(get(fileUrl, config.token()).get("content").asText());

        String message = "";
        String createdAt = "";
        try {
            JsonNode commitNode = get(host + "/api/v4/projects/" + encodePath(config.project())
                    + "/repository/commits/" + id, config.token());
            message = commitNode.path("message").asText("").lines().findFirst().orElse("");
            createdAt = commitNode.path("created_at").asText("");
        } catch (ResponseStatusException ignored) {}

        return new ConfigVersionDto(id, message, createdAt, content);
    }

    public ConfigVersionDto.Summary saveVersion(String message, String content, GitLabConfig config) {
        assertConfigured(config);
        String host = resolveHost(config.host());
        String fileUrl = host + "/api/v4/projects/" + encodePath(config.project())
                + "/repository/files/" + encodePath(config.filePath());

        String encoded = Base64.getEncoder().encodeToString(content.getBytes(StandardCharsets.UTF_8));
        ObjectNode body = objectMapper.createObjectNode();
        body.put("branch", config.branch());
        body.put("content", encoded);
        body.put("commit_message", message);
        body.put("encoding", "base64");

        // GitLab uses POST to create and PUT to update
        boolean fileExists;
        try {
            get(fileUrl + "?ref=" + config.branch(), config.token());
            fileExists = true;
        } catch (ResponseStatusException e) {
            fileExists = e.getStatusCode().value() != 404;
        }

        if (fileExists) {
            put(fileUrl, body, config.token());
        } else {
            post(fileUrl, body, config.token());
        }

        // the file update response only contains {file_path, branch} - fetch the latest commit for metadata
        String commitsUrl = host + "/api/v4/projects/" + encodePath(config.project())
                + "/repository/commits?ref_name=" + config.branch() + "&per_page=1";
        JsonNode commits = get(commitsUrl, config.token());
        if (!commits.isArray() || commits.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Could not retrieve commit after save");
        }
        JsonNode commit = commits.get(0);
        String sha = commit.get("id").asText();
        String createdAt = commit.path("created_at").asText("");
        String author = commit.path("author_name").asText("");
        String commitUrl = commit.path("web_url").asText("");
        return new ConfigVersionDto.Summary(sha, message, createdAt, commitUrl, author);
    }

    public String readCurrentFile(GitLabConfig config) {
        assertConfigured(config);
        String host = resolveHost(config.host());
        String url = host + "/api/v4/projects/" + encodePath(config.project())
                + "/repository/files/" + encodePath(config.filePath()) + "?ref=" + config.branch();
        return GitProviderUtils.decodeBase64Content(get(url, config.token()).get("content").asText());
    }

    private boolean isConfigured(GitLabConfig config) {
        return !GitProviderUtils.isBlank(config.token())
                && !GitProviderUtils.isBlank(config.project())
                && !GitProviderUtils.isBlank(config.branch())
                && !GitProviderUtils.isBlank(config.filePath());
    }

    private void assertConfigured(GitLabConfig config) {
        if (!isConfigured(config)) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "GitLab integration not configured");
        }
    }

    private String resolveHost(String host) {
        return GitProviderUtils.isBlank(host) ? DEFAULT_HOST : GitProviderUtils.normalizeHost(host);
    }

    // GitLab accepts URL-encoded namespace/project paths (e.g. owner%2Frepo)
    private String encodePath(String path) {
        return path.replace("/", "%2F");
    }

    private HttpRequest.Builder baseRequest(String url, String token) {
        return HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("PRIVATE-TOKEN", token)
                .header("Content-Type", "application/json");
    }

    private JsonNode get(String url, String token) {
        try {
            HttpResponse<String> response = httpClient.send(
                    baseRequest(url, token).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 404) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Not found: " + url);
            if (response.statusCode() >= 400) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "GitLab API error: " + response.statusCode());
            return objectMapper.readTree(response.body());
        } catch (ResponseStatusException e) {
            throw e;
        } catch (IOException | InterruptedException e) {
            throw new RuntimeException("GitLab API request failed", e);
        }
    }

    private JsonNode put(String url, ObjectNode body, String token) {
        try {
            String bodyStr = objectMapper.writeValueAsString(body);
            HttpResponse<String> response = httpClient.send(
                    baseRequest(url, token).PUT(HttpRequest.BodyPublishers.ofString(bodyStr)).build(),
                    HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 400) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "GitLab API error: " + response.statusCode() + " " + response.body());
            return objectMapper.readTree(response.body());
        } catch (ResponseStatusException e) {
            throw e;
        } catch (IOException | InterruptedException e) {
            throw new RuntimeException("GitLab API request failed", e);
        }
    }

    private JsonNode post(String url, ObjectNode body, String token) {
        try {
            String bodyStr = objectMapper.writeValueAsString(body);
            HttpResponse<String> response = httpClient.send(
                    baseRequest(url, token).POST(HttpRequest.BodyPublishers.ofString(bodyStr)).build(),
                    HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 400) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "GitLab API error: " + response.statusCode() + " " + response.body());
            return objectMapper.readTree(response.body());
        } catch (ResponseStatusException e) {
            throw e;
        } catch (IOException | InterruptedException e) {
            throw new RuntimeException("GitLab API request failed", e);
        }
    }
}
