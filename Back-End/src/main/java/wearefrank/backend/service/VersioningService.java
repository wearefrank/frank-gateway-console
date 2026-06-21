package wearefrank.backend.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import wearefrank.backend.dto.ConfigVersionDto;
import wearefrank.backend.service.versioning.GitProviderClient;
import wearefrank.backend.service.versioning.GitProviderConfig;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class VersioningService {

    private final Map<String, GitProviderClient> clients;

    public VersioningService(List<GitProviderClient> clientList) {
        this.clients = clientList.stream()
                .collect(Collectors.toMap(GitProviderClient::providerName, c -> c));
    }

    public List<ConfigVersionDto.Summary> listVersions(GitProviderConfig config) {
        return clientFor(config).listVersions(config);
    }

    public ConfigVersionDto getVersion(String id, GitProviderConfig config) {
        return clientFor(config).getVersion(id, config);
    }

    public ConfigVersionDto.Summary saveVersion(String message, String content, GitProviderConfig config) {
        return clientFor(config).saveVersion(message, content, config);
    }

    public String readCurrentFile(GitProviderConfig config) {
        return clientFor(config).readCurrentFile(config);
    }

    public boolean fileExists(GitProviderConfig config) {
        return clientFor(config).fileExists(config);
    }

    private GitProviderClient clientFor(GitProviderConfig config) {
        GitProviderClient client = clients.get(config.providerName());
        if (client == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown Git provider: " + config.providerName());
        }
        return client;
    }
}
