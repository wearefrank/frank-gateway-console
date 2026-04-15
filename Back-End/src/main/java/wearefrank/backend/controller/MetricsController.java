package wearefrank.backend.controller;

import org.springframework.web.bind.annotation.*;
import wearefrank.backend.dto.MetricsDto;
import wearefrank.backend.service.MetricsService;

@RestController
@RequestMapping("/api/metrics")
@CrossOrigin(origins = "http://localhost:5173")
public class MetricsController {

    private final MetricsService metricsService;

    public MetricsController(MetricsService metricsService) {
        this.metricsService = metricsService;
    }

    @GetMapping("/prom-query")
    public String prometheusQuery(@RequestParam String query) {
        return metricsService.prometheusQuery(query);
    }

    @GetMapping("/prom-range")
    public String prometheusRangeQuery(@RequestParam String query) {
        return metricsService.prometheusRangeQuery(query);
    }

    @GetMapping("/health")
    public String getHealthcheck() {
        return metricsService.getHealthcheck();
    }

    @GetMapping("/prometheus/raw")
    public String getPrometheusRaw() {
        return metricsService.getPrometheusRaw();
    }

    @GetMapping("/prometheus")
    public MetricsDto getPrometheusMetrics() {
        return metricsService.getPrometheusMetrics();
    }

    @GetMapping("/routes")
    public Object getLiveRoutes() {
        return metricsService.getLiveRoutes();
    }

    @GetMapping("/upstreams")
    public Object getLiveUpstreams() {
        return metricsService.getLiveUpstreams();
    }
}
