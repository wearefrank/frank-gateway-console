package wearefrank.backend.dto;

public record ConfigDto() {

    public record ApisixConfig(
            String key,
            String host,
            int adminPort,
            int controlPort,
            int metricsPort
    ) {}

    public record KeyDto(String key) {}
}
