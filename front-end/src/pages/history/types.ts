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
// Called on every load; idempotent once profiles is present. migrate({}) gives the empty defaults.
// Spelled out per provider so the compiler checks every field of each settings type.

function legacyProfiles(legacyFilePath: unknown): FileProfile[] {
    const legacyPath = typeof legacyFilePath === 'string' ? legacyFilePath.trim() : '';
    return legacyPath.length > 0 ? [{ title: 'Default', filePath: legacyPath }] : [];
}

function hasProfiles(raw: Record<string, unknown>): boolean {
    return Array.isArray(raw.profiles) && raw.profiles.length > 0;
}

export function migrateGithubSettings(raw: Record<string, unknown>): GithubSettings {
    if (hasProfiles(raw)) return raw as unknown as GithubSettings;
    return {
        githubToken: String(raw.githubToken ?? ''),
        githubRepo: String(raw.githubRepo ?? ''),
        githubBranch: String(raw.githubBranch ?? ''),
        profiles: legacyProfiles(raw.githubFilePath),
    };
}

export function migrateGitlabSettings(raw: Record<string, unknown>): GitlabSettings {
    if (hasProfiles(raw)) return raw as unknown as GitlabSettings;
    return {
        gitlabToken: String(raw.gitlabToken ?? ''),
        gitlabHost: String(raw.gitlabHost ?? ''),
        gitlabProject: String(raw.gitlabProject ?? ''),
        gitlabBranch: String(raw.gitlabBranch ?? ''),
        profiles: legacyProfiles(raw.gitlabFilePath),
    };
}

export function migrateGiteaSettings(raw: Record<string, unknown>): GiteaSettings {
    if (hasProfiles(raw)) return raw as unknown as GiteaSettings;
    return {
        giteaToken: String(raw.giteaToken ?? ''),
        giteaHost: String(raw.giteaHost ?? ''),
        giteaRepo: String(raw.giteaRepo ?? ''),
        giteaBranch: String(raw.giteaBranch ?? ''),
        profiles: legacyProfiles(raw.giteaFilePath),
    };
}
