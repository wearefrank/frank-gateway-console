import { useEffect, useState } from "react";
import { useFetch } from "../../hooks/useFetch";
import {ApisixSettings} from "../../components/Config/ApisixConnectionSettings.tsx";
import {Link} from "react-router-dom";
import styles from './Config.module.css';

interface ApisixConfigData {
    host: string;
    controlPort: number;
    metricsPort: number;
    githubToken: string;
    githubRepo: string;
    githubBranch: string;
    githubFilePath: string;
}

export const Config = () => {
    const configFetch = useFetch<ApisixConfigData>('/config');

    const [configState, setConfigState] = useState<ApisixConfigData>({ host: "http://127.0.0.1", controlPort: 9092, metricsPort: 9091, githubToken: '', githubRepo: '', githubBranch: '', githubFilePath: '' });

    useEffect(() => {
        if (configFetch.data) {
            setConfigState({
                host: configFetch.data.host || "http://127.0.0.1",
                controlPort: configFetch.data.controlPort ?? 9092,
                metricsPort: configFetch.data.metricsPort ?? 9091,
                githubToken: configFetch.data.githubToken || '',
                githubRepo: configFetch.data.githubRepo || '',
                githubBranch: configFetch.data.githubBranch || '',
                githubFilePath: configFetch.data.githubFilePath || '',
            });
        }
    }, [configFetch.data]);

    const handleSaveApisix = async () => {
        try {
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(configState),
            });

            if (!response.ok) throw new Error('Failed to save');

            configFetch.refetch();
            alert("APISIX settings saved!");
        } catch (e) {
            console.error(e);
            alert("Error saving: " + e);
        }
    };

    const handleTest = async (): Promise<boolean> => {
        try {
            const response = await fetch(`/api/config/check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(configState),
            });
            if (!response.ok) return false;
            return await response.json();
        } catch (e) {
            console.error("Test failed", e);
            return false;
        }
    };

    if (configFetch.loading) return <p>Loading configuration...</p>;
    if (configFetch.error) return <p className={styles.errorText}>Error: {configFetch.error}</p>;

    return (
        <div className={`container ${styles.page}`}>
            <Link to="/"><button className="mb-4">back</button></Link>

            <h1>Config</h1>

            <ApisixSettings
                host={configState.host}
                controlPort={configState.controlPort}
                metricsPort={configState.metricsPort}
                onHostChange={(val: string) => setConfigState(prev => ({ ...prev, host: val }))}
                onControlPortChange={(val: number) => setConfigState(prev => ({ ...prev, controlPort: val }))}
                onMetricsPortChange={(val: number) => setConfigState(prev => ({ ...prev, metricsPort: val }))}
                onTestConnection={handleTest}
                onSave={handleSaveApisix}
            />

            <h2>GitHub Versioning</h2>
            <p className={styles.sectionHint}>Link to the GitHub repo where your APISIX config lives. Version history reads from and commits to that repo directly.</p>
            <div className={styles.fieldGroup}>
                <label>Personal Access Token</label>
                <input
                    type="password"
                    placeholder="ghp_..."
                    value={configState.githubToken}
                    onChange={e => setConfigState(prev => ({ ...prev, githubToken: e.target.value }))}
                />
            </div>
            <div className={styles.fieldGroup}>
                <label>Repository</label>
                <input
                    type="text"
                    placeholder="owner/repo-name or https://github.com/owner/repo"
                    value={configState.githubRepo}
                    onChange={e => setConfigState(prev => ({ ...prev, githubRepo: e.target.value }))}
                />
            </div>
            <div className={styles.fieldGroup}>
                <label>Branch</label>
                <input
                    type="text"
                    placeholder="main"
                    value={configState.githubBranch}
                    onChange={e => setConfigState(prev => ({ ...prev, githubBranch: e.target.value }))}
                />
            </div>
            <div className={styles.fieldGroup}>
                <label>Config File Path</label>
                <input
                    type="text"
                    placeholder="config/apisix.yaml"
                    value={configState.githubFilePath}
                    onChange={e => setConfigState(prev => ({ ...prev, githubFilePath: e.target.value }))}
                />
            </div>
            <button className="btn-primary" onClick={handleSaveApisix}>Save Settings</button>

        </div>
    );
};
