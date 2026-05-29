package wearefrank.backend.dto;

public record ConfigDto() {

    public record ApisixConfig(
            String host,
            int controlPort,
            int metricsPort,
            String githubToken,
            String githubRepo,
            String githubBranch,
            String githubFilePath
    ) {}
}
