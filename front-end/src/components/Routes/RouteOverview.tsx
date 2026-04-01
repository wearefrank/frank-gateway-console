import { useFetch } from "../../hooks/useFetch";
import { CreateRoute } from "./CreateRoute.tsx";
import { Link } from "react-router-dom";
import styles from './Routes.module.css';

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
                <strong className={styles.routeName}>{route.name || (isLive ? `Route ${displayId}` : 'Unnamed Route')}</strong>
                {isLive && (
                    <span className={`text-small ${isEnabled ? styles.statusLive : styles.statusDisabled}`}>
                        {isEnabled ? 'LIVE' : 'DISABLED'}
                    </span>
                )}
            </div>

            <div className="mb-3 mt-2">
                <code className={`text-small ${styles.uriCode}`}>{route.uri}</code>
            </div>

            <div className={`flex gap-sm text-small text-muted ${styles.tagsRow}`}>
                {route.methods && (
                    <span className={styles.tag}>
                        Methods: {route.methods.join(', ')}
                    </span>
                )}
                {(route.upstream_id || route.upstreamId) && (
                    <span className={styles.tagFilled}>
                        Upstream: {route.upstream_id || route.upstreamId}
                    </span>
                )}
                {route.plugins && (
                    <span className={styles.tagFilled}>
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
        <div className={`container ${styles.loadingPage}`}>
            <h2>Loading routes...</h2>
        </div>
    );

    const liveRoutes = liveData?.list || [];

    return (
        <div className="container">
            <div className="flex justify-between align-center mb-4">
                <Link to="/" className={styles.backLink}>← Back to Home</Link>
                <h1 className="mb-0">Route Management</h1>
                <div className={styles.spacer}></div> {/* Spacer */}
            </div>
            
            <CreateRoute />

            <div className={`grid grid-2 ${styles.routesGrid}`}>
                {/* Saved Routes Section */}
                <section>
                    <div className="flex justify-between align-center mb-3">
                        <h2 className={`mb-0 ${styles.sectionTitle}`}>YAML Config (Drafts)</h2>
                        <button onClick={refetchSaved}>Refresh</button>
                    </div>

                    {savedError && <p className={`text-error card ${styles.errorBanner}`}>{savedError}</p>}

                    <div className="flex flex-column gap-md">
                        {savedRoutes?.length === 0 ? (
                            <div className={`card text-muted ${styles.emptyState}`}>
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
                        <h2 className={`mb-0 ${styles.sectionTitle}`}>Live in APISIX</h2>
                        <button onClick={refetchLive}>Refresh</button>
                    </div>

                    {liveError && <p className={`text-error card ${styles.errorBanner}`}>Could not reach APISIX. Is it running?</p>}

                    <div className="flex flex-column gap-md">
                        {liveRoutes.length === 0 ? (
                            <div className={`card text-muted ${styles.emptyState}`}>
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