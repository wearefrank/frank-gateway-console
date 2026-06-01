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

    // GitHub settings are passed as request headers on every call rather than stored server-side,
    // so the browser can persist them locally without the backend ever holding someone's token.
    @GetMapping
    public List<ConfigVersionDto.Summary> listVersions(
            @RequestHeader(value = "X-Github-Token", defaultValue = "") String token,
            @RequestHeader(value = "X-Github-Repo", defaultValue = "") String repo,
            @RequestHeader(value = "X-Github-Branch", defaultValue = "") String branch,
            @RequestHeader(value = "X-Github-File-Path", defaultValue = "") String filePath) {
        return versioningService.listVersions(token, repo, branch, filePath);
    }

    @GetMapping("/{id}")
    public ConfigVersionDto getVersion(
            @PathVariable String id,
            @RequestHeader(value = "X-Github-Token", defaultValue = "") String token,
            @RequestHeader(value = "X-Github-Repo", defaultValue = "") String repo,
            @RequestHeader(value = "X-Github-Branch", defaultValue = "") String branch,
            @RequestHeader(value = "X-Github-File-Path", defaultValue = "") String filePath) {
        return versioningService.getVersion(id, token, repo, branch, filePath);
    }

    @PostMapping
    public ConfigVersionDto.Summary saveVersion(
            @RequestBody ConfigVersionDto.SaveRequest request,
            @RequestHeader(value = "X-Github-Token", defaultValue = "") String token,
            @RequestHeader(value = "X-Github-Repo", defaultValue = "") String repo,
            @RequestHeader(value = "X-Github-Branch", defaultValue = "") String branch,
            @RequestHeader(value = "X-Github-File-Path", defaultValue = "") String filePath) {
        return versioningService.saveVersion(request.message(), request.content(), token, repo, branch, filePath);
    }

    // returns plain text so the frontend can load the file content directly into the editor
    @GetMapping(value = "/file", produces = MediaType.TEXT_PLAIN_VALUE)
    public String readCurrentFile(
            @RequestHeader(value = "X-Github-Token", defaultValue = "") String token,
            @RequestHeader(value = "X-Github-Repo", defaultValue = "") String repo,
            @RequestHeader(value = "X-Github-Branch", defaultValue = "") String branch,
            @RequestHeader(value = "X-Github-File-Path", defaultValue = "") String filePath) {
        return versioningService.readCurrentFile(token, repo, branch, filePath);
    }
}
