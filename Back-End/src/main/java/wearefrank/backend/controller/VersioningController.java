package wearefrank.backend.controller;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import wearefrank.backend.dto.ConfigVersionDto;
import wearefrank.backend.service.VersioningService;

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
    public List<ConfigVersionDto.Summary> listVersions(
            @RequestHeader(value = "X-Git-Provider", defaultValue = "github") String provider,
            @RequestHeader(value = "X-Github-Token", defaultValue = "") String githubToken,
            @RequestHeader(value = "X-Github-Repo", defaultValue = "") String githubRepo,
            @RequestHeader(value = "X-Github-Branch", defaultValue = "") String githubBranch,
            @RequestHeader(value = "X-Github-File-Path", defaultValue = "") String githubFilePath,
            @RequestHeader(value = "X-Gitlab-Token", defaultValue = "") String gitlabToken,
            @RequestHeader(value = "X-Gitlab-Host", defaultValue = "") String gitlabHost,
            @RequestHeader(value = "X-Gitlab-Project", defaultValue = "") String gitlabProject,
            @RequestHeader(value = "X-Gitlab-Branch", defaultValue = "") String gitlabBranch,
            @RequestHeader(value = "X-Gitlab-File-Path", defaultValue = "") String gitlabFilePath) {
        return versioningService.listVersions(provider,
                githubToken, githubRepo, githubBranch, githubFilePath,
                gitlabToken, gitlabHost, gitlabProject, gitlabBranch, gitlabFilePath);
    }

    @GetMapping("/{id}")
    public ConfigVersionDto getVersion(
            @PathVariable String id,
            @RequestHeader(value = "X-Git-Provider", defaultValue = "github") String provider,
            @RequestHeader(value = "X-Github-Token", defaultValue = "") String githubToken,
            @RequestHeader(value = "X-Github-Repo", defaultValue = "") String githubRepo,
            @RequestHeader(value = "X-Github-Branch", defaultValue = "") String githubBranch,
            @RequestHeader(value = "X-Github-File-Path", defaultValue = "") String githubFilePath,
            @RequestHeader(value = "X-Gitlab-Token", defaultValue = "") String gitlabToken,
            @RequestHeader(value = "X-Gitlab-Host", defaultValue = "") String gitlabHost,
            @RequestHeader(value = "X-Gitlab-Project", defaultValue = "") String gitlabProject,
            @RequestHeader(value = "X-Gitlab-Branch", defaultValue = "") String gitlabBranch,
            @RequestHeader(value = "X-Gitlab-File-Path", defaultValue = "") String gitlabFilePath) {
        return versioningService.getVersion(id, provider,
                githubToken, githubRepo, githubBranch, githubFilePath,
                gitlabToken, gitlabHost, gitlabProject, gitlabBranch, gitlabFilePath);
    }

    @PostMapping
    public ConfigVersionDto.Summary saveVersion(
            @RequestBody ConfigVersionDto.SaveRequest request,
            @RequestHeader(value = "X-Git-Provider", defaultValue = "github") String provider,
            @RequestHeader(value = "X-Github-Token", defaultValue = "") String githubToken,
            @RequestHeader(value = "X-Github-Repo", defaultValue = "") String githubRepo,
            @RequestHeader(value = "X-Github-Branch", defaultValue = "") String githubBranch,
            @RequestHeader(value = "X-Github-File-Path", defaultValue = "") String githubFilePath,
            @RequestHeader(value = "X-Gitlab-Token", defaultValue = "") String gitlabToken,
            @RequestHeader(value = "X-Gitlab-Host", defaultValue = "") String gitlabHost,
            @RequestHeader(value = "X-Gitlab-Project", defaultValue = "") String gitlabProject,
            @RequestHeader(value = "X-Gitlab-Branch", defaultValue = "") String gitlabBranch,
            @RequestHeader(value = "X-Gitlab-File-Path", defaultValue = "") String gitlabFilePath) {
        return versioningService.saveVersion(request.message(), request.content(), provider,
                githubToken, githubRepo, githubBranch, githubFilePath,
                gitlabToken, gitlabHost, gitlabProject, gitlabBranch, gitlabFilePath);
    }

    // returns plain text so the frontend can load the file content directly into the editor
    @GetMapping(value = "/file", produces = MediaType.TEXT_PLAIN_VALUE)
    public String readCurrentFile(
            @RequestHeader(value = "X-Git-Provider", defaultValue = "github") String provider,
            @RequestHeader(value = "X-Github-Token", defaultValue = "") String githubToken,
            @RequestHeader(value = "X-Github-Repo", defaultValue = "") String githubRepo,
            @RequestHeader(value = "X-Github-Branch", defaultValue = "") String githubBranch,
            @RequestHeader(value = "X-Github-File-Path", defaultValue = "") String githubFilePath,
            @RequestHeader(value = "X-Gitlab-Token", defaultValue = "") String gitlabToken,
            @RequestHeader(value = "X-Gitlab-Host", defaultValue = "") String gitlabHost,
            @RequestHeader(value = "X-Gitlab-Project", defaultValue = "") String gitlabProject,
            @RequestHeader(value = "X-Gitlab-Branch", defaultValue = "") String gitlabBranch,
            @RequestHeader(value = "X-Gitlab-File-Path", defaultValue = "") String gitlabFilePath) {
        return versioningService.readCurrentFile(provider,
                githubToken, githubRepo, githubBranch, githubFilePath,
                gitlabToken, gitlabHost, gitlabProject, gitlabBranch, gitlabFilePath);
    }
}
