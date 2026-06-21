export interface ReferenceField {
    /** Field name on this resource that holds a foreign-key value (e.g. 'upstream_id'). */
    field: string;
    /** Which category the foreign-key points to (e.g. 'upstream'). */
    targetCategory: string;
    /**
     * Direction of the topology edge:
     * - 'forward': edge runs from this resource to the target (e.g. route -> upstream)
     * - 'reverse': edge runs from the target to this resource (e.g. plugin_config -> route,
     *   even though the field `plugin_config_id` lives on the route)
     */
    edgeDirection: 'forward' | 'reverse';
    /** Whether the topology edge should be animated (used for upstream connections). */
    animated?: boolean;
    /** Whether the topology edge should be rendered dashed (used for plugin_config connections). */
    dashed?: boolean;
}

export interface CategoryDefinition {
    label: string;
    color: string;
    idField: string;
    fallbackFields: string[];
    /** Fields whose values other resources copy as reference IDs (shown in the References panel). */
    referenceableFields: string[];
    /** FK-style fields on this resource that point to entries in another category. */
    referenceFields: ReferenceField[];
    /** Categories this resource can connect to via auth-plugin matching (e.g. consumer -> route/service/plugin_config). */
    authTargetCategories: string[];
}

/**
 * Auth plugin names whose presence on both a consumer and another resource implies a topology connection.
 * Update this set when APISIX adds or removes authentication plugins.
 */
export const AUTH_PLUGINS: ReadonlySet<string> = new Set([
    'key-auth', 'basic-auth', 'jwt-auth', 'hmac-auth',
    'wolf-rbac', 'openid-connect', 'cas-auth', 'forward-auth',
    'opa', 'ldap-auth', 'multi-auth',
]);

export const CATEGORY_DEFINITIONS: Record<string, CategoryDefinition> = {
    route: {
        label: 'Route', color: '#3b82f6', idField: 'id',
        fallbackFields: ['name', 'uri', 'uris', 'host'],
        referenceableFields: ['id'],
        referenceFields: [
            { field: 'upstream_id',      targetCategory: 'upstream',      edgeDirection: 'forward', animated: true },
            { field: 'service_id',       targetCategory: 'service',       edgeDirection: 'forward'               },
            { field: 'plugin_config_id', targetCategory: 'plugin_config', edgeDirection: 'reverse', dashed: true  },
        ],
        authTargetCategories: [],
    },
    upstream: {
        label: 'Upstream', color: '#22c55e', idField: 'id',
        fallbackFields: ['name', 'host'],
        referenceableFields: ['id'],
        referenceFields: [],
        authTargetCategories: [],
    },
    service: {
        label: 'Service', color: '#f97316', idField: 'id',
        fallbackFields: ['name'],
        referenceableFields: ['id'],
        referenceFields: [
            { field: 'upstream_id', targetCategory: 'upstream', edgeDirection: 'forward', animated: true },
        ],
        authTargetCategories: [],
    },
    consumer: {
        label: 'Consumer', color: '#8b5cf6', idField: 'username',
        fallbackFields: [],
        referenceableFields: ['username'],
        referenceFields: [],
        authTargetCategories: ['route', 'service', 'plugin_config'],
    },
    global_rule: {
        label: 'Global Rule', color: '#ef4444', idField: 'id',
        fallbackFields: [],
        referenceableFields: [],
        referenceFields: [],
        authTargetCategories: [],
    },
    plugin_config: {
        label: 'Plugin Config', color: '#f59e0b', idField: 'id',
        fallbackFields: ['name'],
        referenceableFields: ['id'],
        referenceFields: [],
        authTargetCategories: [],
    },
    ssl: {
        label: 'SSL', color: '#94a3b8', idField: 'id',
        fallbackFields: ['snis', 'cert'],
        referenceableFields: [],
        referenceFields: [],
        authTargetCategories: [],
    },
};

export const CATEGORY_COLOR: Record<string, string> = Object.fromEntries(
    Object.entries(CATEGORY_DEFINITIONS).map(([k, v]) => [k, v.color]),
);

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
    Object.entries(CATEGORY_DEFINITIONS).map(([k, v]) => [k, v.label]),
);


export function getIdField(category: string): string {
    return CATEGORY_DEFINITIONS[category]?.idField ?? 'id';
}

export function getDisplayId(category: string, entry: Record<string, unknown>, index?: number): string {
    const def = CATEGORY_DEFINITIONS[category];
    const raw = entry[def?.idField ?? 'id'];
    if (raw !== undefined && raw !== null && String(raw).trim() !== '') return String(raw);

    for (const field of (def?.fallbackFields ?? [])) {
        const val = entry[field];
        if (val === undefined || val === null) continue;

        const str = Array.isArray(val) ? String(val[0]) : String(val);
        if (str.trim() !== '') return str;
    }

    for (const val of Object.values(entry)) {
        if (typeof val === 'string' && val.trim() !== '') return val;
    }

    return `#${index ?? 0}`;
}
