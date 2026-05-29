import { useState, useEffect, useCallback, useRef } from 'react';
import { client } from '../api/client';

export interface VersionSummary {
    id: string;
    message: string;
    createdAt: string;
    commitUrl?: string;
}

interface VersionDetail extends VersionSummary {
    content: string;
}

interface UseVersionHistory {
    versions: VersionSummary[] | null;
    loading: boolean;
    error: string | null;
    refetch: () => void;
    saveVersion: (message: string, content: string) => Promise<void>;
    fetchVersionContent: (id: string) => Promise<string>;
    loadFileContent: () => Promise<string>;
}

let cachedVersions: VersionSummary[] | null = null;
let cachedLatestId: string | null = null;
const cachedContent = new Map<string, string>();

export function useVersionHistory(): UseVersionHistory {
    const [versions, setVersions] = useState<VersionSummary[] | null>(cachedVersions);
    const [error, setError] = useState<string | null>(null);
    const controllerRef = useRef<AbortController | null>(null);

    const fetchVersions = useCallback(async () => {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        try {
            const data = await client<VersionSummary[]>('/versions', { signal: controller.signal });
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
            if (cachedVersions === null) setVersions([]);
        }
    }, []);

    useEffect(() => {
        fetchVersions();
        const interval = setInterval(fetchVersions, 60_000);
        return () => {
            controllerRef.current?.abort();
            clearInterval(interval);
        };
    }, [fetchVersions]);

    const saveVersion = async (message: string, content: string): Promise<void> => {
        const newVersion = await client<VersionSummary>('/versions', { body: { message, content } });
        cachedVersions = [newVersion, ...(cachedVersions ?? [])];
        cachedLatestId = newVersion.id;
        setVersions([...cachedVersions]);
        fetchVersions();
    };

    const fetchVersionContent = async (id: string): Promise<string> => {
        const hit = cachedContent.get(id);
        if (hit !== undefined) return hit;
        const detail = await client<VersionDetail>(`/versions/${id}`, { method: 'GET' });
        cachedContent.set(id, detail.content);
        return detail.content;
    };

    const loadFileContent = async (): Promise<string> => {
        const response = await fetch('/api/versions/file');
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `HTTP ${response.status}`);
        }
        return response.text();
    };

    return {
        versions,
        loading: versions === null,
        error,
        refetch: fetchVersions,
        saveVersion,
        fetchVersionContent,
        loadFileContent,
    };
}
