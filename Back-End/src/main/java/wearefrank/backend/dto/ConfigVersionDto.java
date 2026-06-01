package wearefrank.backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ConfigVersionDto(
        String id,
        String message,
        String createdAt,
        String content
) {
    public record Summary(String id, String message, String createdAt, String commitUrl, String author) {}
    public record SaveRequest(String message, String content) {}
}
