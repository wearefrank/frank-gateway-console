package wearefrank.backend.service.versioning;

public record GitLabConfig(String token, String host, String project, String branch, String filePath) {}
