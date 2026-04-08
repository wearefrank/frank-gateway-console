import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch';
import { client } from '../../api/client';
import styles from './Dashboard.module.css';

interface ConnectionConfig {
    key: string;
    host: string;
    adminPort: number;
    controlPort: number;
}

interface MetricsDto {
    totalRequests: number;
    connections: Record<string, number>;
    version: string | null;
    hostname: string | null;
}

interface LiveNode {
    host: string;
    port: number;
    weight: number;
}

interface LiveRouteValue {
    id: string;
    uri: string;
    status: number;
    plugins?: Record<string, unknown>;
    upstream_id?: number;
}

interface LiveRoute {
    key: string;
    value: LiveRouteValue;
}

interface LiveUpstreamValue {
    id: string;
    type: string;
    nodes: LiveNode[];
}

interface LiveUpstream {
    key: string;
    value: LiveUpstreamValue;
}

type ConnectionStatus = 'checking' | 'online' | 'offline';

export const Dashboard: React.FC = () => {
    const connectionConfigFetch = useFetch<ConnectionConfig>('/config');
    const metricsFetch = useFetch<MetricsDto>('/metrics/prometheus');
    const liveRoutesFetch = useFetch<LiveRoute[]>('/metrics/routes');
    const liveUpstreamsFetch = useFetch<LiveUpstream[]>('/metrics/upstreams');

    const [controlStatus, setControlStatus] = useState<ConnectionStatus>('checking');

    useEffect(() => {
        if (!connectionConfigFetch.data) return;
        client<boolean>('/config/check?api=control', { method: 'POST', body: connectionConfigFetch.data })
            .then(ok => setControlStatus(ok ? 'online' : 'offline'))
            .catch(() => setControlStatus('offline'));
    }, [connectionConfigFetch.data]);

    return (
        <div className="container">
            <h1>Dashboard</h1>

            <div className={styles.grid}>
                <div className="card">
                    <div className="card-header">APISIX Status</div>
                    <div className={styles.statusRow}>
                        <span className={`${styles.statusDot} ${
                            controlStatus === 'online'  ? styles.statusDotOnline  :
                            controlStatus === 'offline' ? styles.statusDotOffline :
                                                         styles.statusDotChecking
                        }`} />
                        {controlStatus === 'checking' && 'Checking...'}
                        {controlStatus === 'online'   && 'Online'}
                        {controlStatus === 'offline'  && 'Offline'}
                    </div>
                    {connectionConfigFetch.data && (
                        <div className={styles.endpoint}>
                            {connectionConfigFetch.data.host}:{connectionConfigFetch.data.controlPort}
                        </div>
                    )}
                    <div className={styles.statsList}>
                        <div className={`${styles.statRow} ${metricsFetch.loading ? '' : metricsFetch.data ? 'text-success' : 'text-error'}`}>
                            <span>Prometheus</span>
                            <strong>
                                {metricsFetch.loading ? 'Checking' : metricsFetch.data ? 'Active' : 'Inactive'}
                            </strong>
                        </div>
                    </div>
                    {metricsFetch.data && (
                        <div className={styles.statsList}>
                            {metricsFetch.data.version && (
                                <div className={styles.statRow}><span>Version</span><strong>{metricsFetch.data.version}</strong></div>
                            )}
                            {metricsFetch.data.hostname && (
                                <div className={styles.statRow}><span>Hostname</span><strong>{metricsFetch.data.hostname}</strong></div>
                            )}
                            <div className={styles.statRow}><span>Total Requests</span><strong>{metricsFetch.data.totalRequests.toLocaleString()}</strong></div>
                            {Object.entries(metricsFetch.data.connections).map(([state, count]) => (
                                <div key={state} className={styles.statRow}>
                                    <span>Connections ({state})</span><strong>{count}</strong>
                                </div>
                            ))}
                        </div>
                    )}
                    <Link to="/config" className={styles.cardLink}>Configure</Link>
                </div>

                <div className="card">
                    <div className="card-header">Live Routes</div>
                    {/* loading */}
                    {liveRoutesFetch.loading && <div className={`text-small text-muted ${styles.emptyHint}`}>Loading...</div>}
                    {/* Unavailable */}
                    {liveRoutesFetch.error && <div className={`text-small text-muted ${styles.emptyHint}`}>Unavailable</div>}
                    {liveRoutesFetch.data && liveRoutesFetch.data.length === 0 && (
                        <div>No routes loaded</div>
                    )}
                    {liveRoutesFetch.data?.map(r => (
                        <div key={r.key} className={styles.statsList}>
                            <div className={styles.statRow}>
                                <span>
                                    <span className={`${styles.statusDot} ${r.value.status === 1 ? styles.statusDotOnline : styles.statusDotOffline}`} />
                                    <code>{r.value.uri}</code>
                                </span>
                                <span className="text-muted text-small">id: {r.value.id}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="card">
                    <div className="card-header">Live Upstreams</div>
                    {liveUpstreamsFetch.loading && <div className={`text-small text-muted ${styles.emptyHint}`}>Loading...</div>}
                    {liveUpstreamsFetch.error && <div className={`text-small text-muted ${styles.emptyHint}`}>Unavailable</div>}
                    {liveUpstreamsFetch.data && liveUpstreamsFetch.data.length === 0 && (
                        <div className={`text-small text-muted ${styles.emptyHint}`}>No upstreams loaded</div>
                    )}
                    {liveUpstreamsFetch.data?.map(u => (
                        <div key={u.key} className={styles.statsList}>
                            <div className={styles.statRow}>
                                <strong>Upstream {u.value.id}</strong>
                                <span className="text-muted text-small">{u.value.type}</span>
                            </div>
                            {u.value.nodes?.map(n => (
                                <div key={`${n.host}:${n.port}`} className={styles.statRow}>
                                    <code className="text-small">{n.host}:{n.port}</code>
                                    <span className="text-muted text-small">weight: {n.weight}</span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};