import type { VersionSummary } from '../../hooks/useVersionHistory';

export interface FileProfile {
    title: string;
    filePath: string;
}

export interface GithubSettings {
    githubToken: string;
    githubRepo: string;
    githubBranch: string;
    profiles: FileProfile[];
}

export interface GitlabSettings {
    gitlabToken: string;
    gitlabHost: string;
    gitlabProject: string;
    gitlabBranch: string;
    profiles: FileProfile[];
}

export interface GiteaSettings {
    giteaToken: string;
    giteaHost: string;
    giteaRepo: string;
    giteaBranch: string;
    profiles: FileProfile[];
}

export interface CompareSide {
    profileIndex: number;
    commitId: string;
    versions: VersionSummary[] | null;
    loading: boolean;
}

// Migration helpers: convert legacy single-filePath settings to the new profiles shape.
// Called on every load; idempotent once profiles is present.

export function migrateGithubSettings(raw: Record<string, unknown>): GithubSettings {
    if (Array.isArray(raw.profiles) && raw.profiles.length > 0) {
        return raw as unknown as GithubSettings;
    }
    const legacyPath = typeof raw.githubFilePath === 'string' ? raw.githubFilePath.trim() : '';
    const profiles: FileProfile[] = legacyPath.length > 0
        ? [{ title: 'Default', filePath: legacyPath }]
        : [];
    return {
        githubToken: String(raw.githubToken ?? ''),
        githubRepo: String(raw.githubRepo ?? ''),
        githubBranch: String(raw.githubBranch ?? ''),
        profiles,
    };
}

export function migrateGitlabSettings(raw: Record<string, unknown>): GitlabSettings {
    if (Array.isArray(raw.profiles) && raw.profiles.length > 0) {
        return raw as unknown as GitlabSettings;
    }
    const legacyPath = typeof raw.gitlabFilePath === 'string' ? raw.gitlabFilePath.trim() : '';
    const profiles: FileProfile[] = legacyPath.length > 0
        ? [{ title: 'Default', filePath: legacyPath }]
        : [];
    return {
        gitlabToken: String(raw.gitlabToken ?? ''),
        gitlabHost: String(raw.gitlabHost ?? ''),
        gitlabProject: String(raw.gitlabProject ?? ''),
        gitlabBranch: String(raw.gitlabBranch ?? ''),
        profiles,
    };
}

export function migrateGiteaSettings(raw: Record<string, unknown>): GiteaSettings {
    if (Array.isArray(raw.profiles) && raw.profiles.length > 0) {
        return raw as unknown as GiteaSettings;
    }
    const legacyPath = typeof raw.giteaFilePath === 'string' ? raw.giteaFilePath.trim() : '';
    const profiles: FileProfile[] = legacyPath.length > 0
        ? [{ title: 'Default', filePath: legacyPath }]
        : [];
    return {
        giteaToken: String(raw.giteaToken ?? ''),
        giteaHost: String(raw.giteaHost ?? ''),
        giteaRepo: String(raw.giteaRepo ?? ''),
        giteaBranch: String(raw.giteaBranch ?? ''),
        profiles,
    };
}
