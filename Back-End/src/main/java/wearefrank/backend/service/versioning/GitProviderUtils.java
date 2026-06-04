package wearefrank.backend.service.versioning;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

class GitProviderUtils {

    private GitProviderUtils() {}

    static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    static String decodeBase64Content(String base64Content) {
        byte[] decoded = Base64.getDecoder().decode(base64Content.replaceAll("\\s", ""));
        return new String(decoded, StandardCharsets.UTF_8);
    }

    static String normalizeHost(String host) {
        return host.strip().replaceAll("/+$", "");
    }
}
