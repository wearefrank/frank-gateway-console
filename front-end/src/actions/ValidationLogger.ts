import type {ErrorObject} from 'ajv';
import type {ApisixConfig} from './SchemaValidation';

export function getResourceType(path: string | undefined): string | undefined {
    if (!path) return undefined;
    return path.split('/').filter(Boolean)[0];
}

export function getResourceName(path: string | undefined, config: ApisixConfig | null): string | undefined {
    if (!path) return undefined;
    const parts = path.split('/').filter(Boolean);
    const resourceType = parts[0];

    if (parts.length >= 2) {
        const index = parseInt(parts[1], 10);
        if (!isNaN(index)) {
            if (config) {
                // get the section of the config that matches the resource type (e.g., routes, upstreams)
                const resourceList = config[resourceType];
                if (Array.isArray(resourceList) && resourceList[index]) {
                    const resource = resourceList[index];
                    // keep in mind the order you prefer to find first
                    // id
                    if (resource.id) return `Id: ${resource.id}`;
                    // name
                    if (resource.name) return `Name: ${resource.name}`;
                    // username
                    if (resource.username) return `Username: ${resource.username}`;
                    return `[${index}]`;
                }
            }
            // if config is not available, return the index
            return `${resourceType}[${index}]`;
        }
    }
    return undefined;
}

export function getParentName(path: string | undefined): string | undefined {
    if (!path) return undefined;
    const parts = path.split('/').filter(Boolean);
    const pluginsIndex = parts.indexOf('plugins');
    if (pluginsIndex !== -1 && parts.length > pluginsIndex + 1) {
        return parts[pluginsIndex + 1];
    }
    return undefined;
}

export class ValidationLog {
    timestamp: string;
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
    path?: string;
    errorObject?: ErrorObject;

    constructor(
        type: ValidationLog['type'],
        message: string,
        path?: string,
        errorObject?: ErrorObject
    ) {
        this.timestamp = new Date().toLocaleTimeString();
        this.type = type;
        this.message = message;
        this.path = path || errorObject?.instancePath;
        this.errorObject = errorObject;
    }

    getResourceType(): string | undefined {
        return getResourceType(this.path);
    }

    getResourceName(config: ApisixConfig | null): string | undefined {
        return getResourceName(this.path, config);
    }

    getParentName(): string | undefined {
        return getParentName(this.path);
    }

    getErrorObject(): ErrorObject | undefined {
        return this.errorObject;
    }

    formatErrorMessage() {
        if (!this.errorObject || !this.errorObject.keyword) {
            return this.message;
        }

        const keyword = this.errorObject.keyword

        if (keyword === 'required') {
            return this.handleRequired(this.errorObject);
        }

        if (keyword === 'additionalProperties') {
            return this.handleAdditionalProperties(this.errorObject);
        }

        return this.message
    }

    private handleRequired(errorObject: Partial<ErrorObject>): string {
        const baseMessage = "following required properties missing: "

        return baseMessage + (errorObject?.params?.missingProperty || "Failed to find required properties")
    }

    private handleAdditionalProperties(errorObject: Partial<ErrorObject>): string {
        const additionalProperties = errorObject?.params?.additionalProperty || "Failed to find additional properties"

        return `Additional properties found: ${additionalProperties} Try removing them`;
    }
}

export class ValidationLogger {
    private logs: ValidationLog[] = [];

    public add(
        type: ValidationLog['type'],
        message: string,
        path?: string,
        errorObject?: ErrorObject
    ): ValidationLog {

        const log = new ValidationLog(type, message, path, errorObject);
        this.logs.push(log);
        return log;
    }

    public getLogs(): ValidationLog[] {
        return this.logs;
    }

    public clear(): void {
        this.logs = [];
    }
}
