import { useState } from "react";
import styles from './ApisixConnectionSettings.module.css';

type TestStatus = "idle" | "testing" | "success" | "fail";

interface Props {
    host: string;
    controlPort: number;
    metricsPort: number;
    onHostChange: (val: string) => void;
    onControlPortChange: (val: number) => void;
    onMetricsPortChange: (val: number) => void;
    onTestConnection: () => Promise<boolean>;
    onSave: () => void;
}

export const ApisixSettings = ({ host, controlPort, metricsPort, onHostChange, onControlPortChange, onMetricsPortChange, onTestConnection, onSave }: Props) => {
    const [controlStatus, setControlStatus] = useState<TestStatus>("idle");

    const handleTestControl = async () => {
        setControlStatus("testing");
        const result = await onTestConnection();
        setControlStatus(result ? "success" : "fail");
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

                <button onClick={onSave} className="btn-primary">
                    Save Settings
                </button>
            </div>
        </div>
    );
};
