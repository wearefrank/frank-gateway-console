package wearefrank.backend.service.versioning;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import wearefrank.backend.dto.ConfigVersionDto;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

@Component
public class GitHubProviderClient extends AbstractGitProviderClient {

    private static final String API_BASE = "https://api.github.com";

    public GitHubProviderClient(HttpClient httpClient) {
        super(httpClient);
    }

    @Override
    public String providerName() { return "github"; }

    @Override
    public List<ConfigVersionDto.Summary> listVersions(GitProviderConfig config) {
        GitHubConfig c = cast(config);
        if (!isConfigured(c)) return new ArrayList<>();
        String repo = normalizeRepo(c.repo());
        String url = API_BASE + "/repos/" + repo + "/commits?path=" + c.filePath()
                + "&sha=" + c.branch() + "&per_page=50";
        JsonNode commits = get(url, c.token());

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

    @Override
    public ConfigVersionDto getVersion(String id, GitProviderConfig config) {
        GitHubConfig c = cast(config);
        assertConfigured(c);
        String repo = normalizeRepo(c.repo());

        String contentsUrl = API_BASE + "/repos/" + repo + "/contents/" + c.filePath() + "?ref=" + id;
        String content = decodeBase64Content(get(contentsUrl, c.token()).get("content").asText());

        String message = "";
        String createdAt = "";
        try {
            JsonNode commitNode = get(API_BASE + "/repos/" + repo + "/commits/" + id, c.token());
            message = commitNode.path("commit").path("message").asText("").lines().findFirst().orElse("");
            createdAt = commitNode.path("commit").path("author").path("date").asText("");
        } catch (ResponseStatusException ignored) {}

        return new ConfigVersionDto(id, message, createdAt, content);
    }

    @Override
    public ConfigVersionDto.Summary saveVersion(String message, String content, GitProviderConfig config) {
        GitHubConfig c = cast(config);
        assertConfigured(c);
        String repo = normalizeRepo(c.repo());

        String contentsUrl = API_BASE + "/repos/" + repo + "/contents/" + c.filePath() + "?ref=" + c.branch();
        String blobSha = null;
        try {
            blobSha = get(contentsUrl, c.token()).get("sha").asText();
        } catch (ResponseStatusException e) {
            if (e.getStatusCode().value() != 404) throw e;
        }

        String encoded = Base64.getEncoder().encodeToString(content.getBytes(StandardCharsets.UTF_8));
        ObjectNode body = objectMapper.createObjectNode();
        body.put("message", message);
        body.put("content", encoded);
        if (blobSha != null) body.put("sha", blobSha);
        body.put("branch", c.branch());

        String putUrl = API_BASE + "/repos/" + repo + "/contents/" + c.filePath();
        JsonNode result = put(putUrl, body, c.token());
        String newSha = result.path("commit").path("sha").asText();
        String shortId = newSha.length() >= 7 ? newSha.substring(0, 7) : newSha;
        String createdAt = result.path("commit").path("author").path("date").asText("");
        String author = result.path("commit").path("author").path("name").asText("");
        String commitUrl = "https://github.com/" + repo + "/commit/" + newSha;
        return new ConfigVersionDto.Summary(shortId, message, createdAt, commitUrl, author);
    }

    @Override
    public String readCurrentFile(GitProviderConfig config) {
        GitHubConfig c = cast(config);
        assertConfigured(c);
        String repo = normalizeRepo(c.repo());
        String url = API_BASE + "/repos/" + repo + "/contents/" + c.filePath() + "?ref=" + c.branch();
        return decodeBase64Content(get(url, c.token()).get("content").asText());
    }

    @Override
    public boolean fileExists(GitProviderConfig config) {
        GitHubConfig c = cast(config);
        if (!isConfigured(c)) return false;
        String repo = normalizeRepo(c.repo());
        String url = API_BASE + "/repos/" + repo + "/contents/" + c.filePath() + "?ref=" + c.branch();
        try {
            get(url, c.token());
            return true;
        } catch (ResponseStatusException e) {
            if (e.getStatusCode().value() == 404) return false;
            throw e;
        }
    }

    @Override
    protected HttpRequest.Builder baseRequest(String url, String token) {
        return HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Bearer " + token)
                .header("Accept", "application/vnd.github+json")
                .header("X-GitHub-Api-Version", "2022-11-28");
    }

    private GitHubConfig cast(GitProviderConfig config) {
        if (config instanceof GitHubConfig c) return c;
        throw new IllegalArgumentException("Expected GitHubConfig, got " + config.getClass().getSimpleName());
    }

    private boolean isConfigured(GitHubConfig config) {
        return !isBlank(config.token())
                && !isBlank(config.repo())
                && !isBlank(config.branch())
                && !isBlank(config.filePath());
    }

    private void assertConfigured(GitHubConfig config) {
        if (!isConfigured(config)) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "GitHub integration not configured");
        }
    }

    private String normalizeRepo(String repo) {
        repo = repo.strip();
        if (repo.startsWith("https://github.com/")) repo = repo.substring("https://github.com/".length());
        if (repo.startsWith("github.com/")) repo = repo.substring("github.com/".length());
        return repo.replaceAll("/+$", "");
    }
}
