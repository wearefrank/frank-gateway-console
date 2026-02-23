package wearefrank.backend.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import wearefrank.backend.dto.GitDto;
import wearefrank.backend.service.GitService;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/git")
@CrossOrigin(origins = "http://localhost:5173")
public class GitController {

    @Autowired
    private GitService gitService;

    // Clone a repository (body: { "url": "...", "name": "..." })
    @PostMapping("/clone")
    public String cloneRepo(@RequestBody Map<String, String> payload) {
        String url = payload.get("url");
        String name = payload.get("name");
        if (url == null || url.isBlank()) throw new RuntimeException("Missing 'url'");
        if (name == null || name.isBlank()) throw new RuntimeException("Missing 'name'");
        return gitService.cloneRepository(name, url);
    }

    // Initialize a new repository (body: { "name": "..." })
    @PostMapping("/init")
    public String initRepo(@RequestBody Map<String, String> payload) {
        String name = payload.get("name");
        if (name == null || name.isBlank()) throw new RuntimeException("Missing 'name'");
        return gitService.initRepository(name);
    }

    // Switch to an existing repository (body: { "name": "..." })
    @PostMapping("/switch")
    public String switchRepo(@RequestBody Map<String, String> payload) {
        String name = payload.get("name");
        if (name == null || name.isBlank()) throw new RuntimeException("Missing 'name'");
        return gitService.switchRepository(name);
    }

    // List all available local repositories
    @GetMapping("/repos")
    public List<String> listRepos() {
        return gitService.listRepositories();
    }

    // List top-level folders of the currently loaded repository
    @GetMapping("/folders")
    public List<String> listFolders() {
        return gitService.listFolders();
    }

    // Create a new folder
    @PostMapping("/folders")
    public String createFolder(@RequestBody Map<String, String> payload) {
        String name = payload.get("name");
        if (name == null || name.isBlank()) {
            throw new RuntimeException("Missing 'name' in request body");
        }
        return gitService.createFolder(name);
    }

    // Get current repository status
    @GetMapping("/status")
    public Map<String, String> getStatus() {
        return gitService.getRepositoryStatus();
    }

    @PostMapping("/push")
    public String pushRepo(@RequestBody Map<String, String> payload) {
        String url = payload.get("url"); // Optional if already set
        String token = payload.get("token");
        if (token == null || token.isBlank()) {
            throw new RuntimeException("GitHub Token is required");
        }
        return gitService.pushRepository(url, token);
    }

    @PostMapping("/create-remote")
    public String createRemoteRepo(@RequestBody Map<String, String> payload) {
        String name = payload.get("name");
        String token = payload.get("token");
        boolean isPrivate = Boolean.parseBoolean(payload.getOrDefault("private", "true"));
        
        if (name == null || name.isBlank()) throw new RuntimeException("Missing 'name'");
        if (token == null || token.isBlank()) throw new RuntimeException("Missing 'token'");
        
        return gitService.createGitHubRepository(name, token, isPrivate);
    }

    @PostMapping("/credentials")
    public void saveGitCredentials (@RequestBody GitDto.GitCredentials gitCredentials) {
        gitService.setCredentials(gitCredentials);
    }

    @GetMapping("/credentials")
    public GitDto.GitCredentials getGitCredentials () {
        return gitService.getCredentials();
    }


    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<String> handleRuntimeException(RuntimeException e) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(e.getMessage());
    }
}