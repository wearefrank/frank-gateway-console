package wearefrank.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.ArrayList;

public record YamlApisixConfig(
        @JsonProperty("adminKey")
        String adminKey,
        @JsonProperty("adminUrl")
        String adminUrl,
        @JsonProperty("routes")
        ArrayList<RouteDto> routes
) {}
