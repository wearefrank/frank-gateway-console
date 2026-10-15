package wearefrank.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.List;
import java.util.Map;

/**
 * Trims a control API route/service/upstream down to what the dashboard reads.
 * An allowlist on purpose: the control API returns secrets in plaintext, and plugins
 * can hold them under any name (custom params, header maps, Lua code, URLs).
 */
public final class LiveEntityFilter {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

    private static final List<String> ENTITY_FIELDS = List.of(
            "id", "name", "desc", "uri", "uris", "host", "hosts", "methods", "status", "priority",
            "upstream_id", "service_id", "plugin_config_id", "type", "scheme", "pass_host", "discovery_type",
            "service_name");

    private static final List<String> NODE_FIELDS = List.of("host", "port", "weight", "priority");

    private static final List<String> RESTRICTION_FIELDS = List.of("type", "whitelist", "blacklist", "rejected_code");

    private LiveEntityFilter() {
    }

    /** Takes one `{key, value}` element; older gateways send the value bare. */
    public static JsonNode filter(JsonNode entry) {
        JsonNode value = entry.path("value");
        if (!value.isObject()) return entity(entry);

        ObjectNode out = NODES.objectNode();
        copy(entry, out, List.of("key"));
        out.set("value", entity(value));
        return out;
    }

    private static ObjectNode entity(JsonNode source) {
        ObjectNode out = NODES.objectNode();
        copy(source, out, ENTITY_FIELDS);
        if (source.has("nodes")) out.set("nodes", nodes(source.get("nodes")));
        if (source.path("upstream").isObject()) out.set("upstream", entity(source.get("upstream")));
        if (source.path("plugins").isObject()) out.set("plugins", plugins(source.get("plugins")));
        return out;
    }

    /** Array of node objects, or the `{"host:port": weight}` map form. */
    private static JsonNode nodes(JsonNode source) {
        if (source.isArray()) {
            ArrayNode out = NODES.arrayNode();
            for (JsonNode node : source) {
                ObjectNode kept = NODES.objectNode();
                copy(node, kept, NODE_FIELDS);
                out.add(kept);
            }
            return out;
        }
        ObjectNode out = NODES.objectNode();
        for (Map.Entry<String, JsonNode> e : source.properties()) {
            if (e.getValue().isNumber()) out.set(e.getKey(), e.getValue());
        }
        return out;
    }

    /** Plugin names only, except the consumer-restriction lists the topology draws. */
    private static ObjectNode plugins(JsonNode source) {
        ObjectNode out = NODES.objectNode();
        for (Map.Entry<String, JsonNode> e : source.properties()) {
            JsonNode conf = e.getValue();
            ObjectNode kept = NODES.objectNode();
            JsonNode disable = conf.path("_meta").path("disable");
            if (disable.isBoolean()) kept.putObject("_meta").set("disable", disable);
            if (e.getKey().equals("consumer-restriction")) restriction(conf, kept);
            out.set(e.getKey(), kept);
        }
        return out;
    }

    private static void restriction(JsonNode conf, ObjectNode out) {
        copy(conf, out, RESTRICTION_FIELDS);
        if (!conf.path("allowed_by_methods").isArray()) return;
        ArrayNode rules = out.putArray("allowed_by_methods");
        for (JsonNode rule : conf.get("allowed_by_methods")) {
            ObjectNode kept = NODES.objectNode();
            copy(rule, kept, List.of("user", "methods"));
            rules.add(kept);
        }
    }

    private static void copy(JsonNode source, ObjectNode target, List<String> fields) {
        for (String field : fields) {
            if (source.has(field)) target.set(field, source.get(field));
        }
    }
}
