package wearefrank.backend.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import wearefrank.backend.dto.ConfigVersionDto;
import wearefrank.backend.service.VersioningService;
import wearefrank.backend.service.versioning.*;

import java.util.List;

@RestController
@RequestMapping("/api/versions")
@CrossOrigin(origins = "http://localhost:5173")
public class VersioningController {

    private final VersioningService versioningService;

    public VersioningController(VersioningService versioningService) {
        this.versioningService = versioningService;
    }

    // Git settings are passed as request headers on every call rather than stored server-side,
    // so the browser can persist them locally without the backend ever holding someone's token.

    @GetMapping
    public List<ConfigVersionDto.Summary> listVersions(HttpServletRequest req) {
        return versioningService.listVersions(provider(req), githubConfig(req), gitlabConfig(req), giteaConfig(req));
    }

    @GetMapping("/{id}")
    public ConfigVersionDto getVersion(@PathVariable String id, HttpServletRequest req) {
        return versioningService.getVersion(id, provider(req), githubConfig(req), gitlabConfig(req), giteaConfig(req));
    }

    @PostMapping
    public ConfigVersionDto.Summary saveVersion(@RequestBody ConfigVersionDto.SaveRequest request, HttpServletRequest req) {
        return versioningService.saveVersion(request.message(), request.content(), provider(req), githubConfig(req), gitlabConfig(req), giteaConfig(req));
    }

    // returns plain text so the frontend can load the file content directly into the editor
    @GetMapping(value = "/file", produces = MediaType.TEXT_PLAIN_VALUE)
    public String readCurrentFile(HttpServletRequest req) {
        return versioningService.readCurrentFile(provider(req), githubConfig(req), gitlabConfig(req), giteaConfig(req));
    }

    private String provider(HttpServletRequest req) {
        return header(req, "X-Git-Provider", "github");
    }

    private GitHubConfig githubConfig(HttpServletRequest req) {
        return new GitHubConfig(
                header(req, "X-Github-Token"),
                header(req, "X-Github-Repo"),
                header(req, "X-Github-Branch"),
                header(req, "X-Github-File-Path"));
    }

    private GitLabConfig gitlabConfig(HttpServletRequest req) {
        return new GitLabConfig(
                header(req, "X-Gitlab-Token"),
                header(req, "X-Gitlab-Host"),
                header(req, "X-Gitlab-Project"),
                header(req, "X-Gitlab-Branch"),
                header(req, "X-Gitlab-File-Path"));
    }

    private GiteaConfig giteaConfig(HttpServletRequest req) {
        return new GiteaConfig(
                header(req, "X-Gitea-Token"),
                header(req, "X-Gitea-Host"),
                header(req, "X-Gitea-Repo"),
                header(req, "X-Gitea-Branch"),
                header(req, "X-Gitea-File-Path"));
    }

    private String header(HttpServletRequest req, String name) {
        String value = req.getHeader(name);
        return value != null ? value : "";
    }

    private String header(HttpServletRequest req, String name, String defaultValue) {
        String value = req.getHeader(name);
        return value != null ? value : defaultValue;
    }
}
