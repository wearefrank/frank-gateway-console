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
        ArrayList<RouteDto> routes,
        @JsonProperty("githubToken")
        String githubToken,
        @JsonProperty("githubRepo")
        String githubRepo,
        @JsonProperty("githubBranch")
        String githubBranch,
        @JsonProperty("githubFilePath")
        String githubFilePath
) {}
