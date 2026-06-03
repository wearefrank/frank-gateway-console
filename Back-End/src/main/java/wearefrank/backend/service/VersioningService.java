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
    private static final String GITLAB_DEFAULT_HOST = "https://gitlab.com";

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public VersioningService(HttpClient httpClient) {
        this.httpClient = httpClient;
    }

    // ── shared ────────────────────────────────────────────────────────────────

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    // both GitHub and GitLab return file content as base64 with embedded newlines
    private String decodeContent(String base64Content) {
        byte[] decoded = Base64.getDecoder().decode(base64Content.replaceAll("\\s", ""));
        return new String(decoded, StandardCharsets.UTF_8);
    }

    // ── GitHub helpers ────────────────────────────────────────────────────────

    // strip the full GitHub URL prefix and any trailing slashes so callers can pass either form
    private String normalizeRepo(String repo) {
        if (repo == null) return null;
        repo = repo.strip();
        if (repo.startsWith("https://github.com/")) repo = repo.substring("https://github.com/".length());
        if (repo.startsWith("github.com/")) repo = repo.substring("github.com/".length());
        return repo.replaceAll("/+$", "");
    }

    private void assertGithubConfig(String token, String repo, String branch, String filePath) {
        if (isBlank(token) || isBlank(repo) || isBlank(branch) || isBlank(filePath)) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "GitHub integration not configured");
        }
    }

    // shared headers required by every GitHub API call
    private HttpRequest.Builder githubRequest(String url, String token) {
        return HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Bearer " + token)
                .header("Accept", "application/vnd.github+json")
                .header("X-GitHub-Api-Version", "2022-11-28");
    }

    // generic GET - maps 404 to NOT_FOUND, other 4xx/5xx to BAD_GATEWAY
    private JsonNode githubGet(String url, String token) {
        try {
            HttpRequest request = githubRequest(url, token).GET().build();
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
    private JsonNode githubPut(String url, ObjectNode body, String token) {
        try {
            String bodyStr = objectMapper.writeValueAsString(body);
            HttpRequest request = githubRequest(url, token)
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

    // ── GitLab helpers ────────────────────────────────────────────────────────

    private String normalizeGitlabHost(String host) {
        if (isBlank(host)) return GITLAB_DEFAULT_HOST;
        return host.strip().replaceAll("/+$", "");
    }

    // GitLab accepts URL-encoded namespace/project as a project identifier (e.g. owner%2Frepo)
    private String encodeGitlabPath(String path) {
        return path.replace("/", "%2F");
    }

    private void assertGitlabConfig(String token, String project, String branch, String filePath) {
        if (isBlank(token) || isBlank(project) || isBlank(branch) || isBlank(filePath)) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "GitLab integration not configured");
        }
    }

    private HttpRequest.Builder gitlabRequest(String url, String token) {
        return HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("PRIVATE-TOKEN", token)
                .header("Content-Type", "application/json");
    }

    private JsonNode gitlabGet(String url, String token) {
        try {
            HttpRequest request = gitlabRequest(url, token).GET().build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 404) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Not found: " + url);
            }
            if (response.statusCode() >= 400) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "GitLab API error: " + response.statusCode());
            }
            return objectMapper.readTree(response.body());
        } catch (ResponseStatusException e) {
            throw e;
        } catch (IOException | InterruptedException e) {
            throw new RuntimeException("GitLab API request failed", e);
        }
    }

    private JsonNode gitlabPut(String url, ObjectNode body, String token) {
        try {
            String bodyStr = objectMapper.writeValueAsString(body);
            HttpRequest request = gitlabRequest(url, token)
                    .PUT(HttpRequest.BodyPublishers.ofString(bodyStr))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 400) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "GitLab API error: " + response.statusCode() + " " + response.body());
            }
            return objectMapper.readTree(response.body());
        } catch (ResponseStatusException e) {
            throw e;
        } catch (IOException | InterruptedException e) {
            throw new RuntimeException("GitLab API request failed", e);
        }
    }

    private JsonNode gitlabPost(String url, ObjectNode body, String token) {
        try {
            String bodyStr = objectMapper.writeValueAsString(body);
            HttpRequest request = gitlabRequest(url, token)
                    .POST(HttpRequest.BodyPublishers.ofString(bodyStr))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 400) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "GitLab API error: " + response.statusCode() + " " + response.body());
            }
            return objectMapper.readTree(response.body());
        } catch (ResponseStatusException e) {
            throw e;
        } catch (IOException | InterruptedException e) {
            throw new RuntimeException("GitLab API request failed", e);
        }
    }

    // ── GitHub operations ─────────────────────────────────────────────────────

    // returns empty list instead of throwing when integration is unconfigured, so the UI can gracefully hide the panel
    private List<ConfigVersionDto.Summary> listVersionsGithub(String token, String repo, String branch, String filePath) {
        repo = normalizeRepo(repo);
        if (isBlank(token) || isBlank(repo) || isBlank(branch) || isBlank(filePath)) {
            return new ArrayList<>();
        }
        String url = GITHUB_API + "/repos/" + repo + "/commits?path=" + filePath + "&sha=" + branch + "&per_page=50";
        JsonNode commits = githubGet(url, token);

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

    private ConfigVersionDto getVersionGithub(String id, String token, String repo, String branch, String filePath) {
        repo = normalizeRepo(repo);
        assertGithubConfig(token, repo, branch, filePath);

        // fetch file content at the given commit sha
        String contentsUrl = GITHUB_API + "/repos/" + repo + "/contents/" + filePath + "?ref=" + id;
        JsonNode node = githubGet(contentsUrl, token);
        String content = decodeContent(node.get("content").asText());

        // fetch commit metadata separately - metadata is optional, content is what matters
        String message = "";
        String createdAt = "";
        try {
            JsonNode commitNode = githubGet(GITHUB_API + "/repos/" + repo + "/commits/" + id, token);
            message = commitNode.path("commit").path("message").asText("").lines().findFirst().orElse("");
            createdAt = commitNode.path("commit").path("author").path("date").asText("");
        } catch (ResponseStatusException ignored) {
        }
        return new ConfigVersionDto(id, message, createdAt, content);
    }

    private ConfigVersionDto.Summary saveVersionGithub(String message, String content, String token, String repo, String branch, String filePath) {
        repo = normalizeRepo(repo);
        assertGithubConfig(token, repo, branch, filePath);

        // the GitHub contents API requires the current blob sha to prevent conflicts
        String contentsUrl = GITHUB_API + "/repos/" + repo + "/contents/" + filePath + "?ref=" + branch;
        JsonNode current = githubGet(contentsUrl, token);
        String blobSha = current.get("sha").asText();

        // content must be base64-encoded for the API
        String encoded = Base64.getEncoder().encodeToString(content.getBytes(StandardCharsets.UTF_8));
        ObjectNode body = objectMapper.createObjectNode();
        body.put("message", message);
        body.put("content", encoded);
        body.put("sha", blobSha);
        body.put("branch", branch);

        // response contains the new commit - extract what we need for the summary
        JsonNode result = githubPut(contentsUrl, body, token);
        String newSha = result.path("commit").path("sha").asText();
        String shortId = newSha.length() >= 7 ? newSha.substring(0, 7) : newSha;
        String createdAt = result.path("commit").path("author").path("date").asText("");
        String author = result.path("commit").path("author").path("name").asText("");
        String commitUrl = "https://github.com/" + repo + "/commit/" + newSha;
        return new ConfigVersionDto.Summary(shortId, message, createdAt, commitUrl, author);
    }

    private String readCurrentFileGithub(String token, String repo, String branch, String filePath) {
        repo = normalizeRepo(repo);
        assertGithubConfig(token, repo, branch, filePath);
        String url = GITHUB_API + "/repos/" + repo + "/contents/" + filePath + "?ref=" + branch;
        JsonNode node = githubGet(url, token);
        return decodeContent(node.get("content").asText());
    }

    // ── GitLab operations ─────────────────────────────────────────────────────

    private List<ConfigVersionDto.Summary> listVersionsGitlab(String token, String host, String project, String branch, String filePath) {
        if (isBlank(token) || isBlank(project) || isBlank(branch) || isBlank(filePath)) {
            return new ArrayList<>();
        }
        host = normalizeGitlabHost(host);
        String encodedProject = encodeGitlabPath(project);
        String url = host + "/api/v4/projects/" + encodedProject + "/repository/commits?path=" + filePath + "&ref_name=" + branch + "&per_page=50";
        JsonNode commits = gitlabGet(url, token);

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

    private ConfigVersionDto getVersionGitlab(String id, String token, String host, String project, String branch, String filePath) {
        assertGitlabConfig(token, project, branch, filePath);
        host = normalizeGitlabHost(host);
        String encodedProject = encodeGitlabPath(project);
        String encodedFilePath = encodeGitlabPath(filePath);

        // fetch file content at the given commit ref
        String fileUrl = host + "/api/v4/projects/" + encodedProject + "/repository/files/" + encodedFilePath + "?ref=" + id;
        JsonNode fileNode = gitlabGet(fileUrl, token);
        String content = decodeContent(fileNode.get("content").asText());

        // fetch commit metadata separately - metadata is optional, content is what matters
        String message = "";
        String createdAt = "";
        try {
            JsonNode commitNode = gitlabGet(host + "/api/v4/projects/" + encodedProject + "/repository/commits/" + id, token);
            message = commitNode.path("message").asText("").lines().findFirst().orElse("");
            createdAt = commitNode.path("created_at").asText("");
        } catch (ResponseStatusException ignored) {
        }
        return new ConfigVersionDto(id, message, createdAt, content);
    }

    private ConfigVersionDto.Summary saveVersionGitlab(String message, String content, String token, String host, String project, String branch, String filePath) {
        assertGitlabConfig(token, project, branch, filePath);
        host = normalizeGitlabHost(host);
        String encodedProject = encodeGitlabPath(project);
        String encodedFilePath = encodeGitlabPath(filePath);

        // content must be base64-encoded for the GitLab files API
        String encoded = Base64.getEncoder().encodeToString(content.getBytes(StandardCharsets.UTF_8));
        ObjectNode body = objectMapper.createObjectNode();
        body.put("branch", branch);
        body.put("content", encoded);
        body.put("commit_message", message);
        body.put("encoding", "base64");

        String fileUrl = host + "/api/v4/projects/" + encodedProject + "/repository/files/" + encodedFilePath;

        // GitLab uses POST to create a new file and PUT to update an existing one
        boolean fileExists;
        try {
            gitlabGet(fileUrl + "?ref=" + branch, token);
            fileExists = true;
        } catch (ResponseStatusException e) {
            fileExists = e.getStatusCode().value() != 404;
        }

        if (fileExists) {
            gitlabPut(fileUrl, body, token);
        } else {
            gitlabPost(fileUrl, body, token);
        }

        // the GitLab file update response only contains {file_path, branch} - fetch the latest commit to get the sha
        String commitsUrl = host + "/api/v4/projects/" + encodedProject + "/repository/commits?ref_name=" + branch + "&per_page=1";
        JsonNode commits = gitlabGet(commitsUrl, token);
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

    private String readCurrentFileGitlab(String token, String host, String project, String branch, String filePath) {
        assertGitlabConfig(token, project, branch, filePath);
        host = normalizeGitlabHost(host);
        String encodedProject = encodeGitlabPath(project);
        String encodedFilePath = encodeGitlabPath(filePath);
        String url = host + "/api/v4/projects/" + encodedProject + "/repository/files/" + encodedFilePath + "?ref=" + branch;
        JsonNode node = gitlabGet(url, token);
        return decodeContent(node.get("content").asText());
    }

    // ── public API (dispatches on provider) ───────────────────────────────────

    public List<ConfigVersionDto.Summary> listVersions(
            String provider,
            String githubToken, String githubRepo, String githubBranch, String githubFilePath,
            String gitlabToken, String gitlabHost, String gitlabProject, String gitlabBranch, String gitlabFilePath) {
        if ("gitlab".equalsIgnoreCase(provider)) {
            return listVersionsGitlab(gitlabToken, gitlabHost, gitlabProject, gitlabBranch, gitlabFilePath);
        }
        return listVersionsGithub(githubToken, githubRepo, githubBranch, githubFilePath);
    }

    public ConfigVersionDto getVersion(
            String id, String provider,
            String githubToken, String githubRepo, String githubBranch, String githubFilePath,
            String gitlabToken, String gitlabHost, String gitlabProject, String gitlabBranch, String gitlabFilePath) {
        if ("gitlab".equalsIgnoreCase(provider)) {
            return getVersionGitlab(id, gitlabToken, gitlabHost, gitlabProject, gitlabBranch, gitlabFilePath);
        }
        return getVersionGithub(id, githubToken, githubRepo, githubBranch, githubFilePath);
    }

    public ConfigVersionDto.Summary saveVersion(
            String message, String content, String provider,
            String githubToken, String githubRepo, String githubBranch, String githubFilePath,
            String gitlabToken, String gitlabHost, String gitlabProject, String gitlabBranch, String gitlabFilePath) {
        if ("gitlab".equalsIgnoreCase(provider)) {
            return saveVersionGitlab(message, content, gitlabToken, gitlabHost, gitlabProject, gitlabBranch, gitlabFilePath);
        }
        return saveVersionGithub(message, content, githubToken, githubRepo, githubBranch, githubFilePath);
    }

    public String readCurrentFile(
            String provider,
            String githubToken, String githubRepo, String githubBranch, String githubFilePath,
            String gitlabToken, String gitlabHost, String gitlabProject, String gitlabBranch, String gitlabFilePath) {
        if ("gitlab".equalsIgnoreCase(provider)) {
            return readCurrentFileGitlab(gitlabToken, gitlabHost, gitlabProject, gitlabBranch, gitlabFilePath);
        }
        return readCurrentFileGithub(githubToken, githubRepo, githubBranch, githubFilePath);
    }
}
