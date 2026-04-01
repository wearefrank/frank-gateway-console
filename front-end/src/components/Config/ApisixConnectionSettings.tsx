import { useState } from "react";
import styles from './ApisixConnectionSettings.module.css';

interface Props {
    url: string;
    apiKey: string;
    onUrlChange: (val: string) => void;
    onKeyChange: (val: string) => void;
    onTestConnection: () => Promise<boolean>;
    onSave: () => void; // Added onSave prop
}

export const ApisixSettings = ({ url, apiKey, onUrlChange, onKeyChange, onTestConnection, onSave }: Props) => {
    const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "fail">("idle");

    const handleTestClick = async () => {
        setTestStatus("testing");
        const isValid = await onTestConnection();
        setTestStatus(isValid ? "success" : "fail");
    };

    return (
        <div className="card">
            <h3 className="card-title">APISIX Configuration</h3>
            <div className="grid gap-md">
                <div className="form-group mb-0">
                    <label className="form-label">Base URL:</label>
                    <input
                        type="text"
                        value={url}
                        onChange={(e) => onUrlChange(e.target.value)}
                        placeholder="http://127.0.0.1:9180"
                    />
                </div>
                <div className="form-group mb-0">
                    <label className="form-label">Admin Key:</label>
                    <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => onKeyChange(e.target.value)}
                        placeholder="Enter Admin Key"
                    />
                </div>
            </div>

            <div className={`flex align-center gap-md mt-4 ${styles.actions}`}>
                <button onClick={handleTestClick} disabled={testStatus === "testing"}>
                    Test Connection
                </button>

                <button onClick={onSave} className="btn-primary">
                    Save Settings
                </button>

                {/* Status Indicator */}
                <div className="text-small">
                    {testStatus === "testing" && <span>Connecting...</span>}
                    {testStatus === "success" && <span className={`text-success ${styles.statusBold}`}>Connected</span>}
                    {testStatus === "fail" && <span className={`text-error ${styles.statusBold}`}>Failed</span>}
                </div>
            </div>
        </div>
    );
};