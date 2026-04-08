package wearefrank.backend.controller;

import org.springframework.web.bind.annotation.*;
import wearefrank.backend.dto.RouteDto;
import wearefrank.backend.service.ApisixClient;
import wearefrank.backend.service.YamlStoreService;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/routes")
@CrossOrigin(origins = "http://localhost:5173")
public class RouteController {

    private final YamlStoreService yamlStoreService;
    private final ApisixClient apisixClient;

    public RouteController(YamlStoreService yamlStoreService, ApisixClient apisixClient) {
        this.yamlStoreService = yamlStoreService;
        this.apisixClient = apisixClient;
    }

    @GetMapping("/saved")
    public List<RouteDto> getAllRoutes() {
        return yamlStoreService.getRoutes();
    }

    @GetMapping("/live")
    public String getLiveRoutes() {
        return apisixClient.adminGet("/apisix/admin/routes");
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
