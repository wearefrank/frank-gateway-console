package wearefrank.backend.controller;

import org.springframework.web.bind.annotation.*;
import wearefrank.backend.dto.RouteDto;
import wearefrank.backend.service.YamlStoreService;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/routes")
@CrossOrigin(origins = "http://localhost:5173")
public class RouteController {

    private final YamlStoreService yamlStoreService;

    public RouteController(YamlStoreService yamlStoreService) {
        this.yamlStoreService = yamlStoreService;
    }

    @GetMapping("/saved")
    public List<RouteDto> getAllRoutes() {
        return yamlStoreService.getRoutes();
    }

    @PostMapping
    public RouteDto createRoute(@RequestBody RouteDto incomingData) {
        String id = incomingData.id() != null ? incomingData.id() : UUID.randomUUID().toString();

        RouteDto newRoute = new RouteDto(
                id,
                incomingData.uri(),
                incomingData.name(),
                incomingData.methods(),
                incomingData.host(),
                incomingData.hosts(),
                incomingData.upstreamId(),
                incomingData.upstream(),
                incomingData.plugins(),
                incomingData.priority(),
                incomingData.status() != null ? incomingData.status() : 1
        );

        yamlStoreService.addRoute(newRoute);
        return newRoute;
    }

    @DeleteMapping
    public void deleteRoute(@RequestBody RouteDto.DeleteRequest deleteRequest) {
        yamlStoreService.deleteRoute(deleteRequest.id());
    }
}
