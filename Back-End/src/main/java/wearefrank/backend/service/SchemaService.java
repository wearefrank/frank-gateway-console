package wearefrank.backend.service;

import org.springframework.stereotype.Service;

@Service
public class SchemaService {

    private final ApisixClient apisixClient;

    public SchemaService(ApisixClient apisixClient) {
        this.apisixClient = apisixClient;
    }

    public String getFullSchema() {
        return apisixClient.controlGet("/v1/schema");
    }
}
