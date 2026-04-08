package wearefrank.backend.service;

import org.springframework.stereotype.Service;

@Service
public class SchemaService {

    private final ApisixClient apisixClient;

    public SchemaService(ApisixClient apisixClient) {
        this.apisixClient = apisixClient;
    }

    public String getRouteSchema() {
        return apisixClient.adminGet("/apisix/admin/schema/route");
    }

    public String getFullSchema() {
        return apisixClient.controlGet("/v1/schema");
    }
}
