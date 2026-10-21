package wearefrank.backend.service.versioning;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import wearefrank.backend.dto.ConfigVersionDto;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
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
        String url = API_BASE + "/repos/" + encodeSegments(repo) + "/commits?path=" + encode(c.filePath())
                + "&sha=" + encode(c.branch()) + "&per_page=50";
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

        String content = decodeBase64Content(get(fileUrl(c, id), c.token()).get("content").asText());

        String message = "";
        String createdAt = "";
        try {
            JsonNode commitNode = get(API_BASE + "/repos/" + encodeSegments(repo) + "/commits/" + encode(id), c.token());
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

        JsonNode current = getOrNull(fileUrl(c, c.branch()), c.token());
        String blobSha = current != null ? current.get("sha").asText() : null;

        String encoded = Base64.getEncoder().encodeToString(content.getBytes(StandardCharsets.UTF_8));
        ObjectNode body = objectMapper.createObjectNode();
        body.put("message", message);
        body.put("content", encoded);
        if (blobSha != null) body.put("sha", blobSha);
        body.put("branch", c.branch());

        String putUrl = API_BASE + "/repos/" + encodeSegments(repo) + "/contents/" + encodeSegments(c.filePath());
        JsonNode result = write("PUT", putUrl, body, c.token());
        String newSha = result.path("commit").path("sha").asText();
        String shortId = newSha.length() >= 7 ? newSha.substring(0, 7) : newSha;
        String createdAt = result.path("commit").path("author").path("date").asText("");
        String author = result.path("commit").path("author").path("name").asText("");
        String commitUrl = "https://github.com/" + repo + "/commit/" + newSha;
        return new ConfigVersionDto.Summary(shortId, message, createdAt, commitUrl, author);
    }

    @Override
    protected String fileUrl(GitProviderConfig config, String ref) {
        GitHubConfig c = cast(config);
        return API_BASE + "/repos/" + encodeSegments(normalizeRepo(c.repo()))
                + "/contents/" + encodeSegments(c.filePath()) + "?ref=" + encode(ref);
    }

    @Override
    protected List<String> requiredSettings(GitProviderConfig config) {
        return Arrays.asList(cast(config).repo());
    }

    @Override
    protected String displayName() { return "GitHub"; }

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

    private String normalizeRepo(String repo) {
        repo = repo.strip();
        if (repo.startsWith("https://github.com/")) repo = repo.substring("https://github.com/".length());
        if (repo.startsWith("github.com/")) repo = repo.substring("github.com/".length());
        return repo.replaceAll("/+$", "");
    }
}
