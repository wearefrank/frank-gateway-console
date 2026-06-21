package wearefrank.backend.service.versioning;

public record GitHubConfig(String token, String repo, String branch, String filePath) implements GitProviderConfig {
    @Override
    public String providerName() { return "github"; }
}
