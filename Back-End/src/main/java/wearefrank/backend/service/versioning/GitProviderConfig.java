package wearefrank.backend.service.versioning;

public interface GitProviderConfig {
    String token();
    String branch();
    String filePath();
    String providerName();
}
