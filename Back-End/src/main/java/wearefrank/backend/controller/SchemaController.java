package wearefrank.backend.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import wearefrank.backend.service.ApisixClient;

@RestController
@RequestMapping("/api/schema")
public class SchemaController {

    private final ApisixClient apisixClient;

    public SchemaController(ApisixClient apisixClient) {
        this.apisixClient = apisixClient;
    }

    @GetMapping()
    public String getFullSchema() {
        return apisixClient.controlGet("/v1/schema");
    }
}
