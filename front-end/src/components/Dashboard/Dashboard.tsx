import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Cell, Legend, ResponsiveContainer } from 'recharts';
import { useFetch } from '../../hooks/useFetch';
import { client } from '../../api/client';
import styles from './Dashboard.module.css';

interface PromResult {
    metric: Record<string, string>;
    value: [number, string];
}

interface PromQueryResponse {
    status: string;
    data: {
        resultType: string;
        result: PromResult[];
    };
}

interface PromRangeSeries {
    metric: Record<string, string>;
    values: [number, string][];
}

interface PromRangeResponse {
    status: string;
    data: {
        resultType: string;
        result: PromRangeSeries[];
    };
}

interface ConnectionConfig {
    host: string;
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
    const httpStatusFetch = useFetch<PromQueryResponse>('/metrics/prom-query?query=' + encodeURIComponent('sum by (code) (apisix_http_status)'));
    const httpStatusRangeFetch = useFetch<PromRangeResponse>('/metrics/prom-range?query=' + encodeURIComponent('sum by (code) (apisix_http_status)'));

    const [controlStatus, setControlStatus] = useState<ConnectionStatus>('checking');
    const [hiddenCodes, setHiddenCodes] = useState<Set<string>>(new Set());
    const [hoveredCode, setHoveredCode] = useState<string | null>(null);
    const [countdown, setCountdown] = useState<number>(30);

    useEffect(() => {
        if (!connectionConfigFetch.data) return;
        client<boolean>('/config/check?api=control', { method: 'POST', body: connectionConfigFetch.data })
            .then(ok => setControlStatus(ok ? 'online' : 'offline'))
            .catch(() => setControlStatus('offline'));
    }, [connectionConfigFetch.data]);

    useEffect(() => {
        const refresh = setInterval(() => {
            connectionConfigFetch.refetch();
            metricsFetch.refetch();
            liveRoutesFetch.refetch();
            liveUpstreamsFetch.refetch();
            httpStatusFetch.refetch();
            httpStatusRangeFetch.refetch();
            setCountdown(30);
        }, 30_000);
        const tick = setInterval(() => {
            setCountdown(prev => (prev <= 1 ? 30 : prev - 1));
        }, 1_000);
        return () => {
            clearInterval(refresh);
            clearInterval(tick);
        };
    }, []);

    return (
        <div className="container">
            <h1>Dashboard
                <span className="material-icons text-muted" style={{ fontSize: '1rem', verticalAlign: 'middle', marginLeft: '4px'  }}>sync</span>
                <span className="text-small text-muted" style={{ verticalAlign: 'middle'}}>{countdown}s</span>
            </h1>

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
                <div className={`card ${styles.fullWidthCard}`}>
                    <div className="card-header">HTTP Status Codes</div>
                    <div className={`text-small text-muted ${styles.emptyHint}`}>via Prometheus: sum by (code) (apisix_http_status)</div>
                    {httpStatusFetch.loading && <div className={`text-small text-muted ${styles.emptyHint}`}>Loading...</div>}
                    {httpStatusFetch.error && <div className={`text-small text-muted ${styles.emptyHint}`}>Prometheus unavailable</div>}
                    {httpStatusFetch.data?.data?.result?.length === 0 && (
                        <div className={`text-small text-muted ${styles.emptyHint}`}>No data yet — send requests through APISIX to populate this chart</div>
                    )}
                    {httpStatusFetch.data?.data?.result && httpStatusFetch.data.data.result.length > 0 && (() => {
                        const chartData = [...httpStatusFetch.data!.data.result]
                            .sort((a, b) => (a.metric.code ?? '').localeCompare(b.metric.code ?? ''))
                            .map(r => ({ code: r.metric.code ?? '?', count: Number(r.value[1]) }));
                        const colorForCode = (code: string) => {
                            if (code.startsWith('2')) return '#22c55e';
                            if (code.startsWith('3')) return '#3b82f6';
                            if (code.startsWith('4')) return '#f97316';
                            if (code.startsWith('5')) return '#ef4444';
                            return '#94a3b8';
                        };
                        return (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={chartData} margin={{ top: 12, right: 24, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border, #e2e8f0)" />
                                    <XAxis dataKey="code" tick={{ fontSize: 13 }} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={48} />
                                    <Tooltip formatter={(v) => [Number(v).toLocaleString(), 'Requests']} />
                                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                        {chartData.map(entry => (
                                            <Cell key={entry.code} fill={colorForCode(entry.code)} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        );
                    })()}
                </div>
                <div className={`card ${styles.fullWidthCard}`}>
                    <div className="card-header">HTTP Status Codes — Last Hour</div>
                    <div className={`text-small text-muted ${styles.emptyHint}`}>Via Prometheus: sum by (code) (apisix_http_status) 1 min resolution</div>
                    {httpStatusRangeFetch.loading && <div className={`text-small text-muted ${styles.emptyHint}`}>Loading...</div>}
                    {httpStatusRangeFetch.error && <div className={`text-small text-muted ${styles.emptyHint}`}>Prometheus unavailable</div>}
                    {httpStatusRangeFetch.data?.data?.result?.length === 0 && (
                        <div className={`text-small text-muted ${styles.emptyHint}`}>No data yet — send requests through APISIX to populate this chart</div>
                    )}
                    {httpStatusRangeFetch.data?.data?.result && httpStatusRangeFetch.data.data.result.length > 0 && (() => {
                        const series = httpStatusRangeFetch.data!.data.result;
                        const codes = series.map(s => s.metric.code ?? '?').sort();
                        const colorForCode = (code: string) => {
                            if (code.startsWith('2')) return '#22c55e';
                            if (code.startsWith('3')) return '#3b82f6';
                            if (code.startsWith('4')) return '#f97316';
                            if (code.startsWith('5')) return '#ef4444';
                            return '#94a3b8';
                        };

                        // Pivot: { time, "200": n, "404": n, ... }[]
                        const timeMap = new Map<number, Record<string, number>>();
                        for (const s of series) {
                            const code = s.metric.code ?? '?';
                            for (const [ts, val] of s.values) {
                                if (!timeMap.has(ts)) timeMap.set(ts, { ts });
                                timeMap.get(ts)![code] = Number(val);
                            }
                        }
                        // sort chart data and map the time to the propper format
                        const chartData = [...timeMap.values()]
                            .sort((a, b) => a.ts - b.ts)
                            .map(row => ({
                                ...row,
                                time: new Date(row.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            }));

                        return (
                            <ResponsiveContainer width="100%" height={260}>
                                <LineChart data={chartData} margin={{ top: 12, right: 24, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border, #e2e8f0)" />
                                    <XAxis dataKey="time" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={48} />
                                    <Tooltip formatter={(v) => [Number(v).toLocaleString(), 'Requests']} />
                                    <Legend
                                        onClick={(e) => {
                                            const code = e.dataKey as string;
                                            setHiddenCodes(prev => {
                                                const next = new Set(prev);
                                                next.has(code) ? next.delete(code) : next.add(code);
                                                return next;
                                            });
                                        }}
                                        onMouseEnter={(e) => setHoveredCode(e.dataKey as string)}
                                        onMouseLeave={() => setHoveredCode(null)}
                                        wrapperStyle={{ cursor: 'pointer' }}
                                    />
                                    {codes.map(code => (
                                        <Line
                                            key={code}
                                            type="monotone"
                                            dataKey={code}
                                            stroke={colorForCode(code)}
                                            strokeWidth={hoveredCode === code ? 3 : 2}
                                            strokeOpacity={hoveredCode && hoveredCode !== code ? 0.2 : 1}
                                            dot={false}
                                            hide={hiddenCodes.has(code)}
                                            isAnimationActive={false}
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
};