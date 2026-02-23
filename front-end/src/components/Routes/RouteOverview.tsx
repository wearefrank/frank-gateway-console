import { useFetch } from "../../hooks/useFetch";
import { CreateRoute } from "./CreateRoute.tsx";
import { Link } from "react-router-dom";

interface RouteCardProps {
    route: any;
    id?: string;
    isLive?: boolean;
}

const RouteCard: React.FC<RouteCardProps> = ({ route, id, isLive }) => {
    const isEnabled = (route.status ?? 1) === 1;
    const displayId = id || route.id || 'N/A';
    
    return (
        <div className="card">
            <div className="flex justify-between align-center">
                <strong style={{ fontSize: '16px' }}>{route.name || (isLive ? `Route ${displayId}` : 'Unnamed Route')}</strong>
                {isLive && (
                    <span className="text-small" style={{ 
                        padding: '2px 8px', borderRadius: '12px',
                        background: isEnabled ? 'rgba(99, 230, 190, 0.1)' : 'rgba(255, 107, 107, 0.1)',
                        color: isEnabled ? 'var(--success-color)' : 'var(--error-color)',
                        border: `1px solid ${isEnabled ? 'var(--success-color)' : 'var(--error-color)'}`,
                        fontWeight: 'bold'
                    }}>
                        {isEnabled ? 'LIVE' : 'DISABLED'}
                    </span>
                )}
            </div>
            
            <div className="mb-3 mt-2" style={{ marginTop: '10px' }}>
                <code className="text-small" style={{ background: 'var(--bg-tertiary)', padding: '2px 5px', borderRadius: '3px', color: 'var(--text-primary)' }}>{route.uri}</code>
            </div>

            <div className="flex gap-sm text-small text-muted" style={{ flexWrap: 'wrap' }}>
                {route.methods && (
                    <span style={{ border: '1px solid var(--border-color)', padding: '1px 6px', borderRadius: '4px' }}>
                        Methods: {route.methods.join(', ')}
                    </span>
                )}
                {(route.upstream_id || route.upstreamId) && (
                    <span style={{ border: '1px solid var(--border-color)', padding: '1px 6px', borderRadius: '4px', background: 'var(--bg-tertiary)' }}>
                        Upstream: {route.upstream_id || route.upstreamId}
                    </span>
                )}
                {route.plugins && (
                    <span style={{ border: '1px solid var(--border-color)', padding: '1px 6px', borderRadius: '4px', background: 'var(--bg-tertiary)' }}>
                        Plugins: {Object.keys(route.plugins).length}
                    </span>
                )}
            </div>
        </div>
    );
};

export const RouteOverview = () => {
    const { data: liveData, loading: liveLoading, error: liveError, refetch: refetchLive } = useFetch<any>('/routes/live');
    const { data: savedRoutes, loading: savedLoading, error: savedError, refetch: refetchSaved } = useFetch<any[]>('/routes/saved');

    const isLoading = liveLoading || savedLoading;

    if (isLoading) return (
        <div className="container" style={{ textAlign: 'center', padding: '40px' }}>
            <h2>Loading routes...</h2>
        </div>
    );

    const liveRoutes = liveData?.list || [];

    return (
        <div className="container">
            <div className="flex justify-between align-center mb-4">
                <Link to="/" style={{ textDecoration: 'none' }}>← Back to Home</Link>
                <h1 className="mb-0">Route Management</h1>
                <div style={{ width: '100px' }}></div> {/* Spacer */}
            </div>
            
            <CreateRoute />

            <div className="grid grid-2" style={{ marginTop: '30px' }}>
                {/* Saved Routes Section */}
                <section>
                    <div className="flex justify-between align-center mb-3">
                        <h2 className="mb-0" style={{ fontSize: '20px' }}>YAML Config (Drafts)</h2>
                        <button onClick={refetchSaved}>Refresh</button>
                    </div>
                    
                    {savedError && <p className="text-error card" style={{ background: 'rgba(255, 107, 107, 0.1)' }}>{savedError}</p>}
                    
                    <div className="flex flex-column gap-md">
                        {savedRoutes?.length === 0 ? (
                            <div className="card text-muted" style={{ padding: '30px', textAlign: 'center', borderStyle: 'dashed' }}>
                                No saved routes in YAML.
                            </div>
                        ) : (
                            savedRoutes?.map((route: any) => (
                                <RouteCard key={route.id} route={route} />
                            ))
                        )}
                    </div>
                </section>

                {/* Live Routes Section */}
                <section>
                    <div className="flex justify-between align-center mb-3">
                        <h2 className="mb-0" style={{ fontSize: '20px' }}>Live in APISIX</h2>
                        <button onClick={refetchLive}>Refresh</button>
                    </div>

                    {liveError && <p className="text-error card" style={{ background: 'rgba(255, 107, 107, 0.1)' }}>Could not reach APISIX. Is it running?</p>}
                    
                    <div className="flex flex-column gap-md">
                        {liveRoutes.length === 0 ? (
                            <div className="card text-muted" style={{ padding: '30px', textAlign: 'center', borderStyle: 'dashed' }}>
                                No routes found in APISIX.
                            </div>
                        ) : (
                            liveRoutes.map((routeItem: any) => {
                                const route = routeItem.value;
                                const id = routeItem.key.split('/').pop();
                                return <RouteCard key={routeItem.key} route={route} id={id} isLive />;
                            })
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
};