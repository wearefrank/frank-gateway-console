package wearefrank.backend.service.versioning;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

// Shared base for all Git provider clients.
// Subclasses only need to implement baseRequest() with their auth headers and the five GitProviderClient operations.
abstract class AbstractGitProviderClient implements GitProviderClient {

    protected final HttpClient httpClient;
    protected final ObjectMapper objectMapper = new ObjectMapper();

    protected AbstractGitProviderClient(HttpClient httpClient) {
        this.httpClient = httpClient;
    }

    protected abstract HttpRequest.Builder baseRequest(String url, String token);

    // HTTP methods

    protected JsonNode get(String url, String token) {
        HttpRequest request = baseRequest(url, token).GET().build();
        HttpResponse<String> response = send(request);

        if (response.statusCode() == 404)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Not found: " + url);
        if (response.statusCode() >= 400)
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, apiError(response));

        return parseJson(response.body());
    }

    protected JsonNode put(String url, ObjectNode body, String token) {
        HttpRequest request = baseRequest(url, token)
                .header("Content-Type", "application/json")
                .PUT(toPublisher(body))
                .build();
        HttpResponse<String> response = send(request);

        if (response.statusCode() >= 400)
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, apiError(response));

        return parseJson(response.body());
    }

    protected JsonNode post(String url, ObjectNode body, String token) {
        HttpRequest request = baseRequest(url, token)
                .header("Content-Type", "application/json")
                .POST(toPublisher(body))
                .build();
        HttpResponse<String> response = send(request);

        if (response.statusCode() >= 400)
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, apiError(response));

        return parseJson(response.body());
    }

    private HttpResponse<String> send(HttpRequest request) {
        try {
            return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (IOException | InterruptedException e) {
            throw new RuntimeException(providerName() + " API request failed", e);
        }
    }

    private HttpRequest.BodyPublisher toPublisher(ObjectNode body) {
        try {
            return HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body));
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize request body", e);
        }
    }

    private JsonNode parseJson(String responseBody) {
        try {
            return objectMapper.readTree(responseBody);
        } catch (IOException e) {
            throw new RuntimeException("Failed to parse " + providerName() + " API response", e);
        }
    }

    private String apiError(HttpResponse<String> response) {
        return providerName() + " API error " + response.statusCode() + ": " + response.body();
    }

    //Utilities

    protected boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    protected String decodeBase64Content(String base64Content) {
        // API responses sometimes include newlines inside the Base64 string
        byte[] decoded = Base64.getDecoder().decode(base64Content.replaceAll("\\s", ""));
        return new String(decoded, StandardCharsets.UTF_8);
    }

    protected String normalizeHost(String host) {
        return host.strip().replaceAll("/+$", "");
    }
}
