package wearefrank.backend.service.versioning;

import wearefrank.backend.dto.ConfigVersionDto;

import java.util.List;

public interface GitProviderClient {
    String providerName();
    List<ConfigVersionDto.Summary> listVersions(GitProviderConfig config);
    ConfigVersionDto getVersion(String id, GitProviderConfig config);
    ConfigVersionDto.Summary saveVersion(String message, String content, GitProviderConfig config);
    String readCurrentFile(GitProviderConfig config);
    boolean fileExists(GitProviderConfig config);
}
