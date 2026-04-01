import { useEffect, useState } from "react";
import { useFetch } from "../../hooks/useFetch";
import {ApisixSettings} from "../../components/Config/ApisixConnectionSettings.tsx";
import {Link} from "react-router-dom";
import styles from './Config.module.css';

interface ApisixConfigData {
    key: string;
    url: string;
}

export const Config = () => {
    const configFetch = useFetch<ApisixConfigData>('/config');

    const [configState, setConfigState] = useState<ApisixConfigData>({ key: "", url: "" });

    useEffect(() => {
        if (configFetch.data) {
            setConfigState({
                key: configFetch.data.key || "",
                url: configFetch.data.url || ""
            });
        }
    }, [configFetch.data]);

    const handleSaveApisix = async () => {
        try {
            const response = await fetch('api/config', {
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
            const response = await fetch('api/config/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(configState),
            });
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
                url={configState.url}
                apiKey={configState.key}
                onUrlChange={(val: string) => setConfigState(prev => ({ ...prev, url: val }))}
                onKeyChange={(val: string) => setConfigState(prev => ({ ...prev, key: val }))}
                onTestConnection={handleTest}
                onSave={handleSaveApisix}
            />

        </div>
    );
};