package wearefrank.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LiveEntityFilterTest {

    private final ObjectMapper mapper = new ObjectMapper();

    // Every secret shape found in the APISIX 3.16 plugin schemas, each value marked LEAK_.
    private static final String ROUTE_WITH_SECRETS = """
            {"key": "/routes/r1", "value": {
              "id": "r1", "name": "route", "uri": "/x/*", "status": 1, "service_id": "s1",
              "labels": {"env": "prod"},
              "vars": [["http_x", "==", "LEAK_vars"]],
              "upstream": {
                "type": "chash", "key": "remote_addr", "scheme": "https",
                "nodes": [{"host": "backend", "port": 443, "weight": 1, "metadata": {"t": "LEAK_node_metadata"}}],
                "tls": {"client_cert": "LEAK_cert", "client_key": "LEAK_client_key"},
                "checks": {"active": {"req_headers": ["Authorization: LEAK_req_headers"]}}
              },
              "plugins": {
                "fsc": {"internal_key": "LEAK_fsc", "_meta": {"disable": false, "pre_function": "LEAK_pre_function"}},
                "openid-connect-client": {"client_id": "c", "client_secret": "LEAK_oidc_client"},
                "generic-oauth-client": {"custom_parameters": {"client_assertion": "LEAK_custom_parameters"}},
                "openid-connect": {"client_secret": "LEAK_oidc", "session": {"secret": "LEAK_session"},
                                   "proxy_opts": {"http_proxy_authorization": "LEAK_proxy_auth"}},
                "limit-count": {"key": "remote_addr", "redis_password": "LEAK_redis"},
                "http-logger": {"uri": "https://u:LEAK_userinfo@log", "auth_header": "LEAK_auth_header"},
                "loggly": {"customer_token": "LEAK_loggly"},
                "aws-lambda": {"authorization": {"iam": {"accesskey": "a", "secretkey": "LEAK_aws"}}},
                "azure-functions": {"master_apikey": "LEAK_azure"},
                "proxy-rewrite": {"headers": {"set": {"Ocp-Apim-Subscription-Key": "LEAK_header"}}},
                "forward-auth": {"extra_headers": {"X-Internal": "LEAK_extra_headers"}},
                "ext-plugin-pre-req": {"conf": [{"name": "a", "value": "LEAK_ext_conf"}]},
                "serverless-pre-function": {"functions": ["local t = 'LEAK_lua'"]},
                "consumer-restriction": {"type": "consumer_name", "whitelist": ["alice"],
                                         "allowed_by_methods": [{"user": "carol", "methods": ["GET"], "x": "LEAK_abm"}],
                                         "rejected_code": 403, "_meta": {"disable": true}}
              }
            }}
            """;

    @Test
    void dropsEverySecret() throws Exception {
        String out = mapper.writeValueAsString(LiveEntityFilter.filter(mapper.readTree(ROUTE_WITH_SECRETS)));

        assertThat(out).doesNotContain("LEAK_");
    }

    @Test
    void keepsWhatTheDashboardReads() throws Exception {
        JsonNode out = LiveEntityFilter.filter(mapper.readTree(ROUTE_WITH_SECRETS));
        JsonNode value = out.get("value");

        assertThat(out.get("key").asText()).isEqualTo("/routes/r1");
        assertThat(value.get("id").asText()).isEqualTo("r1");
        assertThat(value.get("uri").asText()).isEqualTo("/x/*");
        assertThat(value.get("status").asInt()).isEqualTo(1);
        assertThat(value.get("service_id").asText()).isEqualTo("s1");
        assertThat(value.at("/upstream/type").asText()).isEqualTo("chash");
        assertThat(value.at("/upstream/nodes/0").toString()).isEqualTo("{\"host\":\"backend\",\"port\":443,\"weight\":1}");
        assertThat(value.get("plugins").properties()).hasSize(14);
        assertThat(value.at("/plugins/fsc/_meta/disable").asBoolean(true)).isFalse();

        JsonNode restriction = value.at("/plugins/consumer-restriction");
        assertThat(restriction.toString()).isEqualTo(
                "{\"_meta\":{\"disable\":true},\"type\":\"consumer_name\",\"whitelist\":[\"alice\"],"
                        + "\"rejected_code\":403,\"allowed_by_methods\":[{\"user\":\"carol\",\"methods\":[\"GET\"]}]}");
    }

    @Test
    void keepsMapFormNodesAndBareEntries() throws Exception {
        JsonNode out = LiveEntityFilter.filter(mapper.readTree(
                "{\"id\": \"u1\", \"nodes\": {\"backend:8080\": 1, \"bad\": \"LEAK_\"}, \"tls\": {\"client_key\": \"LEAK_\"}}"));

        assertThat(out.toString()).isEqualTo("{\"id\":\"u1\",\"nodes\":{\"backend:8080\":1}}");
    }
}
