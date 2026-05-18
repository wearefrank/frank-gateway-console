import { ValidationLog } from '../../../actions/ValidationLogger';
import type { ApisixConfig } from '../../../actions/SchemaValidation';

function getIds(config: ApisixConfig, category: string): Set<string> {
    const raw = (config as Record<string, unknown>)[category + 's'];
    if (!Array.isArray(raw)) return new Set();
    return new Set(
        (raw as Record<string, unknown>[])
            .map(e => e['id'])
            .filter((id): id is string => typeof id === 'string'),
    );
}

function getEntries(config: ApisixConfig, category: string): Record<string, unknown>[] {
    const raw = (config as Record<string, unknown>)[category + 's'];
    return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
}

export function checkReferences(config: ApisixConfig): ValidationLog[] {
    const logs: ValidationLog[] = [];

    const upstreamIds     = getIds(config, 'upstream');
    const serviceIds      = getIds(config, 'service');
    const pluginConfigIds = getIds(config, 'plugin_config');

    for (const [i, route] of getEntries(config, 'route').entries()) {
        const routeId = typeof route['id'] === 'string' ? route['id'] : `[${i}]`;

        if (typeof route['upstream_id'] === 'string' && !upstreamIds.has(route['upstream_id'])) {
            logs.push(new ValidationLog(
                'warning',
                `Route "${routeId}": upstream_id "${route['upstream_id']}" not found in upstreams`,
                `/routes/${i}/upstream_id`,
            ));
        }
        if (typeof route['service_id'] === 'string' && !serviceIds.has(route['service_id'])) {
            logs.push(new ValidationLog(
                'warning',
                `Route "${routeId}": service_id "${route['service_id']}" not found in services`,
                `/routes/${i}/service_id`,
            ));
        }
        if (typeof route['plugin_config_id'] === 'string' && !pluginConfigIds.has(route['plugin_config_id'])) {
            logs.push(new ValidationLog(
                'warning',
                `Route "${routeId}": plugin_config_id "${route['plugin_config_id']}" not found in plugin_configs`,
                `/routes/${i}/plugin_config_id`,
            ));
        }
    }

    for (const [i, service] of getEntries(config, 'service').entries()) {
        const serviceId = typeof service['id'] === 'string' ? service['id'] : `[${i}]`;
        if (typeof service['upstream_id'] === 'string' && !upstreamIds.has(service['upstream_id'])) {
            logs.push(new ValidationLog(
                'warning',
                `Service "${serviceId}": upstream_id "${service['upstream_id']}" not found in upstreams`,
                `/services/${i}/upstream_id`,
            ));
        }
    }

    return logs;
}
