package wearefrank.backend.controller;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import wearefrank.backend.dto.ConfigVersionDto;
import wearefrank.backend.service.VersioningService;

import java.util.List;

@RestController
@RequestMapping("/api/versions")
@CrossOrigin(origins = "http://localhost:5173")
public class VersioningController {

    private final VersioningService versioningService;

    public VersioningController(VersioningService versioningService) {
        this.versioningService = versioningService;
    }

    @GetMapping
    public List<ConfigVersionDto.Summary> listVersions() {
        return versioningService.listVersions();
    }

    @GetMapping("/{id}")
    public ConfigVersionDto getVersion(@PathVariable String id) {
        return versioningService.getVersion(id);
    }

    @PostMapping
    public ConfigVersionDto.Summary saveVersion(@RequestBody ConfigVersionDto.SaveRequest request) {
        return versioningService.saveVersion(request.message(), request.content());
    }

    @GetMapping(value = "/file", produces = MediaType.TEXT_PLAIN_VALUE)
    public String readCurrentFile() {
        return versioningService.readCurrentFile();
    }
}
