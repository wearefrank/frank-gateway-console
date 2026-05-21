import { ValidationLog } from '../../../actions/ValidationLogger';
import type { ApisixConfig } from '../../../actions/SchemaValidation';
import { CATEGORY_DEFINITIONS, getIdField } from '../../../config/categoryDefinitions';

function getIds(config: ApisixConfig, category: string): Set<string> {
    const raw = (config as Record<string, unknown>)[category + 's'];
    if (!Array.isArray(raw)) return new Set();
    return new Set(
        (raw as (Record<string, unknown> | null)[])
            .filter((e): e is Record<string, unknown> => e !== null && typeof e === 'object')
            .map(e => e['id'])
            .filter((id): id is string => typeof id === 'string'),
    );
}

function getEntries(config: ApisixConfig, category: string): Record<string, unknown>[] {
    const raw = (config as Record<string, unknown>)[category + 's'];
    if (!Array.isArray(raw)) return [];
    return (raw as (Record<string, unknown> | null)[]).filter(
        (e): e is Record<string, unknown> => e !== null && typeof e === 'object',
    );
}

const DUPLICATE_CHECK_CATEGORIES: { cat: string; idField: string }[] = [
    ...Object.keys(CATEGORY_DEFINITIONS).map(cat => ({ cat, idField: getIdField(cat) })),
    { cat: 'stream_route', idField: 'id' },
];

function checkDuplicateIds(config: ApisixConfig): ValidationLog[] {
    const logs: ValidationLog[] = [];

    for (const { cat, idField } of DUPLICATE_CHECK_CATEGORIES) {
        const entries = getEntries(config, cat);
        const seen = new Map<string, number>();

        for (const entry of entries) {
            const id = entry[idField];
            if (typeof id !== 'string') continue;
            // start with 0 or last number always add one
            seen.set(id, (seen.get(id) ?? 0) + 1);
        }

        for (const [id, count] of seen) {
            if (count < 2) continue;
            logs.push(new ValidationLog(
                'error',
                `Duplicate ${cat} ${idField} "${id}" (appears ${count} times)`,
                `/${cat}s`,
            ));
        }
    }

    return logs;
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

    logs.push(...checkDuplicateIds(config));

    return logs;
}
