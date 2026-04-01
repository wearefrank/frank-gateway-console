import { useState, useEffect } from "react";
import styles from './GitConfig.module.css';

interface GitCredentials {
    gitUsername: string;
    gitToken: string;
}

interface GitStatus {
    activeRepo?: string;
    status?: string;
    message?: string;
    branch?: string;
}

export const GitConfig = () => {
    const [repoUrl, setRepoUrl] = useState("");
    const [repoName, setRepoName] = useState("");
    const [newFolderName, setNewFolderName] = useState("");
    const [folders, setFolders] = useState<string[]>([]);
    const [localRepos, setLocalRepos] = useState<string[]>([]);
    const [status, setStatus] = useState<GitStatus | null>(null);
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const [githubToken, setGithubToken] = useState("");
    const [pushRemoteUrl, setPushRemoteUrl] = useState("");
    const [isPrivate, setIsPrivate] = useState(true);

    const [gitCredentials, setGitCredentials] = useState<GitCredentials>({ gitUsername: "", gitToken: "" });

    useEffect(() => {
        refresh();
    }, []);

    const refresh = async () => {
        await fetchFolders();
        await fetchStatus();
        await fetchRepos();
        await getGitCredentials();
    };

    const fetchRepos = async () => {
        try {
            const res = await fetch(`http://localhost:8080/api/git/repos`);
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setLocalRepos(data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchStatus = async () => {
        try {
            const res = await fetch(`http://localhost:8080/api/git/status`);
            const data = await res.json();
            setStatus(data);
            // Auto-fill repo name if active
            if (data?.activeRepo && data.activeRepo !== 'none' && !repoName) {
                setRepoName(data.activeRepo);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const fetchFolders = async () => {
        try {
            const res = await fetch(`http://localhost:8080/api/git/folders`);
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setFolders(data);
        } catch (err: unknown) {
            console.error(err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            setMessage("Error fetching folders: " + errorMessage);
        }
    };

    const handleLoad = async () => {
        if (!repoUrl || !repoName) {
            alert("Enter both Repository Name and URL");
            return;
        }
        setLoading(true);
        setMessage("");
        try {
            const res = await fetch("http://localhost:8080/api/git/clone", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: repoUrl, name: repoName })
            });
            const text = await res.text();
            if (!res.ok) throw new Error(text);
            setMessage(text);
            await refresh();
        } catch (e: unknown) {
            console.error(e);
            const errorMessage = e instanceof Error ? e.message : String(e);
            setMessage("Failed to load: " + errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleInit = async () => {
        if (!repoName) {
            alert("Enter a Repository Name first");
            return;
        }
        setLoading(true);
        setMessage("");
        try {
            const res = await fetch("http://localhost:8080/api/git/init", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: repoName })
            });
            const text = await res.text();
            if (!res.ok) throw new Error(text);
            setMessage(text);
            await refresh();
        } catch (e: unknown) {
            console.error(e);
            const errorMessage = e instanceof Error ? e.message : String(e);
            setMessage("Failed to initialize: " + errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleSwitch = async (name: string) => {
        setLoading(true);
        setMessage("");
        try {
            const res = await fetch("http://localhost:8080/api/git/switch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name })
            });
            const text = await res.text();
            if (!res.ok) throw new Error(text);
            setMessage(text);
            setRepoName(name);
            await refresh();
        } catch (e: unknown) {
            console.error(e);
            const errorMessage = e instanceof Error ? e.message : String(e);
            setMessage("Failed to switch: " + errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateFolder = async () => {
        if (!newFolderName) {
            alert("Enter a folder name");
            return;
        }
        setLoading(true);
        setMessage("");
        try {
            const res = await fetch("http://localhost:8080/api/git/folders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newFolderName })
            });
            const text = await res.text();
            if (!res.ok) throw new Error(text);
            setMessage(text);
            setNewFolderName("");
            await fetchFolders();
        } catch (e: unknown) {
            console.error(e);
            const errorMessage = e instanceof Error ? e.message : String(e);
            setMessage("Failed to create folder: " + errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handlePush = async () => {
        if (!githubToken) {
            alert("GitHub Personal Access Token is required");
            return;
        }
        setLoading(true);
        setMessage("");
        try {
            const res = await fetch("http://localhost:8080/api/git/push", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: pushRemoteUrl || null,
                    token: githubToken
                })
            });
            const text = await res.text();
            if (!res.ok) throw new Error(text);
            setMessage(text);
            await fetchStatus();
        } catch (e: unknown) {
            console.error(e);
            const errorMessage = e instanceof Error ? e.message : String(e);
            setMessage("Push failed: " + errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateRemote = async () => {
        if (!repoName || !githubToken) {
            alert("Enter both Repository Name and GitHub Token");
            return;
        }
        setLoading(true);
        setMessage("");
        try {
            const res = await fetch("http://localhost:8080/api/git/create-remote", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: repoName,
                    token: githubToken,
                    private: isPrivate
                })
            });
            const text = await res.text();
            if (!res.ok) throw new Error(text);
            setMessage(text);
            await refresh();
        } catch (e: unknown) {
            console.error(e);
            const errorMessage = e instanceof Error ? e.message : String(e);
            setMessage("Failed to create remote repository: " + errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleGitCredentials = async () => {
        if (!gitCredentials.gitUsername || !gitCredentials.gitToken) {
            alert("Enter both Git Username and Token");
        }
        try {
            const res = await fetch("http://localhost:8080/api/git/credentials", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(gitCredentials)
            });
            const text = await res.text();
            if (!res.ok) throw new Error(text);
            setMessage(text);
        } catch (e: unknown) {
            console.error(e);
            const errorMessage = e instanceof Error ? e.message : String(e);
            setMessage("Failed to save credentials: " + errorMessage);
        }
    }

    const getGitCredentials = async () => {
        try {
            const res = await fetch("http://localhost:8080/api/git/credentials");
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setGitCredentials(data);
        } catch (err) {
            console.error(err);
        }
    }

    const isError = message.startsWith("Failed") || message.startsWith("Error");

    return (
        <div className={`container ${styles.page}`}>
            <h3 className="card-title">Git Repository Management</h3>

            <div className="grid grid-2">
                <div>
                    {/* Repository Selector/Namer */}
                    <div className="form-group">
                        <label className="form-label">Repository Name</label>
                        <input
                            value={repoName}
                            onChange={(e) => setRepoName(e.target.value)}
                            placeholder="e.g. my-project, test-repo"
                        />
                    </div>

                    <div className="card mb-4">
                        <label className="form-label">Clone Remote Repo into '{repoName || "..."}':</label>
                        <input
                            value={repoUrl}
                            onChange={(e) => setRepoUrl(e.target.value)}
                            placeholder="https://github.com/user/repo.git"
                            className="mb-2"
                        />
                        <button onClick={handleLoad} disabled={loading || !repoName} className={styles.fullWidth}>
                            Clone & Load
                        </button>
                    </div>

                    <div className={`card mb-4 ${styles.dashedCard}`}>
                        <label className="form-label">Or Initialize New Local '{repoName || "..."}':</label>
                        <button onClick={handleInit} disabled={loading || !repoName} className={styles.fullWidth}>
                            Initialize Empty
                        </button>
                    </div>

                    <div className="card mb-4">
                        <label className="form-label">Create New GitHub Repo '{repoName || "..."}':</label>
                        <div className="text-small text-muted mb-2">
                            Requires GitHub Token (below)
                        </div>
                        <label className={`flex align-center mb-3 text-small ${styles.cursorPointer}`}>
                            <input
                                type="checkbox"
                                checked={isPrivate}
                                onChange={(e) => setIsPrivate(e.target.checked)}
                                className={styles.checkboxAuto}
                            />
                            Private Repository
                        </label>
                        <button
                            onClick={handleCreateRemote}
                            disabled={loading || !repoName || !githubToken}
                            className={`btn-outline-success ${styles.fullWidth}`}
                        >
                            Create on GitHub
                        </button>
                    </div>
                </div>

                <div>
                    {/* Local Repositories List */}
                    <div className="card mb-3">
                        <strong className="text-small">Switch to Local Repo:</strong>
                        <div className={`flex gap-sm ${styles.repoList}`}>
                            {localRepos.length > 0 ? localRepos.map(name => (
                                <button
                                    key={name}
                                    onClick={() => handleSwitch(name)}
                                    disabled={loading || status?.activeRepo === name}
                                    className={`text-small ${status?.activeRepo === name ? styles.repoBtnActive : styles.repoBtnInactive}`}
                                >
                                    {name}
                                </button>
                            )) : <div className="text-small text-muted">No local repos found.</div>}
                        </div>
                    </div>

                    {/* Current Status Section */}
                    <div className="card mb-3 text-small">
                        <strong>Current Status:</strong>
                        <div className={status?.status === 'error' ? styles.statusError : styles.statusSuccess}>
                            {status ? status.message : "Loading status..."}
                        </div>
                        {status?.branch && <div className={`text-muted ${styles.branchInfo}`}>Branch: {status.branch}</div>}
                    </div>

                    <div className="mb-4">
                        <label className="form-label">Create Folder in Active Repo:</label>
                        <div className="flex gap-sm">
                            <input
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                placeholder="e.g. docs, src"
                            />
                            <button onClick={handleCreateFolder} disabled={loading || status?.status === 'none'}>
                                Add
                            </button>
                        </div>
                    </div>

                    <div className="card mb-2">
                        <strong className="text-small">Folders in Active Repo:</strong>
                        <ul className={`scroll-y text-small mb-0 ${styles.folderList}`}>
                            {folders.length > 0 ? folders.map(f => <li key={f}>{f}</li>) : <li className="text-muted">No folders found</li>}
                        </ul>
                    </div>

                    <div className="card">
                        <strong className={`text-small mb-2 ${styles.pushLabel}`}>Push to GitHub:</strong>
                        <input
                            type="password"
                            value={githubToken}
                            onChange={(e) => setGithubToken(e.target.value)}
                            placeholder="GitHub Personal Access Token"
                            className="mb-2"
                        />
                        {status?.status === 'local' && (
                            <input
                                type="text"
                                value={pushRemoteUrl}
                                onChange={(e) => setPushRemoteUrl(e.target.value)}
                                placeholder="GitHub Repository URL (https://...)"
                                className="mb-2"
                            />
                        )}
                        <button
                            onClick={handlePush}
                            disabled={loading || status?.status === 'none'}
                            className={`btn-success ${styles.fullWidth} ${styles.noBorder}`}
                        >
                            {loading ? "Pushing..." : "Push to Remote"}
                        </button>
                    </div>
                </div>
            </div>

            <div className={`justify-between align-center card mt-4 ${styles.credentialsCard}`}>Git Credentials
                <div className="flex gap-sm">
                    <input
                        type="text"
                        value={gitCredentials.gitUsername}
                        onChange={(e) => setGitCredentials({ ...gitCredentials, gitUsername: e.target.value })}
                        placeholder="GitHub Username"
                        className={styles.inputAuto}
                    />
                    <input
                        type="password"
                        value={gitCredentials.gitToken}
                        onChange={(e) => setGitCredentials({ ...gitCredentials, gitToken: e.target.value })}
                        placeholder="GitHub Personal Access Token"
                        className={styles.inputAuto}
                    />
                </div>
                <br/>
                <div>
                    Current Credentials: <br/>
                    {gitCredentials.gitUsername} / {gitCredentials.gitToken.substring(0, 4)}.../
                </div>
                <button onClick={handleGitCredentials} className="btn-outline-success">Save</button>
                <button onClick={getGitCredentials} className="btn-outline-primary">Get</button>
            </div>

            {message && (
                <div className={`text-small mb-3 ${isError ? styles.logError : styles.logSuccess}`}>
                    <strong>LOG:</strong> {message}
                </div>
            )}
        </div>
    );
};