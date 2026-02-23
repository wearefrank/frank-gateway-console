package wearefrank.backend.dto;

public record GitDto() {

    public record GitCredentials (
            String gitUsername,
            String gitToken
    ){}
}
