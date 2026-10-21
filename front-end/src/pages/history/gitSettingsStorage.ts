import type { FileProfile, GithubSettings, GitlabSettings, GiteaSettings } from './types';
import { migrateGithubSettings, migrateGitlabSettings, migrateGiteaSettings } from './types';

export type GitProvider = 'github' | 'gitlab' | 'gitea';

/** Narrows anything unrecognised to github, the default this console started with. */
export function toGitProvider(value: string | null): GitProvider {
    if (value === 'gitlab' || value === 'gitea') return value;
    return 'github';
}

export const GITHUB_STORAGE_KEY = 'github-settings';
export const GITLAB_STORAGE_KEY = 'gitlab-settings';
export const GITEA_STORAGE_KEY = 'gitea-settings';
export const PROVIDER_STORAGE_KEY = 'git-provider';

/**
 * Providers whose token comes from Keycloak. Kept at module level rather than in React
 * state because getProviderHeaders() runs outside the component tree, and a stale token
 * left over in localStorage must never be sent once the account is linked.
 */
let linkedProviders: ReadonlySet<GitProvider> | null = null;

export function setLinkedProviders(providers: ReadonlySet<GitProvider>): void {
    linkedProviders = providers;
}

export function isLinked(provider: GitProvider): boolean {
    return linkedProviders?.has(provider) ?? false;
}

/** Whether fetchGitIdentities() has answered once this page load; linking always reloads the page. */
export function areLinksKnown(): boolean {
    return linkedProviders !== null;
}

/** The git connection this deployment pins through its environment. */
export interface GitLock {
    provider: GitProvider;
    host: string;
    repo: string;
    branch: string;
    filePath: string;
}

/**
 * Null until the first fetch, and whenever nothing is pinned. Module level for the same
 * reason as linkedProviders: getProviderHeaders() runs outside React.
 *
 * This only keeps the browser honest. The backend applies the same pin to every request,
 * so a stale value here changes which repo the UI *claims*, never which one it reaches.
 */
let gitLock: GitLock | null = null;

export function setGitLock(lock: GitLock | null): void {
    gitLock = lock;
}

export function isGitLocked(): boolean {
    return gitLock !== null;
}

/**
 * The file list to show while the connection is pinned: the one file the environment
 * names, and nothing the user had stored before. Anything else would put files in the
 * dropdown that the backend refuses to read.
 *
 * An empty path means the connection was pinned without naming a file, which the settings
 * panel reports as such rather than pretending there is one.
 */
function lockedProfiles(lock: GitLock): FileProfile[] {
    if (!lock.filePath) return [];
    const title = lock.filePath.split('/').pop() || lock.filePath;
    return [{ title, filePath: lock.filePath }];
}

/** Stored settings for one provider; migrate({}) supplies the empty defaults. */
function readSettings<T>(key: string, migrate: (raw: Record<string, unknown>) => T): T {
    try {
        const stored = localStorage.getItem(key);
        if (stored) return migrate(JSON.parse(stored));
    } catch {
        // ignore parse errors
    }
    return migrate({});
}

// The load* functions below overlay the pinned connection on what the browser stored. The
// token is never overlaid: it stays the user's own credential.

export function loadGithubSettings(): GithubSettings {
    const stored = readSettings(GITHUB_STORAGE_KEY, migrateGithubSettings);
    if (!gitLock) return stored;
    return {
        ...stored,
        githubRepo: gitLock.repo,
        githubBranch: gitLock.branch,
        profiles: lockedProfiles(gitLock),
    };
}

export function loadGitlabSettings(): GitlabSettings {
    const stored = readSettings(GITLAB_STORAGE_KEY, migrateGitlabSettings);
    if (!gitLock) return stored;
    return {
        ...stored,
        gitlabHost: gitLock.host,
        gitlabProject: gitLock.repo,
        gitlabBranch: gitLock.branch,
        profiles: lockedProfiles(gitLock),
    };
}

export function loadGiteaSettings(): GiteaSettings {
    const stored = readSettings(GITEA_STORAGE_KEY, migrateGiteaSettings);
    if (!gitLock) return stored;
    return {
        ...stored,
        giteaHost: gitLock.host,
        giteaRepo: gitLock.repo,
        giteaBranch: gitLock.branch,
        profiles: lockedProfiles(gitLock),
    };
}

export function loadProvider(): GitProvider {
    if (gitLock) return gitLock.provider;
    return toGitProvider(localStorage.getItem(PROVIDER_STORAGE_KEY));
}

/**
 * Per-request git settings for the backend. filePathOverride replaces the file path from
 * localStorage when provided.
 *
 * Token headers are omitted for linked providers: the backend then reads the token from
 * the user's Keycloak account link instead, and it never passes through the browser.
 */
export function getProviderHeaders(filePathOverride?: string): Record<string, string> {
    const filePath = filePathOverride ?? '';
    try {
        const provider = loadProvider();
        if (provider === 'gitlab') {
            const s = loadGitlabSettings();
            return withToken({
                'X-Git-Provider': 'gitlab',
                'X-Gitlab-Host': s.gitlabHost || '',
                'X-Gitlab-Project': s.gitlabProject || '',
                'X-Gitlab-Branch': s.gitlabBranch || '',
                'X-Gitlab-File-Path': filePath,
            }, 'gitlab', 'X-Gitlab-Token', s.gitlabToken);
        }
        if (provider === 'gitea') {
            const s = loadGiteaSettings();
            // Gitea is never brokered through Keycloak, so its token always comes from the browser.
            return {
                'X-Git-Provider': 'gitea',
                'X-Gitea-Token': s.giteaToken || '',
                'X-Gitea-Host': s.giteaHost || '',
                'X-Gitea-Repo': s.giteaRepo || '',
                'X-Gitea-Branch': s.giteaBranch || '',
                'X-Gitea-File-Path': filePath,
            };
        }
        const s = loadGithubSettings();
        return withToken({
            'X-Git-Provider': 'github',
            'X-Github-Repo': s.githubRepo || '',
            'X-Github-Branch': s.githubBranch || '',
            'X-Github-File-Path': filePath,
        }, 'github', 'X-Github-Token', s.githubToken);
    } catch {
        return { 'X-Git-Provider': 'github' };
    }
}

function withToken(
    headers: Record<string, string>,
    provider: GitProvider,
    headerName: string,
    token: string | undefined
): Record<string, string> {
    if (isLinked(provider)) return headers;
    return { ...headers, [headerName]: token || '' };
}
