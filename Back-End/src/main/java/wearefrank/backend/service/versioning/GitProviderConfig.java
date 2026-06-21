package wearefrank.backend.service.versioning;

public sealed interface GitProviderConfig permits GitHubConfig, GitLabConfig, GiteaConfig {
    String token();
    String branch();
    String filePath();
    String providerName();
}
