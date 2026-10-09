package wearefrank.backend.dto;

import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;

/** Binds {@link LogFields} from YAML the way Spring does at startup, for tests that build services by hand. */
public final class TestLogFields {

    /** The shipped log-fields.yaml. */
    public static LogFields defaults() {
        return bind(new ClassPathResource("log-fields.yaml"));
    }

    public static LogFields fromYaml(String yaml) {
        return bind(new ByteArrayResource(yaml.getBytes(StandardCharsets.UTF_8)));
    }

    private static LogFields bind(Resource resource) {
        try {
            var sources = new YamlPropertySourceLoader().load("log-fields", resource);
            return new Binder(ConfigurationPropertySources.from(sources))
                    .bind("logs", LogFields.class)
                    .get();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private TestLogFields() {}
}
