import React, { useState } from 'react';
import { useVersionHistory, type VersionSummary } from '../../hooks/useVersionHistory';
import { useConfigManager } from '../../hooks/useConfigManager';
import { VersionList } from './VersionList';
import { DiffViewer } from './DiffViewer';
import styles from './HistoryPage.module.css';

// sentinel value used in place of a real commit sha to represent the in-memory (unsaved) state
const CURRENT_VERSION = '__current__';
const GITHUB_STORAGE_KEY = 'github-settings';
const GITLAB_STORAGE_KEY = 'gitlab-settings';
const GITEA_STORAGE_KEY = 'gitea-settings';
const PROVIDER_STORAGE_KEY = 'git-provider';

interface GithubSettings {
    githubToken: string;
    githubRepo: string;
    githubBranch: string;
    githubFilePath: string;
}

interface GitlabSettings {
    gitlabToken: string;
    gitlabHost: string;
    gitlabProject: string;
    gitlabBranch: string;
    gitlabFilePath: string;
}

interface GiteaSettings {
    giteaToken: string;
    giteaHost: string;
    giteaRepo: string;
    giteaBranch: string;
    giteaFilePath: string;
}

function loadGithubSettings(): GithubSettings {
    try {
        const stored = localStorage.getItem(GITHUB_STORAGE_KEY);
        if (stored) return JSON.parse(stored);
    } catch {}
    return { githubToken: '', githubRepo: '', githubBranch: '', githubFilePath: '' };
}

function loadGitlabSettings(): GitlabSettings {
    try {
        const stored = localStorage.getItem(GITLAB_STORAGE_KEY);
        if (stored) return JSON.parse(stored);
    } catch {}
    return { gitlabToken: '', gitlabHost: '', gitlabProject: '', gitlabBranch: '', gitlabFilePath: '' };
}

function loadGiteaSettings(): GiteaSettings {
    try {
        const stored = localStorage.getItem(GITEA_STORAGE_KEY);
        if (stored) return JSON.parse(stored);
    } catch {}
    return { giteaToken: '', giteaHost: '', giteaRepo: '', giteaBranch: '', giteaFilePath: '' };
}

function loadProvider(): 'github' | 'gitlab' | 'gitea' {
    const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
    if (stored === 'gitlab' || stored === 'gitea') return stored;
    return 'github';
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
    const [provider, setProvider] = useState<'github' | 'gitlab' | 'gitea'>(loadProvider);
    const [providerDraft, setProviderDraft] = useState<'github' | 'gitlab' | 'gitea'>(loadProvider);
    const [githubSettings, setGithubSettings] = useState<GithubSettings>(loadGithubSettings);
    const [githubDraft, setGithubDraft] = useState<GithubSettings>(loadGithubSettings);
    const [gitlabSettings, setGitlabSettings] = useState<GitlabSettings>(loadGitlabSettings);
    const [gitlabDraft, setGitlabDraft] = useState<GitlabSettings>(loadGitlabSettings);
    const [giteaSettings, setGiteaSettings] = useState<GiteaSettings>(loadGiteaSettings);
    const [giteaDraft, setGiteaDraft] = useState<GiteaSettings>(loadGiteaSettings);

    const openSettings = () => {
        setGithubDraft(githubSettings);
        setGitlabDraft(gitlabSettings);
        setGiteaDraft(giteaSettings);
        setProviderDraft(provider);
        setSettingsOpen(true);
    };

    const saveSettings = () => {
        const githubRepoChanged = githubDraft.githubRepo !== githubSettings.githubRepo
            || githubDraft.githubBranch !== githubSettings.githubBranch
            || githubDraft.githubFilePath !== githubSettings.githubFilePath;
        const gitlabRepoChanged = gitlabDraft.gitlabProject !== gitlabSettings.gitlabProject
            || gitlabDraft.gitlabBranch !== gitlabSettings.gitlabBranch
            || gitlabDraft.gitlabFilePath !== gitlabSettings.gitlabFilePath
            || gitlabDraft.gitlabHost !== gitlabSettings.gitlabHost;
        const giteaRepoChanged = giteaDraft.giteaRepo !== giteaSettings.giteaRepo
            || giteaDraft.giteaBranch !== giteaSettings.giteaBranch
            || giteaDraft.giteaFilePath !== giteaSettings.giteaFilePath
            || giteaDraft.giteaHost !== giteaSettings.giteaHost;
        const providerChanged = providerDraft !== provider;
        const repoChanged = providerChanged
            || (providerDraft === 'github' && githubRepoChanged)
            || (providerDraft === 'gitlab' && gitlabRepoChanged)
            || (providerDraft === 'gitea' && giteaRepoChanged);

        setProvider(providerDraft);
        setGithubSettings(githubDraft);
        setGitlabSettings(gitlabDraft);
        setGiteaSettings(giteaDraft);
        localStorage.setItem(GITHUB_STORAGE_KEY, JSON.stringify(githubDraft));
        localStorage.setItem(GITLAB_STORAGE_KEY, JSON.stringify(gitlabDraft));
        localStorage.setItem(GITEA_STORAGE_KEY, JSON.stringify(giteaDraft));
        localStorage.setItem(PROVIDER_STORAGE_KEY, providerDraft);
        setSettingsOpen(false);
        if (repoChanged) {
            clearCache();
            refetch();
        }
    };

    const cancelSettings = () => {
        setGithubDraft(githubSettings);
        setGitlabDraft(gitlabSettings);
        setGiteaDraft(giteaSettings);
        setProviderDraft(provider);
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
        setLoadError(null);
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
        setLoadError(null);
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

    // fetches both sides of the diff; CURRENT_VERSION resolves to the in-memory editor text
    const loadDiff = async (newFromId: string, newToId: string) => {
        setLoadError(null);
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
            const newFromLabel = newFromId === CURRENT_VERSION
                ? 'Current (unsaved)'
                : fromVersion ? fromVersion.id.slice(0, 7) + (fromVersion.message ? ` ${fromVersion.message}` : '') : '(empty)';
            setFromLabel(newFromLabel);
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

    const providerLabel = provider === 'github' ? 'GitHub' : provider === 'gitlab' ? 'GitLab' : 'Gitea';
    const providerBadgeClass = provider === 'github' ? styles.providerBadgeGithub : provider === 'gitlab' ? styles.providerBadgeGitlab : styles.providerBadgeGitea;

    return (
        <div className={`container ${styles.page}`}>
            <div className={styles.pageHeader}>
                <h1>Version History</h1>
                <div className="flex align-center gap-sm">
                    <span className={`text-small ${styles.providerBadge} ${providerBadgeClass}`}>
                        {providerLabel}
                    </span>
                    <button
                        className="text-small"
                        onClick={() => settingsOpen ? cancelSettings() : openSettings()}
                    >
                        Settings
                    </button>
                </div>
            </div>

            {settingsOpen && (
                <div className={`card ${styles.settingsCard}`}>
                    <div className="card-header">
                        <span>Git Settings</span>
                        <div className={styles.providerTabs}>
                            <button
                                className={`text-small ${styles.providerTab} ${providerDraft === 'github' ? styles.providerTabActive : ''}`}
                                onClick={() => setProviderDraft('github')}
                            >
                                GitHub
                            </button>
                            <button
                                className={`text-small ${styles.providerTab} ${providerDraft === 'gitlab' ? styles.providerTabActive : ''}`}
                                onClick={() => setProviderDraft('gitlab')}
                            >
                                GitLab
                            </button>
                            <button
                                className={`text-small ${styles.providerTab} ${providerDraft === 'gitea' ? styles.providerTabActive : ''}`}
                                onClick={() => setProviderDraft('gitea')}
                            >
                                Gitea
                            </button>
                        </div>
                    </div>

                    {providerDraft === 'github' && (
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
                    )}

                    {providerDraft === 'gitlab' && (
                        <div className={styles.settingsFields}>
                            <label className={`${styles.settingsLabel} ${styles.settingsLabelFull}`}>
                                <span className="text-small">Instance URL</span>
                                <input
                                    className={styles.saveInput}
                                    type="text"
                                    placeholder="https://gitlab.com"
                                    value={gitlabDraft.gitlabHost}
                                    onChange={e => setGitlabDraft(prev => ({ ...prev, gitlabHost: e.target.value }))}
                                />
                            </label>
                            <label className={styles.settingsLabel}>
                                <span className="text-small">Project path</span>
                                <input
                                    className={styles.saveInput}
                                    type="text"
                                    placeholder="owner/project"
                                    value={gitlabDraft.gitlabProject}
                                    onChange={e => setGitlabDraft(prev => ({ ...prev, gitlabProject: e.target.value }))}
                                />
                            </label>
                            <label className={styles.settingsLabel}>
                                <span className="text-small">Branch</span>
                                <input
                                    className={styles.saveInput}
                                    type="text"
                                    placeholder="e.g. main"
                                    value={gitlabDraft.gitlabBranch}
                                    onChange={e => setGitlabDraft(prev => ({ ...prev, gitlabBranch: e.target.value }))}
                                />
                            </label>
                            <label className={styles.settingsLabel}>
                                <span className="text-small">Config file path</span>
                                <input
                                    className={styles.saveInput}
                                    type="text"
                                    placeholder="e.g. config/apisix.yaml"
                                    value={gitlabDraft.gitlabFilePath}
                                    onChange={e => setGitlabDraft(prev => ({ ...prev, gitlabFilePath: e.target.value }))}
                                />
                            </label>
                            <label className={styles.settingsLabel}>
                                <span className="text-small">Personal access token</span>
                                <input
                                    className={styles.saveInput}
                                    type="password"
                                    placeholder="glpat-..."
                                    value={gitlabDraft.gitlabToken}
                                    onChange={e => setGitlabDraft(prev => ({ ...prev, gitlabToken: e.target.value }))}
                                />
                            </label>
                        </div>
                    )}

                    {providerDraft === 'gitea' && (
                        <div className={styles.settingsFields}>
                            <label className={`${styles.settingsLabel} ${styles.settingsLabelFull}`}>
                                <span className="text-small">Instance URL</span>
                                <input
                                    className={styles.saveInput}
                                    type="text"
                                    placeholder="https://gitea.example.com"
                                    value={giteaDraft.giteaHost}
                                    onChange={e => setGiteaDraft(prev => ({ ...prev, giteaHost: e.target.value }))}
                                />
                            </label>
                            <label className={styles.settingsLabel}>
                                <span className="text-small">Repository</span>
                                <input
                                    className={styles.saveInput}
                                    type="text"
                                    placeholder="owner/repo"
                                    value={giteaDraft.giteaRepo}
                                    onChange={e => setGiteaDraft(prev => ({ ...prev, giteaRepo: e.target.value }))}
                                />
                            </label>
                            <label className={styles.settingsLabel}>
                                <span className="text-small">Branch</span>
                                <input
                                    className={styles.saveInput}
                                    type="text"
                                    placeholder="e.g. main"
                                    value={giteaDraft.giteaBranch}
                                    onChange={e => setGiteaDraft(prev => ({ ...prev, giteaBranch: e.target.value }))}
                                />
                            </label>
                            <label className={styles.settingsLabel}>
                                <span className="text-small">Config file path</span>
                                <input
                                    className={styles.saveInput}
                                    type="text"
                                    placeholder="e.g. config/apisix.yaml"
                                    value={giteaDraft.giteaFilePath}
                                    onChange={e => setGiteaDraft(prev => ({ ...prev, giteaFilePath: e.target.value }))}
                                />
                            </label>
                            <label className={styles.settingsLabel}>
                                <span className="text-small">Access token</span>
                                <input
                                    className={styles.saveInput}
                                    type="password"
                                    placeholder="your-gitea-token"
                                    value={giteaDraft.giteaToken}
                                    onChange={e => setGiteaDraft(prev => ({ ...prev, giteaToken: e.target.value }))}
                                />
                            </label>
                        </div>
                    )}

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
