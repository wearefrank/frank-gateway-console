import { useState, useEffect, useCallback, useRef } from 'react';
import { client } from '../api/client';

const GITHUB_STORAGE_KEY = 'github-settings';

function getGithubHeaders(): Record<string, string> {
    try {
        const stored = localStorage.getItem(GITHUB_STORAGE_KEY);
        if (!stored) return {};
        const s = JSON.parse(stored);
        return {
            'X-Github-Token': s.githubToken || '',
            'X-Github-Repo': s.githubRepo || '',
            'X-Github-Branch': s.githubBranch || '',
            'X-Github-File-Path': s.githubFilePath || '',
        };
    } catch {
        return {};
    }
}

export interface VersionSummary {
    id: string;
    message: string;
    createdAt: string;
    commitUrl?: string;
    author?: string;
}

interface VersionDetail extends VersionSummary {
    content: string;
}

interface UseVersionHistory {
    versions: VersionSummary[] | null;
    loading: boolean;
    error: string | null;
    refetch: () => void;
    clearCache: () => void;
    saveVersion: (message: string, content: string) => Promise<void>;
    fetchVersionContent: (id: string) => Promise<string>;
    loadFileContent: () => Promise<string>;
}

// module-level cache so the list and content survive component remounts without a refetch
let cachedVersions: VersionSummary[] | null = null;
let cachedLatestId: string | null = null;
const cachedContent = new Map<string, string>();

export function useVersionHistory(): UseVersionHistory {
    const [versions, setVersions] = useState<VersionSummary[] | null>(cachedVersions);
    const [error, setError] = useState<string | null>(null);
    const controllerRef = useRef<AbortController | null>(null);

    const fetchVersions = useCallback(async () => {
        // abort any in-flight request before starting a new one
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        try {
            const data = await client<VersionSummary[]>('/versions', { signal: controller.signal, headers: getGithubHeaders() });
            // only update state when the list actually changed (avoids unnecessary re-renders)
            const latestId = data[0]?.id ?? null;
            if (latestId !== cachedLatestId) {
                cachedVersions = data;
                cachedLatestId = latestId;
                setVersions(data);
            }
            setError(null);
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') return;
            setError(err instanceof Error ? err.message : 'An error occurred');
            cachedVersions = null;
            cachedLatestId = null;
            cachedContent.clear();
            setVersions([]);
        }
    }, []);

    useEffect(() => {
        fetchVersions();
        // poll every 60 s so the list stays fresh in long-running sessions
        const interval = setInterval(fetchVersions, 60_000);
        return () => {
            controllerRef.current?.abort();
            clearInterval(interval);
        };
    }, [fetchVersions]);

    const saveVersion = async (message: string, content: string): Promise<void> => {
        const newVersion = await client<VersionSummary>('/versions', { body: { message, content }, headers: getGithubHeaders() });
        // optimistically prepend the new version, then refetch to confirm
        cachedVersions = [newVersion, ...(cachedVersions ?? [])];
        cachedLatestId = newVersion.id;
        setVersions([...cachedVersions]);
        fetchVersions();
    };

    const fetchVersionContent = async (id: string): Promise<string> => {
        // content never changes for a given commit sha, so it's safe to cache indefinitely
        const hit = cachedContent.get(id);
        if (hit !== undefined) return hit;
        const detail = await client<VersionDetail>(`/versions/${id}`, { method: 'GET', headers: getGithubHeaders() });
        cachedContent.set(id, detail.content);
        return detail.content;
    };

    // loads the current HEAD file directly from the repo (not a specific commit)
    const loadFileContent = async (): Promise<string> => {
        const response = await fetch('/api/versions/file', { headers: getGithubHeaders() });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `HTTP ${response.status}`);
        }
        return response.text();
    };

    const clearCache = () => {
        cachedVersions = null;
        cachedLatestId = null;
        cachedContent.clear();
        setVersions(null);
    };

    return {
        versions,
        loading: versions === null,
        error,
        refetch: fetchVersions,
        clearCache,
        saveVersion,
        fetchVersionContent,
        loadFileContent,
    };
}
