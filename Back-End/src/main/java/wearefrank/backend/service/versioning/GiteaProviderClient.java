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
public class GiteaProviderClient extends AbstractGitProviderClient<GiteaConfig> {

    public GiteaProviderClient(HttpClient httpClient) {
        super(httpClient, GiteaConfig.class);
    }

    @Override
    public String providerName() { return "gitea"; }

    @Override
    public List<ConfigVersionDto.Summary> listVersions(GitProviderConfig config) {
        GiteaConfig c = cast(config);
        if (!isConfigured(c)) return new ArrayList<>();
        String host = normalizeHost(c.host());
        String url = host + "/api/v1/repos/" + encodeSegments(c.repo()) + "/commits?sha=" + encode(c.branch())
                + "&path=" + encode(c.filePath()) + "&limit=50";
        JsonNode commits = get(url, c.token());

        // Gitea's commit structure mirrors GitHub's
        List<ConfigVersionDto.Summary> result = new ArrayList<>();
        for (JsonNode commit : commits) {
            JsonNode detail = commit.path("commit");
            result.add(commitSummary(commit.get("sha").asText(), firstLine(detail.path("message").asText("")),
                    detail.path("author"), commit.path("html_url").asText("")));
        }
        return result;
    }

    @Override
    public ConfigVersionDto getVersion(String id, GitProviderConfig config) {
        GiteaConfig c = cast(config);
        assertConfigured(c);
        String host = normalizeHost(c.host());

        String content = decodeBase64Content(get(fileUrl(c, id), c.token()).get("content").asText());

        String message = "";
        String createdAt = "";
        try {
            JsonNode commitNode = get(host + "/api/v1/repos/" + encodeSegments(c.repo()) + "/git/commits/" + encode(id), c.token());
            message = firstLine(commitNode.path("message").asText(""));
            createdAt = commitNode.path("author").path("date").asText("");
        } catch (ResponseStatusException ignored) {}

        return new ConfigVersionDto(id, message, createdAt, content);
    }

    @Override
    public ConfigVersionDto.Summary saveVersion(String message, String content, GitProviderConfig config) {
        GiteaConfig c = cast(config);
        assertConfigured(c);
        String host = normalizeHost(c.host());
        String contentsUrl = host + "/api/v1/repos/" + encodeSegments(c.repo()) + "/contents/" + encodeSegments(c.filePath());

        ObjectNode body = objectMapper.createObjectNode();
        body.put("message", message);
        body.put("content", encodeBase64Content(content));
        body.put("branch", c.branch());

        // include the current blob sha if the file already exists
        JsonNode current = getOrNull(fileUrl(c, c.branch()), c.token());
        if (current != null) body.put("sha", current.get("sha").asText());
        JsonNode result = write(current != null ? "PUT" : "POST", contentsUrl, body, c.token());

        // Gitea's response mirrors GitHub's: result.commit contains the new commit info
        JsonNode commit = result.path("commit");
        return commitSummary(commit.path("sha").asText(), message, commit.path("author"), commit.path("html_url").asText(""));
    }

    @Override
    protected String fileUrl(GitProviderConfig config, String ref) {
        GiteaConfig c = cast(config);
        return normalizeHost(c.host()) + "/api/v1/repos/" + encodeSegments(c.repo())
                + "/contents/" + encodeSegments(c.filePath()) + "?ref=" + encode(ref);
    }

    @Override
    protected List<String> requiredSettings(GitProviderConfig config) {
        GiteaConfig c = cast(config);
        return Arrays.asList(c.host(), c.repo());
    }

    @Override
    protected String displayName() { return "Gitea"; }

    @Override
    protected HttpRequest.Builder baseRequest(String url, String token) {
        // Gitea uses "token <token>" rather than "Bearer <token>"
        return HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "token " + token);
    }
}
