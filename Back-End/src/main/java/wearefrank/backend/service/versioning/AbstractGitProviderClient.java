package wearefrank.backend.service.versioning;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
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
            throw new ResponseStatusException(HttpStatusCode.valueOf(response.statusCode()), apiError(response));

        return parseJson(response.body());
    }

    protected JsonNode put(String url, ObjectNode body, String token) {
        HttpRequest request = baseRequest(url, token)
                .header("Content-Type", "application/json")
                .PUT(toPublisher(body))
                .build();
        HttpResponse<String> response = send(request);

        if (response.statusCode() >= 400)
            throw new ResponseStatusException(HttpStatusCode.valueOf(response.statusCode()), apiError(response));

        return parseJson(response.body());
    }

    protected JsonNode post(String url, ObjectNode body, String token) {
        HttpRequest request = baseRequest(url, token)
                .header("Content-Type", "application/json")
                .POST(toPublisher(body))
                .build();
        HttpResponse<String> response = send(request);

        if (response.statusCode() >= 400)
            throw new ResponseStatusException(HttpStatusCode.valueOf(response.statusCode()), apiError(response));

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
        String friendly = switch (response.statusCode()) {
            case 401 -> "Authentication failed - check your access token";
            case 403 -> "Permission denied - your token may lack required scopes";
            case 409 -> "Conflict - the file may have been modified externally";
            case 422 -> "Validation error - check your repository and branch settings";
            case 429 -> "Rate limit exceeded - try again later";
            case 500, 502, 503 -> "The git provider is temporarily unavailable";
            default -> null;
        };
        if (friendly != null) return friendly;

        String body = response.body();
        try {
            JsonNode json = objectMapper.readTree(body);
            JsonNode messageNode = json.get("message");
            if (messageNode != null && !messageNode.isNull()) {
                return messageNode.asText();
            }
        } catch (IOException ignored) {
            // not JSON
        }
        return "Unexpected error (" + response.statusCode() + ")";
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
