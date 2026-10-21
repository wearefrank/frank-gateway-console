import { StatusDot } from './StatusDot';
import type { LiveRoute } from './dashboardTypes';
import styles from './Dashboard.module.css';

export const LiveRouteItem = ({ route }: { route: LiveRoute }) => {
    // A route matches on either a single uri or a uris list.
    const uris = route.value.uri ? [route.value.uri] : (route.value.uris ?? []);
    return (
        <div className={styles.statRow}>
            <span className={styles.uriList} title={uris.join('\n')}>
                {/* APISIX reports an enabled route as status 1. */}
                <StatusDot status={route.value.status === 1 ? 'online' : 'offline'} />
                <span className={styles.uriLines}>
                    {uris.map(uri => <code key={uri} className={styles.truncate}>{uri}</code>)}
                </span>
            </span>
            <span className={`text-muted text-small ${styles.truncate}`} title={route.value.id}>
                id: {route.value.id}
            </span>
        </div>
    );
};
