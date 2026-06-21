package wearefrank.backend.service.versioning;

public record GiteaConfig(String token, String host, String repo, String branch, String filePath) implements GitProviderConfig {
    @Override
    public String providerName() { return "gitea"; }
}
