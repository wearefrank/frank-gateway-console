package wearefrank.backend.service.versioning;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import wearefrank.backend.dto.ConfigVersionDto;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@Component
public class GitHubProviderClient extends AbstractGitProviderClient<GitHubConfig> {

    private static final String API_BASE = "https://api.github.com";

    public GitHubProviderClient(HttpClient httpClient) {
        super(httpClient, GitHubConfig.class);
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
            JsonNode detail = commit.path("commit");
            result.add(commitSummary(sha, firstLine(detail.path("message").asText("")), detail.path("author"),
                    "https://github.com/" + repo + "/commit/" + sha));
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
            message = firstLine(commitNode.path("commit").path("message").asText(""));
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

        ObjectNode body = objectMapper.createObjectNode();
        body.put("message", message);
        body.put("content", encodeBase64Content(content));
        if (blobSha != null) body.put("sha", blobSha);
        body.put("branch", c.branch());

        String putUrl = API_BASE + "/repos/" + encodeSegments(repo) + "/contents/" + encodeSegments(c.filePath());
        JsonNode commit = write("PUT", putUrl, body, c.token()).path("commit");
        String newSha = commit.path("sha").asText();
        return commitSummary(newSha, message, commit.path("author"), "https://github.com/" + repo + "/commit/" + newSha);
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

    private String normalizeRepo(String repo) {
        repo = repo.strip();
        if (repo.startsWith("https://github.com/")) repo = repo.substring("https://github.com/".length());
        if (repo.startsWith("github.com/")) repo = repo.substring("github.com/".length());
        return repo.replaceAll("/+$", "");
    }
}
