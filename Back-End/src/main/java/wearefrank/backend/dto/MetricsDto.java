package wearefrank.backend.dto;

import java.util.Map;

public record MetricsDto(
        long totalRequests,
        Map<String, Long> connections,
        String version,
        String hostname
) {}
