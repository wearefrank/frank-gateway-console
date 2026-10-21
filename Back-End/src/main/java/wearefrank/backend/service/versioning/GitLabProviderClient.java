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
import java.util.Arrays;
import java.util.Base64;
import java.util.List;

@Component
public class GitLabProviderClient extends AbstractGitProviderClient {

    private static final String DEFAULT_HOST = "https://gitlab.com";

    public GitLabProviderClient(HttpClient httpClient) {
        super(httpClient);
    }

    @Override
    public String providerName() { return "gitlab"; }

    @Override
    public List<ConfigVersionDto.Summary> listVersions(GitProviderConfig config) {
        GitLabConfig c = cast(config);
        if (!isConfigured(c)) return new ArrayList<>();
        String host = resolveHost(c.host());
        String url = host + "/api/v4/projects/" + encodePath(c.project())
                + "/repository/commits?path=" + encode(c.filePath())
                + "&ref_name=" + encode(c.branch()) + "&per_page=50";
        JsonNode commits = get(url, c.token());

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

    @Override
    public ConfigVersionDto getVersion(String id, GitProviderConfig config) {
        GitLabConfig c = cast(config);
        assertConfigured(c);
        String host = resolveHost(c.host());

        String content = decodeBase64Content(get(fileUrl(c, id), c.token()).get("content").asText());

        String message = "";
        String createdAt = "";
        try {
            JsonNode commitNode = get(host + "/api/v4/projects/" + encodePath(c.project())
                    + "/repository/commits/" + encode(id), c.token());
            message = commitNode.path("message").asText("").lines().findFirst().orElse("");
            createdAt = commitNode.path("created_at").asText("");
        } catch (ResponseStatusException ignored) {}

        return new ConfigVersionDto(id, message, createdAt, content);
    }

    @Override
    public ConfigVersionDto.Summary saveVersion(String message, String content, GitProviderConfig config) {
        GitLabConfig c = cast(config);
        assertConfigured(c);
        String host = resolveHost(c.host());
        String writeUrl = host + "/api/v4/projects/" + encodePath(c.project())
                + "/repository/files/" + encodePath(c.filePath());

        String encoded = Base64.getEncoder().encodeToString(content.getBytes(StandardCharsets.UTF_8));
        ObjectNode body = objectMapper.createObjectNode();
        body.put("branch", c.branch());
        body.put("content", encoded);
        body.put("commit_message", message);
        body.put("encoding", "base64");

        // GitLab uses POST to create and PUT to update
        boolean fileAlreadyExists = getOrNull(fileUrl(c, c.branch()), c.token()) != null;
        write(fileAlreadyExists ? "PUT" : "POST", writeUrl, body, c.token());

        // the file update response only contains {file_path, branch} - fetch the latest commit for metadata
        String commitsUrl = host + "/api/v4/projects/" + encodePath(c.project())
                + "/repository/commits?ref_name=" + encode(c.branch()) + "&per_page=1";
        JsonNode commits = get(commitsUrl, c.token());
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

    @Override
    protected String fileUrl(GitProviderConfig config, String ref) {
        GitLabConfig c = cast(config);
        return resolveHost(c.host()) + "/api/v4/projects/" + encodePath(c.project())
                + "/repository/files/" + encodePath(c.filePath()) + "?ref=" + encode(ref);
    }

    // Host is optional: blank means gitlab.com.
    @Override
    protected List<String> requiredSettings(GitProviderConfig config) {
        return Arrays.asList(cast(config).project());
    }

    @Override
    protected String displayName() { return "GitLab"; }

    // Bearer rather than PRIVATE-TOKEN: PRIVATE-TOKEN only accepts personal/project access
    // tokens, and a token brokered through Keycloak is an OAuth token. GitLab accepts both
    // kinds on Bearer, so this covers the manually entered tokens too.
    @Override
    protected HttpRequest.Builder baseRequest(String url, String token) {
        return HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Bearer " + token);
    }

    private GitLabConfig cast(GitProviderConfig config) {
        if (config instanceof GitLabConfig c) return c;
        throw new IllegalArgumentException("Expected GitLabConfig, got " + config.getClass().getSimpleName());
    }

    private String resolveHost(String host) {
        return isBlank(host) ? DEFAULT_HOST : normalizeHost(host);
    }

    // GitLab takes namespace/project and file paths as one encoded segment (e.g. owner%2Frepo)
    private String encodePath(String path) {
        return encode(path);
    }
}
