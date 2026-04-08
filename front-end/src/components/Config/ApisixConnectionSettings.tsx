import { useState } from "react";
import styles from './ApisixConnectionSettings.module.css';

type TestStatus = "idle" | "testing" | "success" | "fail";

interface Props {
    host: string;
    adminPort: number;
    controlPort: number;
    metricsPort: number;
    apiKey: string;
    onHostChange: (val: string) => void;
    onAdminPortChange: (val: number) => void;
    onControlPortChange: (val: number) => void;
    onMetricsPortChange: (val: number) => void;
    onKeyChange: (val: string) => void;
    onTestConnection: (api: "admin" | "control") => Promise<boolean>;
    onSave: () => void;
}

export const ApisixSettings = ({ host, adminPort, controlPort, metricsPort, apiKey, onHostChange, onAdminPortChange, onControlPortChange, onMetricsPortChange, onKeyChange, onTestConnection, onSave }: Props) => {
    const [adminStatus, setAdminStatus] = useState<TestStatus>("idle");
    const [controlStatus, setControlStatus] = useState<TestStatus>("idle");

    const handleTestControl = async () => {
        setControlStatus("testing");
        const result = await onTestConnection("control");
        setControlStatus(result ? "success" : "fail");
    };

    const handleTestAdmin = async () => {
        setAdminStatus("testing");
        const result = await onTestConnection("admin");
        setAdminStatus(result ? "success" : "fail");
    };

    return (
        <div className="card">
            <h3 className="card-title">APISIX Configuration</h3>
            <div className="grid gap-md">
                <div className="form-group mb-0">
                    <label className="form-label">Host:</label>
                    <input
                        type="text"
                        value={host}
                        onChange={(e) => onHostChange(e.target.value)}
                        placeholder="http://127.0.0.1"
                    />
                </div>
                <div className="form-group mb-0">
                    <label className="form-label">Admin API Port:</label>
                    <input
                        type="number"
                        value={adminPort}
                        onChange={(e) => onAdminPortChange(Number(e.target.value))}
                        placeholder="9180"
                    />
                </div>
                <div className="form-group mb-0">
                    <label className="form-label">Control API Port:</label>
                    <input
                        type="number"
                        value={controlPort}
                        onChange={(e) => onControlPortChange(Number(e.target.value))}
                        placeholder="9092"
                    />
                </div>
                <div className="form-group mb-0">
                    <label className="form-label">Metrics Port:</label>
                    <input
                        type="number"
                        value={metricsPort}
                        onChange={(e) => onMetricsPortChange(Number(e.target.value))}
                        placeholder="9091"
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
                <button onClick={handleTestControl} disabled={controlStatus === "testing"}>
                    Test Control API
                </button>
                <div className="text-small">
                    {controlStatus === "testing" && <span>Testing...</span>}
                    {controlStatus === "success" && <span className={`text-success ${styles.statusBold}`}>Connected</span>}
                    {controlStatus === "fail" && <span className={`text-error ${styles.statusBold}`}>Failed</span>}
                </div>

                <button onClick={handleTestAdmin} disabled={adminStatus === "testing"}>
                    Test Admin API
                </button>
                <div className="text-small">
                    {adminStatus === "testing" && <span>Testing...</span>}
                    {adminStatus === "success" && <span className={`text-success ${styles.statusBold}`}>Connected</span>}
                    {adminStatus === "fail" && <span className={`text-error ${styles.statusBold}`}>Failed</span>}
                </div>

                <button onClick={onSave} className="btn-primary">
                    Save Settings
                </button>
            </div>
        </div>
    );
};
