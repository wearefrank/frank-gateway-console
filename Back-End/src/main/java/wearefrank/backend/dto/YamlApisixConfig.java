package wearefrank.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

// The console's own connection settings, stored in apisix_config.yaml and sent to the frontend as-is.
public record YamlApisixConfig(
        @JsonProperty("host")
        String host,
        @JsonProperty("controlPort")
        Integer controlPort,
        @JsonProperty("metricsPort")
        Integer metricsPort
) {}
