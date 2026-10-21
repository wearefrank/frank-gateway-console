package wearefrank.backend.service.versioning;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.stream.Collectors;

// Shared base for all Git provider clients.
// Subclasses supply their auth headers, file URL and required settings, plus the list/get/save operations.
abstract class AbstractGitProviderClient implements GitProviderClient {

    private static final Logger log = LoggerFactory.getLogger(AbstractGitProviderClient.class);
    private static final Duration TIMEOUT = Duration.ofSeconds(20);
    private static final long SLOW_MS = 3000;

    protected final HttpClient httpClient;
    protected final ObjectMapper objectMapper = new ObjectMapper();

    protected AbstractGitProviderClient(HttpClient httpClient) {
        this.httpClient = httpClient;
    }

    protected abstract HttpRequest.Builder baseRequest(String url, String token);

    /** API URL of the configured file at the given ref. */
    protected abstract String fileUrl(GitProviderConfig config, String ref);

    /** Settings beyond token, branch and file path that must be non-blank. */
    protected abstract List<String> requiredSettings(GitProviderConfig config);

    /** Provider name as shown to users, e.g. "GitHub". */
    protected abstract String displayName();

    // HTTP methods

    protected JsonNode get(String url, String token) {
        return get(url, token, false);
    }

    /** Like get(), but a 404 comes back as null instead of throwing. */
    protected JsonNode getOrNull(String url, String token) {
        try {
            return get(url, token, true);
        } catch (ResponseStatusException e) {
            if (e.getStatusCode().value() == 404) return null;
            throw e;
        }
    }

    private JsonNode get(String url, String token, boolean notFoundExpected) {
        HttpRequest request = baseRequest(url, token).timeout(TIMEOUT).GET().build();
        HttpResponse<String> response = send(request, notFoundExpected);

        if (response.statusCode() == 404)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Not found: " + url);
        if (response.statusCode() >= 400)
            throw new ResponseStatusException(HttpStatusCode.valueOf(response.statusCode()), apiError(response));

        return parseJson(response.body());
    }

    /** A PUT or POST with a JSON body. */
    protected JsonNode write(String method, String url, ObjectNode body, String token) {
        HttpRequest request = baseRequest(url, token)
                .timeout(TIMEOUT)
                .header("Content-Type", "application/json")
                .method(method, toPublisher(body))
                .build();
        HttpResponse<String> response = send(request, false);

        if (response.statusCode() >= 400)
            throw new ResponseStatusException(HttpStatusCode.valueOf(response.statusCode()), apiError(response));

        return parseJson(response.body());
    }

    // Operations that only differ per provider in the file URL

    @Override
    public String readCurrentFile(GitProviderConfig config) {
        assertConfigured(config);
        return decodeBase64Content(get(fileUrl(config, config.branch()), config.token()).get("content").asText());
    }

    @Override
    public boolean fileExists(GitProviderConfig config) {
        if (!isConfigured(config)) return false;
        return getOrNull(fileUrl(config, config.branch()), config.token()) != null;
    }

    // Configuration checks

    protected boolean isConfigured(GitProviderConfig config) {
        if (isBlank(config.token()) || isBlank(config.branch()) || isBlank(config.filePath())) return false;
        return requiredSettings(config).stream().noneMatch(this::isBlank);
    }

    protected void assertConfigured(GitProviderConfig config) {
        if (!isConfigured(config)) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, displayName() + " integration not configured");
        }
    }

    // Callers set TIMEOUT on the request: the shared client only has a connect timeout,
    // so a stalled response would otherwise block forever.
    private HttpResponse<String> send(HttpRequest request, boolean notFoundExpected) {
        long start = System.nanoTime();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            long ms = (System.nanoTime() - start) / 1_000_000;
            // Only getOrNull() expects 404; anywhere else it means a wrong repo, branch or path.
            boolean expected = notFoundExpected && response.statusCode() == 404;
            boolean failed = response.statusCode() >= 400 && !expected;
            if (failed || ms > SLOW_MS) {
                log.warn("{} {} {} -> {} in {} ms", providerName(), request.method(), request.uri(), response.statusCode(), ms);
            } else {
                log.debug("{} {} {} -> {} in {} ms", providerName(), request.method(), request.uri(), response.statusCode(), ms);
            }
            return response;
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            long ms = (System.nanoTime() - start) / 1_000_000;
            log.warn("{} {} {} failed after {} ms: {}", providerName(), request.method(), request.uri(), ms, e.toString());
            String reason = e instanceof HttpTimeoutException ? " timed out" : " failed";
            throw new RuntimeException(providerName() + " API request" + reason, e);
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

    /** Percent-encodes one URL component. URLEncoder does form encoding, so its '+' becomes %20. */
    protected static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    /** Percent-encodes each segment of a slash-separated path, keeping the slashes. */
    protected static String encodeSegments(String path) {
        return Arrays.stream(path.split("/", -1))
                .map(AbstractGitProviderClient::encode)
                .collect(Collectors.joining("/"));
    }

    protected String normalizeHost(String host) {
        return host.strip().replaceAll("/+$", "");
    }
}
