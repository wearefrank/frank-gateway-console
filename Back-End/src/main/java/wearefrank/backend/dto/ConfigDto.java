package wearefrank.backend.dto;

public record ConfigDto() {

    public record ApisixConfig(
            String host,
            int controlPort,
            int metricsPort
    ) {}
}
