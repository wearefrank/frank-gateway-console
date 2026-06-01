import React, { useState } from 'react';
import { useVersionHistory, type VersionSummary } from '../../hooks/useVersionHistory';
import { useConfigManager } from '../../hooks/useConfigManager';
import { VersionList } from './VersionList';
import { DiffViewer } from './DiffViewer';
import styles from './HistoryPage.module.css';

// sentinel value used in place of a real commit sha to represent the in-memory (unsaved) state
const CURRENT_VERSION = '__current__';
const GITHUB_STORAGE_KEY = 'github-settings';

interface GithubSettings {
    githubToken: string;
    githubRepo: string;
    githubBranch: string;
    githubFilePath: string;
}

function loadGithubSettings(): GithubSettings {
    try {
        const stored = localStorage.getItem(GITHUB_STORAGE_KEY);
        if (stored) return JSON.parse(stored);
    } catch {}
    return { githubToken: '', githubRepo: '', githubBranch: '', githubFilePath: '' };
}

export const HistoryPage: React.FC = () => {
    const { configManager, setConfig } = useConfigManager();
    const { versions, error, saveVersion, fetchVersionContent, loadFileContent, clearCache, refetch } = useVersionHistory();
    const versionList = versions ?? [];

    const [saveFormOpen, setSaveFormOpen] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loadingFile, setLoadingFile] = useState(false);
    const [pendingRestoreVersion, setPendingRestoreVersion] = useState<VersionSummary | null>(null);

    const [settingsOpen, setSettingsOpen] = useState(false);
    const [githubSettings, setGithubSettings] = useState<GithubSettings>(loadGithubSettings);
    const [githubDraft, setGithubDraft] = useState<GithubSettings>(loadGithubSettings);

    const openSettings = () => {
        setGithubDraft(githubSettings);
        setSettingsOpen(true);
    };

    const saveSettings = () => {
        // invalidate the version cache when the repo/branch/path changes so we don't show stale data
        const repoChanged = githubDraft.githubRepo !== githubSettings.githubRepo
            || githubDraft.githubBranch !== githubSettings.githubBranch
            || githubDraft.githubFilePath !== githubSettings.githubFilePath;
        setGithubSettings(githubDraft);
        localStorage.setItem(GITHUB_STORAGE_KEY, JSON.stringify(githubDraft));
        setSettingsOpen(false);
        if (repoChanged) {
            clearCache();
            refetch();
        }
    };

    const cancelSettings = () => {
        setGithubDraft(githubSettings);
        setSettingsOpen(false);
    };

    const [fromId, setFromId] = useState<string>('');
    const [toId, setToId] = useState<string>(CURRENT_VERSION);
    const [fromContent, setFromContent] = useState<string | null>(null);
    const [toContent, setToContent] = useState<string | null>(null);
    const [fromLabel, setFromLabel] = useState('');
    const [toLabel, setToLabel] = useState('');
    const [diffLoading, setDiffLoading] = useState(false);

    const handleSaveSubmit = async () => {
        setSaving(true);
        try {
            await saveVersion(saveMessage, configManager.getRawText());
            setSaveFormOpen(false);
            setSaveMessage('');
        } finally {
            setSaving(false);
        }
    };

    const handleView = (version: VersionSummary) => {
        if (version.id === CURRENT_VERSION) {
            const latestVersion = versionList[0];
            if (latestVersion) {
                loadDiff(latestVersion.id, CURRENT_VERSION);
            }
            return;
        }
        loadDiff(version.id, CURRENT_VERSION);
    };

    const handleSwapDiff = () => {
        if (fromId || toId) {
            loadDiff(toId, fromId);
        }
    };

    // if there is existing content, show a confirmation step before overwriting it
    const handleRestore = (version: VersionSummary) => {
        const hasConfig = configManager.getRawText().trim().length > 0;
        if (hasConfig) {
            setPendingRestoreVersion(version);
        } else {
            confirmRestore(version);
        }
    };

    const confirmRestore = async (version: VersionSummary) => {
        setPendingRestoreVersion(null);
        setDiffLoading(true);
        try {
            const content = await fetchVersionContent(version.id);
            setConfig(content);
            // keep the diff view in sync if the restored content was one of the compared sides
            if (fromId === CURRENT_VERSION) {
                setFromContent(content);
            } else if (toId === CURRENT_VERSION) {
                setToContent(content);
            }
        } finally {
            setDiffLoading(false);
        }
    };

    const handleLoadFromRepo = async () => {
        setLoadError(null);
        setLoadingFile(true);
        try {
            const content = await loadFileContent();
            setFromContent(content);
            setToContent(configManager.getRawText());
            setFromLabel('Repo (HEAD)');
            setToLabel('Current (unsaved)');
            setFromId('__repo__');
            setToId(CURRENT_VERSION);
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : 'Failed to load file');
        } finally {
            setLoadingFile(false);
        }
    };

    // fetches both sides of the diff; CURRENT_SENTINEL resolves to the in-memory editor text
    const loadDiff = async (newFromId: string, newToId: string) => {
        setFromId(newFromId);
        setToId(newToId);
        setFromContent(null);
        setToContent(null);

        if (!newFromId && !newToId) return;

        setDiffLoading(true);
        try {
            let resolvedFrom: string | null = null;
            let resolvedTo: string | null = null;

            if (newFromId === CURRENT_VERSION) {
                resolvedFrom = configManager.getRawText();
            } else if (newFromId) {
                resolvedFrom = await fetchVersionContent(newFromId);
            }

            if (newToId === CURRENT_VERSION) {
                resolvedTo = configManager.getRawText();
            } else if (newToId) {
                resolvedTo = await fetchVersionContent(newToId);
            }

            setFromContent(resolvedFrom);
            setToContent(resolvedTo);

            // build readable labels like "a1b2c3d my commit message"
            const fromVersion = versionList.find(v => v.id === newFromId);
            const toVersion = versionList.find(v => v.id === newToId);
            const fromLabel = newFromId === CURRENT_VERSION
                ? 'Current (unsaved)'
                : fromVersion ? fromVersion.id.slice(0, 7) + (fromVersion.message ? ` ${fromVersion.message}` : '') : '(empty)';
            setFromLabel(fromLabel);
            setToLabel(newToId === CURRENT_VERSION ? 'Current (unsaved)' : toVersion ? toVersion.id.slice(0, 7) + (toVersion.message ? ` ${toVersion.message}` : '') : '');
        } finally {
            setDiffLoading(false);
        }
    };

    const handleFromChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        loadDiff(e.target.value, toId);
    };

    const handleToChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        loadDiff(fromId, e.target.value);
    };

    return (
        <div className={`container ${styles.page}`}>
            <div className={styles.pageHeader}>
                <h1>Version History</h1>
                <button
                    className="text-small"
                    onClick={() => settingsOpen ? cancelSettings() : openSettings()}
                >
                    Settings
                </button>
            </div>

            {settingsOpen && (
                <div className={`card ${styles.settingsCard}`}>
                    <div className="card-header">
                        <span>GitHub Settings</span>
                    </div>
                    <div className={styles.settingsFields}>
                        <label className={styles.settingsLabel}>
                            <span className="text-small">Repository</span>
                            <input
                                className={styles.saveInput}
                                type="text"
                                placeholder="owner/repo or https://github.com/owner/repo"
                                value={githubDraft.githubRepo}
                                onChange={e => setGithubDraft(prev => ({ ...prev, githubRepo: e.target.value }))}
                            />
                        </label>
                        <label className={styles.settingsLabel}>
                            <span className="text-small">Branch</span>
                            <input
                                className={styles.saveInput}
                                type="text"
                                placeholder="e.g. main"
                                value={githubDraft.githubBranch}
                                onChange={e => setGithubDraft(prev => ({ ...prev, githubBranch: e.target.value }))}
                            />
                        </label>
                        <label className={styles.settingsLabel}>
                            <span className="text-small">Config file path</span>
                            <input
                                className={styles.saveInput}
                                type="text"
                                placeholder="e.g. config/apisix.yaml"
                                value={githubDraft.githubFilePath}
                                onChange={e => setGithubDraft(prev => ({ ...prev, githubFilePath: e.target.value }))}
                            />
                        </label>
                        <label className={styles.settingsLabel}>
                            <span className="text-small">Personal access token</span>
                            <input
                                className={styles.saveInput}
                                type="password"
                                placeholder="ghp_..."
                                value={githubDraft.githubToken}
                                onChange={e => setGithubDraft(prev => ({ ...prev, githubToken: e.target.value }))}
                            />
                        </label>
                    </div>
                    <div className={styles.settingsFooter}>
                        <span className={`text-muted text-small`}>Settings are saved in your browser only. Do not use on shared or public devices.</span>
                        <div className="flex gap-sm">
                            <button className="btn-primary text-small" onClick={saveSettings}>Save Settings</button>
                            <button className="text-small" onClick={cancelSettings}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.layout}>

                <div className={`card flex flex-column ${styles.leftPanel}`}>
                    <div className="card-header">
                        <span>Version History</span>
                    </div>
                    <div className={styles.toolbar}>
                        <button
                            className="btn-primary text-small"
                            onClick={() => setSaveFormOpen(open => !open)}
                        >
                            Commit
                        </button>
                        <button
                            className="text-small"
                            onClick={handleLoadFromRepo}
                            disabled={loadingFile}
                        >
                            {loadingFile ? 'Loading...' : 'Load from repo'}
                        </button>
                    </div>

                    {loadError && (
                        <div className={`text-error text-small ${styles.statusMsg}`}>{loadError}</div>
                    )}

                    {saveFormOpen && (
                        <div className={styles.saveForm}>
                            <span className={`text-muted text-small`}>This will create a git commit in the configured repository.</span>
                            <input
                                type="text"
                                placeholder="Commit message..."
                                value={saveMessage}
                                onChange={e => setSaveMessage(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleSaveSubmit(); }}
                                className={styles.saveInput}
                                autoFocus
                            />
                            <div className="flex gap-sm">
                                <button
                                    className="btn-primary text-small"
                                    onClick={handleSaveSubmit}
                                    disabled={saving}
                                >
                                    {saving ? 'Committing...' : 'Commit'}
                                </button>
                                <button className="text-small" onClick={() => { setSaveFormOpen(false); setSaveMessage(''); }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {error && <div className={`text-error text-small ${styles.statusMsg}`}>{error}</div>}

                    <VersionList
                        versions={[{ id: CURRENT_VERSION, message: 'Current (unsaved)', createdAt: '' }, ...versionList]}
                        currentSentinel={CURRENT_VERSION}
                        loading={versions === null}
                        busy={diffLoading}
                        pendingRestoreId={pendingRestoreVersion?.id}
                        onView={handleView}
                        onRestore={handleRestore}
                        onConfirmRestore={confirmRestore}
                        onCancelRestore={() => setPendingRestoreVersion(null)}
                    />
                </div>

                <div className={`card flex flex-column ${styles.rightPanel}`}>
                    <div className="card-header flex align-center gap-sm flex-wrap">
                        <span>Compare</span>
                        {diffLoading && <span className={`text-muted text-small ${styles.loadingIndicator}`}>Loading...</span>}
                        <select
                            className={`text-small ${styles.compareSelect}`}
                            value={fromId}
                            onChange={handleFromChange}
                        >
                            <option value="">-- From --</option>
                            <option value={CURRENT_VERSION}>Current (unsaved)</option>
                            {versionList.map(v => (
                                <option key={v.id} value={v.id}>
                                    {v.id.slice(0, 7)}{v.message ? ` ${v.message}` : ''}
                                </option>
                            ))}
                        </select>
                        <span className="text-muted text-small">→</span>
                        <select
                            className={`text-small ${styles.compareSelect}`}
                            value={toId}
                            onChange={handleToChange}
                        >
                            <option value="">-- To --</option>
                            <option value={CURRENT_VERSION}>Current (unsaved)</option>
                            {versionList.map(v => (
                                <option key={v.id} value={v.id}>
                                    {v.id.slice(0, 7)}{v.message ? ` ${v.message}` : ''}
                                </option>
                            ))}
                        </select>
                        <button className={`text-small ${styles.swapBtn}`} onClick={handleSwapDiff} title="Swap direction">⇄</button>
                        {toId === CURRENT_VERSION && fromId && fromId !== CURRENT_VERSION && (
                            <span className={`text-small text-muted`}>Changes since</span>
                        )}
                        {fromId === CURRENT_VERSION && toId && toId !== CURRENT_VERSION && (
                            <span className={`text-small text-muted`}>Restore preview</span>
                        )}
                    </div>

                    <div className={styles.diffArea}>
                        <DiffViewer
                            fromContent={fromContent}
                            toContent={toContent}
                            fromLabel={fromLabel}
                            toLabel={toLabel}
                            loading={diffLoading}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
