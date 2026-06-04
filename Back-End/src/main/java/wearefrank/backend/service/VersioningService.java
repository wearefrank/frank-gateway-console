package wearefrank.backend.service;

import org.springframework.stereotype.Service;
import wearefrank.backend.dto.ConfigVersionDto;
import wearefrank.backend.service.versioning.*;

import java.util.List;

@Service
public class VersioningService {

    private final GitHubProviderClient github;
    private final GitLabProviderClient gitlab;
    private final GiteaProviderClient gitea;

    public VersioningService(GitHubProviderClient github, GitLabProviderClient gitlab, GiteaProviderClient gitea) {
        this.github = github;
        this.gitlab = gitlab;
        this.gitea = gitea;
    }

    public List<ConfigVersionDto.Summary> listVersions(String provider, GitHubConfig githubConfig, GitLabConfig gitlabConfig, GiteaConfig giteaConfig) {
        if ("gitlab".equalsIgnoreCase(provider)) return gitlab.listVersions(gitlabConfig);
        if ("gitea".equalsIgnoreCase(provider)) return gitea.listVersions(giteaConfig);
        return github.listVersions(githubConfig);
    }

    public ConfigVersionDto getVersion(String id, String provider, GitHubConfig githubConfig, GitLabConfig gitlabConfig, GiteaConfig giteaConfig) {
        if ("gitlab".equalsIgnoreCase(provider)) return gitlab.getVersion(id, gitlabConfig);
        if ("gitea".equalsIgnoreCase(provider)) return gitea.getVersion(id, giteaConfig);
        return github.getVersion(id, githubConfig);
    }

    public ConfigVersionDto.Summary saveVersion(String message, String content, String provider, GitHubConfig githubConfig, GitLabConfig gitlabConfig, GiteaConfig giteaConfig) {
        if ("gitlab".equalsIgnoreCase(provider)) return gitlab.saveVersion(message, content, gitlabConfig);
        if ("gitea".equalsIgnoreCase(provider)) return gitea.saveVersion(message, content, giteaConfig);
        return github.saveVersion(message, content, githubConfig);
    }

    public String readCurrentFile(String provider, GitHubConfig githubConfig, GitLabConfig gitlabConfig, GiteaConfig giteaConfig) {
        if ("gitlab".equalsIgnoreCase(provider)) return gitlab.readCurrentFile(gitlabConfig);
        if ("gitea".equalsIgnoreCase(provider)) return gitea.readCurrentFile(giteaConfig);
        return github.readCurrentFile(githubConfig);
    }
}
