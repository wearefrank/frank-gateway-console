package wearefrank.backend.controller;

import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import wearefrank.backend.service.SchemaService;

@RestController
@RequestMapping("/api/schema")
@CrossOrigin(origins = "http://localhost:5173")
public class SchemaController {

    private final SchemaService schemaService;

    public SchemaController(SchemaService schemaService) {
        this.schemaService = schemaService;
    }

    @GetMapping()
    public String getFullSchema() {
        return schemaService.getFullSchema();
    }
}
