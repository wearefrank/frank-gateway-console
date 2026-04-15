import { useEffect, useState } from "react";
import { useFetch } from "../../hooks/useFetch";
import {ApisixSettings} from "../../components/Config/ApisixConnectionSettings.tsx";
import {Link} from "react-router-dom";
import styles from './Config.module.css';

interface ApisixConfigData {
    key: string;
    host: string;
    adminPort: number;
    controlPort: number;
    metricsPort: number;
}

export const Config = () => {
    const configFetch = useFetch<ApisixConfigData>('/config');

    const [configState, setConfigState] = useState<ApisixConfigData>({ key: "", host: "http://127.0.0.1", adminPort: 9180, controlPort: 9092, metricsPort: 9091 });

    useEffect(() => {
        if (configFetch.data) {
            setConfigState({
                key: configFetch.data.key || "",
                host: configFetch.data.host || "http://127.0.0.1",
                adminPort: configFetch.data.adminPort ?? 9180,
                controlPort: configFetch.data.controlPort ?? 9092,
                metricsPort: configFetch.data.metricsPort ?? 9091,
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

    const handleTest = async (api: "admin" | "control"): Promise<boolean> => {
        try {
            const response = await fetch(`/api/config/check?api=${api}`, {
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
                adminPort={configState.adminPort}
                controlPort={configState.controlPort}
                metricsPort={configState.metricsPort}
                apiKey={configState.key}
                onHostChange={(val: string) => setConfigState(prev => ({ ...prev, host: val }))}
                onAdminPortChange={(val: number) => setConfigState(prev => ({ ...prev, adminPort: val }))}
                onControlPortChange={(val: number) => setConfigState(prev => ({ ...prev, controlPort: val }))}
                onMetricsPortChange={(val: number) => setConfigState(prev => ({ ...prev, metricsPort: val }))}
                onKeyChange={(val: string) => setConfigState(prev => ({ ...prev, key: val }))}
                onTestConnection={handleTest}
                onSave={handleSaveApisix}
            />

        </div>
    );
};
