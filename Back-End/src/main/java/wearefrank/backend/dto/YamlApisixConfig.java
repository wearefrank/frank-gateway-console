package wearefrank.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.ArrayList;

public record YamlApisixConfig(
        @JsonProperty("host")
        String host,
        @JsonProperty("controlPort")
        Integer controlPort,
        @JsonProperty("metricsPort")
        Integer metricsPort,
        @JsonProperty("routes")
        ArrayList<RouteDto> routes
) {}
