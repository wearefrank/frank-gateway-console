package wearefrank.backend.service;

import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.lib.StoredConfig;
import org.eclipse.jgit.transport.UsernamePasswordCredentialsProvider;
import org.springframework.stereotype.Service;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import wearefrank.backend.dto.GitDto;

import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class GitService {

    private static final String REPOS_BASE_DIR = "git-repositories";
    private final HttpClient httpClient;
    private String activeRepoName = null;
    private GitDto.GitCredentials gitCredentials = null;

    public GitService(HttpClient httpClient) {
        this.httpClient = httpClient;
        File base = new File(REPOS_BASE_DIR);
        if (!base.exists()) {
            base.mkdirs();
        }
    }

    private File getActiveRepoDir() {
        if (activeRepoName == null) return null;
        return new File(REPOS_BASE_DIR, activeRepoName);
    }

    public String switchRepository(String name) {
        File dir = new File(REPOS_BASE_DIR, name);
        if (!dir.exists() || !new File(dir, ".git").exists()) {
            throw new RuntimeException("Repository '" + name + "' not found.");
        }
        this.activeRepoName = name;
        return "Switched to repository: " + name;
    }

    public String cloneRepository(String name, String url) {
        try {
            File dir = new File(REPOS_BASE_DIR, name);
            if (dir.exists()) {
                deleteDirectory(dir);
            }

            try (Git git = Git.cloneRepository()
                    .setURI(url)
                    .setDirectory(dir)
                    .setCloneAllBranches(true)
                    .call()) {
                this.activeRepoName = name;
                return "Successfully cloned repo '" + url + "' as '" + name + "'";
            }
        } catch (Exception e) {
            e.printStackTrace();
            throw new RuntimeException(e.getMessage());
        }
    }

    public String initRepository(String name) {
        try {
            File dir = new File(REPOS_BASE_DIR, name);
            if (dir.exists()) {
                deleteDirectory(dir);
            }
            if (!dir.mkdirs()) {
                throw new IOException("Could not create directory: " + dir);
            }

            try (Git git = Git.init()
                    .setDirectory(dir)
                    .call()) {
                this.activeRepoName = name;
                return "Successfully initialized new repository: " + name;
            }
        } catch (Exception e) {
            e.printStackTrace();
            throw new RuntimeException(e.getMessage());
        }
    }

    public List<String> listFolders() {
        File root = getActiveRepoDir();
        if (root == null || !root.exists() || !root.isDirectory()) {
            return Collections.emptyList();
        }
        File[] files = root.listFiles();
        if (files == null) return Collections.emptyList();

        return Arrays.stream(files)
                .filter(File::isDirectory)
                .filter(f -> !f.getName().equals(".git"))
                .map(File::getName)
                .sorted()
                .collect(Collectors.toList());
    }

    public String createFolder(String folderName) {
        File root = getActiveRepoDir();
        if (root == null) {
            throw new RuntimeException("No repository active. Load or Init one first.");
        }
        File folder = new File(root, folderName);
        if (folder.exists()) {
            throw new RuntimeException("Folder already exists: " + folderName);
        }
        if (!folder.mkdirs()) {
            throw new RuntimeException("Failed to create folder: " + folderName);
        }
        // Create a .gitkeep file so git tracks the folder
        File gitKeep = new File(folder, ".gitkeep");
        try {
            gitKeep.createNewFile();
            
            // Auto commit the new folder
            try (Git git = Git.open(root)) {
                git.add().addFilepattern(folderName).call();
                git.commit().setMessage("Created folder: " + folderName).call();
            }
            
            return "Folder '" + folderName + "' created and committed.";
        } catch (Exception e) {
            throw new RuntimeException("Error during folder creation/commit: " + e.getMessage());
        }
    }

    public Map<String, String> getRepositoryStatus() {
        File dir = getActiveRepoDir();
        if (dir == null || !dir.exists() || !new File(dir, ".git").exists()) {
            return Map.of("status", "none", "message", "No repository loaded", "activeRepo", activeRepoName != null ? activeRepoName : "none");
        }

        try (Git git = Git.open(dir)) {
            String url = git.getRepository().getConfig().getString("remote", "origin", "url");
            String branch = git.getRepository().getBranch();
            if (url == null) {
                return Map.of(
                    "status", "local", 
                    "branch", branch, 
                    "message", "Local repository: " + activeRepoName,
                    "activeRepo", activeRepoName
                );
            } else {
                return Map.of(
                    "status", "cloned", 
                    "url", url, 
                    "branch", branch, 
                    "message", "Cloned from " + url,
                    "activeRepo", activeRepoName
                );
            }
        } catch (Exception e) {
            return Map.of("status", "error", "message", "Error reading repository: " + e.getMessage(), "activeRepo", activeRepoName != null ? activeRepoName : "none");
        }
    }

    public List<String> listRepositories() {
        File base = new File(REPOS_BASE_DIR);
        if (!base.exists() || !base.isDirectory()) return Collections.emptyList();
        File[] files = base.listFiles();
        if (files == null) return Collections.emptyList();

        return Arrays.stream(files)
                .filter(File::isDirectory)
                .filter(f -> new File(f, ".git").exists())
                .map(File::getName)
                .sorted()
                .collect(Collectors.toList());
    }

    public String pushRepository(String remoteUrl, String token) {
        File dir = getActiveRepoDir();
        if (dir == null || !dir.exists()) {
            throw new RuntimeException("No repository active. Load or Init one first.");
        }

        try (Git git = Git.open(dir)) {
            // 1. Configure the remote "origin" if a URL is provided
            if (remoteUrl != null && !remoteUrl.isBlank()) {
                StoredConfig config = git.getRepository().getConfig();
                config.setString("remote", "origin", "url", remoteUrl);
                config.save();
            }

            // 2. Check if remote exists
            String currentUrl = git.getRepository().getConfig().getString("remote", "origin", "url");
            if (currentUrl == null || currentUrl.isBlank()) {
                throw new RuntimeException("No remote URL configured for 'origin'. Please provide a URL.");
            }

            // 3. Execute the push command
            git.push()
                    .setRemote("origin")
                    .setCredentialsProvider(new UsernamePasswordCredentialsProvider(token, ""))
                    .call();

            return "Successfully pushed to GitHub!";
        } catch (Exception e) {
            e.printStackTrace();
            throw new RuntimeException("Push failed: " + e.getMessage());
        }
    }

    public String createGitHubRepository(String name, String token, boolean isPrivate) {
        try {
            ObjectMapper mapper = new ObjectMapper();
            
            Map<String, Object> body = new HashMap<>();
            body.put("name", name);
            body.put("private", isPrivate);
            body.put("auto_init", false); // We will init locally and push

            String jsonBody = mapper.writeValueAsString(body);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.github.com/user/repos"))
                    .header("Authorization", "token " + token)
                    .header("Accept", "application/vnd.github+json")
                    .header("Content-Type", "application/json")
                    .header("X-GitHub-Api-Version", "2022-11-28")
                    .timeout(java.time.Duration.ofSeconds(30))
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                JsonNode node = mapper.readTree(response.body());
                String cloneUrl = node.get("clone_url").asText();
                
                File dir = new File(REPOS_BASE_DIR, name);
                boolean existed = dir.exists();
                
                if (!existed) {
                    initRepository(name);
                } else if (!new File(dir, ".git").exists()) {
                    // Directory exists but is not a git repo, initialize it
                    try (Git git = Git.init().setDirectory(dir).call()) {
                        this.activeRepoName = name;
                    }
                } else {
                    // Already a git repo, just switch to it
                    this.activeRepoName = name;
                }
                
                // Set remote
                try (Git git = Git.open(dir)) {
                    StoredConfig config = git.getRepository().getConfig();
                    config.setString("remote", "origin", "url", cloneUrl);
                    config.save();
                }
                
                String statusMsg = existed ? "linked existing local files" : "initialized locally";
                return "Successfully created repository '" + name + "' on GitHub (" + (isPrivate ? "private" : "public") + ") and " + statusMsg + ".";
            } else {
                throw new RuntimeException("GitHub API error (" + response.statusCode() + "): " + response.body());
            }
        } catch (Exception e) {
            e.printStackTrace();
            throw new RuntimeException("Failed to create GitHub repository: " + e.getMessage());
        }
    }

    private void deleteDirectory(File file) throws IOException {
        Path root = file.toPath();
        if (!Files.exists(root)) return;

        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                try {
                    Files.setAttribute(file, "dos:readonly", false, LinkOption.NOFOLLOW_LINKS);
                } catch (Exception ignored) {}
                Files.delete(file);
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult postVisitDirectory(Path dir, IOException exc) throws IOException {
                Files.delete(dir);
                return FileVisitResult.CONTINUE;
            }
        });
    }

    public GitDto.GitCredentials getCredentials() {
        return gitCredentials;
    }

    public void setCredentials(GitDto.GitCredentials credentials) {
        gitCredentials = credentials;
    }
}