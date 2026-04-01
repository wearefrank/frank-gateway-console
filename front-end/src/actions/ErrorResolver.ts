import type {ErrorObject} from "ajv";

export interface ResolvedError {
    message: string;
    path: string;
    errorObject?: AjvErrorCollection;
    sourceError?: ErrorObject;
    hint?: FieldHint;
}

interface FieldHint {
    field: string;
    type?: string;
    possibleOptions?: string[];
    default?: unknown;
    minimum?: number;
    maximum?: number;
}

interface AjvErrorCollection {
    parent: string,
    type: string,
    sourceErrors: ErrorObject[]
}

interface ClassifiedErrors {
    direct: ErrorObject[];
    ifThenWrappers: ErrorObject[];
    ifThenLeaves: ErrorObject[];
    oneOfErrors: ErrorObject[];
}

interface IfConditionProperties {
    field: string,
    kind: 'enum' | 'const',
    values: string[];
}

type MatchResult = 'match' | 'vacuous' | 'no-match' | 'unknown';

class ErrorResolver {
    private errors: AjvErrorCollection[] = [];
    private resolvedErrors: ResolvedError[] = [];

    public clear() {
        this.errors = [];
        this.resolvedErrors = [];
    }

    public addErrors(type: string, parent: string, errors: ErrorObject[]) {
        this.errors.push({type, parent, sourceErrors: errors});
    }

    private skippedKeywords = ['detectPlugins'];

    public handleErrors(): ResolvedError[] {
        this.resolvedErrors = [];

        for (const ajvErrors of this.errors) {

            const filteredErrors = ajvErrors.sourceErrors.filter(
                e => !this.skippedKeywords.includes(e.keyword)
            );

            if (filteredErrors.length == 0) continue;

            const resolvedErrors = this.classifyErrors(filteredErrors);
            const messages: ResolvedError[] = [];

            if (resolvedErrors.direct.length > 0) {
                messages.push(...this.resolveDirectErrors(resolvedErrors.direct, ajvErrors))
            }
            if (resolvedErrors.ifThenWrappers.length > 0) {
                messages.push(...this.resolveBranchErrors(resolvedErrors.ifThenWrappers, resolvedErrors.ifThenLeaves, ajvErrors))
            }
            if (resolvedErrors.oneOfErrors.length > 0) {
                messages.push(...this.resolveOneOfErrors(resolvedErrors.oneOfErrors, ajvErrors))
            }

            this.resolvedErrors.push(...messages)
        }

        return this.resolvedErrors;
    }

    private resolveOneOfErrors(errors: ErrorObject[], entry: AjvErrorCollection): ResolvedError[] {
        const resolvedErrors: ResolvedError[] = [];

        for (const error of errors) {
            const schema = error.schema;
            const data = error.data;

            if (!Array.isArray(schema) || !this.isObject(data)) {
                continue;
            }

            if (error.params?.passingSchemas != null) {
                // AJV already knows which branches matched — use the indices (oneOf only)
                const passing = error.params.passingSchemas as number[];
                const allOptions = this.gatherOneOfOptions(schema);
                const conflicting = passing.map(i => allOptions[i] || ['(unknown variant)']);

                resolvedErrors.push({
                    message: `${entry.parent}: ${error.keyword} — matches multiple variants, pick one:\n| ${this.formatOptions(conflicting)}`,
                    path: this.buildResolvedPath(entry, this.getExactPath(error)),
                    errorObject: entry,
                    sourceError: error,
                });
                continue;
            }

            // No branch matched — score to find closest
            const scored = this.matchOneOfErrors(schema, data);
            resolvedErrors.push({
                message: `${entry.parent}: ${error.keyword} — no variant matched. Closest options:\n| ${this.formatOptions(scored)}`,
                path: this.buildResolvedPath(entry, this.getExactPath(error)),
                errorObject: entry,
                sourceError: error,
            });
        }

        return resolvedErrors;
    }

    private matchOneOfErrors(branch: unknown, data:unknown): string[][] {
        if (!Array.isArray(branch)) return [];

        const dataKeys = this.isObject(data) ? Object.keys(data) : [];
        const optionsWithMatches: { opts: string[]; matchCount: number }[] = [];

        let maxHits = 0;

        for (const error of branch) {
            const opts = this.gatherOneOfOptionsFromBranch(error);

            // see how many opts matches in data
            const matchCount = opts.filter(opt => dataKeys.includes(opt)).length;

            if (matchCount > maxHits){
                maxHits = matchCount;
            }

            optionsWithMatches.push({ opts, matchCount });
        }

        const filteredOptions = optionsWithMatches.filter(
            a => a.matchCount >= maxHits
        );

        // Sort by the highest number of matches first
        filteredOptions.sort(
            (a, b) => b.matchCount - a.matchCount
        );

        return filteredOptions.map(item => item.opts);
    }

    private formatOptions = (options: string[][]) => {
        return `${options.map(opt => opt.join(', ')).join('\n| ')}`;
    };

    private gatherOneOfOptions(schema: unknown): string[][] {
        if (!Array.isArray(schema)) return [];

        const options: string[][] = [];

        for (const branch of schema) {
            options.push(this.gatherOneOfOptionsFromBranch(branch));
        }
        return options;
    }

    private gatherOneOfOptionsFromBranch(branch: unknown): string[] {
        if (!this.isObject(branch)) return [];

        let subOptions: string[] = [];

        if (Array.isArray(branch.required)) {
            subOptions = branch.required.map((item) => item.toString());
            return subOptions;
        }

        if (this.isObject(branch.properties)) {
            subOptions = Object.keys(branch.properties);
            return subOptions;
        }

        return ['(unknown variant)'];
    }

    private classifyErrors(errors: ErrorObject[]): ClassifiedErrors {
        const result: ClassifiedErrors = {
            direct: [],
            ifThenWrappers: [],
            ifThenLeaves: [],
            oneOfErrors: [],
        };

        for (const error of errors) {
            if (error.keyword === 'if') {
                result.ifThenWrappers.push(error)
                continue;
            }

            if (error.keyword === 'anyOf' || error.keyword === 'oneOf') {
                result.oneOfErrors.push(error)
                continue
            }

            if (this.isUnderBranchPath(error)) {
                result.ifThenLeaves.push(error)
                continue;
            }

            result.direct.push(error);
        }

        return result;
    }

    private isUnderBranchPath(errorObj: ErrorObject): boolean {
        return /\/(then|else|anyOf|oneOf)\//.test(errorObj.schemaPath);
    }

    private resolveBranchErrors(ifThenWrappers: ErrorObject[], ifThenLeaves: ErrorObject[], entry: AjvErrorCollection): ResolvedError[] {
        const resolvedErrors: ResolvedError[] = [];

        if (ifThenLeaves.length === 0) return resolvedErrors;

        ifThenWrappers.forEach(wrapper => {
            const ifSchema = wrapper.parentSchema?.if as Record<string, unknown> | undefined;
            const data = wrapper.data as Record<string, unknown>;

            if (!ifSchema) return;

            const properties = ifSchema.properties as Record<string, unknown> | undefined;
            if (!properties) return;

            const parsed: IfConditionProperties[] = [];
            for (const [field, constraint] of Object.entries(properties)) {
                const p = this.parseIfSchemaProperties(field, constraint);
                if (p) {
                    parsed.push(p);
                }
            }

            const matchResult = this.evaluateIfCondition(parsed, data);

            if (matchResult === 'match') {
                const prefix = wrapper.schemaPath.replace(/\/if$/, '');

                const ownedLeaves = ifThenLeaves.filter(
                    leaf => leaf.schemaPath.startsWith(`${prefix}/then/`)
                        || leaf.schemaPath.startsWith(`${prefix}/else/`)
                );

                const conditionString = this.buildConditionString(parsed);

                ownedLeaves.forEach(leaf => {
                    resolvedErrors.push({
                        message: `${entry.parent}: when ${conditionString}, ${this.formatDirectError(leaf)}`,
                        path: this.buildResolvedPath(entry, this.getExactPath(leaf)),
                        errorObject: entry,
                        sourceError: leaf,
                    });
                });
            } else if (matchResult === 'vacuous') {
                resolvedErrors.push(...this.handleVacuousErrors(wrapper, parsed, entry))
            } else {
                console.log('Unhandled match result:', wrapper);
            }
        });

        return resolvedErrors;
    }


    private handleVacuousErrors(wrapper: ErrorObject, parsed: IfConditionProperties[], entry: AjvErrorCollection): ResolvedError[] {
        const field = parsed[0]?.field;

        if (!field) return [];

        const schema = wrapper.parentSchema;

        if (!schema) return [];

        if (this.isObject(schema) && this.isObject(schema.properties) && field in schema.properties) {

            const propDef = schema.properties[field];
            const relPath = wrapper.instancePath ? `${wrapper.instancePath}/${field}` : `/${field}`;
            const exactPath = this.buildResolvedPath(entry, relPath);

            if (!this.isObject(propDef)) return [];

            let options: string[];
            if (Array.isArray(propDef.enum)) {
                options = propDef.enum.map(String);
            } else if ('const' in propDef) {
                options = [String(propDef.const)];
            } else {
                return [{
                    message: `${entry.parent}: '${field}' could not find any constraint properties.`,
                    path: exactPath,
                    errorObject: entry,
                    sourceError: wrapper,
                }];
            }

            // If no specific enum or const options were found, return a generic error message.
            if (options.length === 0) {
                return [{
                    message: `${entry.parent}: '${field}' is required`,
                    path: exactPath,
                    errorObject: entry,
                    sourceError: wrapper,
                }];
            }

            const defaultValue = 'default' in propDef ? String(propDef.default) : undefined;
            const defaultNote = defaultValue ? ` (default: '${defaultValue}')` : '';

            return [{
                message: `${entry.parent}: '${field}' is required${defaultNote}, options: ${options.join(', ')}`,
                path: exactPath,
                errorObject: entry,
                sourceError: wrapper,
            }];
        }
        return [];
    }

    private buildConditionString(parsedConstraints: IfConditionProperties[]): string {
        const parts = parsedConstraints.map(constraint => {
            if (constraint.values.length === 1) {
                return `'${constraint.field}' is '${constraint.values[0]}'`;
            }
            return `'${constraint.field}' is one of: ${constraint.values.join(', ')}`;
        });

        return parts.join(' and ');
    }

    private evaluateIfCondition(parsedConstraints: IfConditionProperties[], data: Record<string, unknown>): MatchResult {
        if (parsedConstraints.length === 0) return 'unknown';

        let allVacuous = true;

        for (const constraint of parsedConstraints) {
            if (!(constraint.field in data)) {
                continue;
            }

            allVacuous = false;

            if (constraint.values.includes(String(data[constraint.field]))) {
                continue;
            }

            return 'no-match';
        }

        if (allVacuous) {
            return 'vacuous';
        }

        return 'match';
    }

    private parseIfSchemaProperties(field: string, constraint: unknown): IfConditionProperties | null {

        if (!field || !(constraint && typeof constraint === 'object')) {
            return null;
        }

        if ('const' in constraint) {
            return {
                field: field,
                kind: 'const',
                values: [String(constraint.const)],
            };
        } else if ('enum' in constraint && Array.isArray(constraint.enum)) {
            return {
                field: field,
                kind: 'enum',
                values: constraint.enum.map(String),
            };
        }
        return null;
    }

    private getExactPath(err: ErrorObject): string {
        const base = err.instancePath;
        switch (err.keyword) {
            case 'required': {
                const field = err.params?.missingProperty ?? '';
                return base ? `${base}/${field}` : `/${field}`;
            }
            case 'additionalProperties': {
                const field = err.params?.additionalProperty ?? '';
                return base ? `${base}/${field}` : `/${field}`;
            }
            default:
                return base;
        }
    }

    // If entry.type is itself a real path (e.g. /routes/0/plugins/limit-count)
    // Otherwise fall back to exactPath or the entry type as a label.
    private buildResolvedPath(entry: AjvErrorCollection, exactPath: string): string {
        if (entry.type.startsWith('/')) {
            return `${entry.type}${exactPath}`;
        }
        return exactPath || entry.type;
    }

    private resolveDirectErrors(
        errors: ErrorObject[],
        entry: AjvErrorCollection
    ): ResolvedError[] {
        return errors.map(err => ({
            message: `${entry.parent}: ${this.formatDirectError(err)}`,
            path: this.buildResolvedPath(entry, this.getExactPath(err)),
            errorObject: entry,
            sourceError: err,
        }));
    }

    private formatDirectError(err: ErrorObject): string {

        const path = err.instancePath;
        const prop = path.split('/').pop() ?? 'unknown';

        switch (err.keyword) {
            case 'required':
                return `missing required property '${err.params?.missingProperty ?? 'unknown'}'`;
            case 'additionalProperties':
                return `unknown property '${err.params?.additionalProperty ?? 'unknown'}'`;
            case 'type':
                return `'${prop}' must be ${err.params?.type ?? 'unknown'}`;
            case 'enum':
                return `'${prop}' must be one of: ${(err.params?.allowedValues ?? []).join(', ')}`;
            case 'minimum':
                return `'${prop}' must be >= ${err.params?.limit}`;
            case 'maximum':
                return `'${prop}' must be <= ${err.params?.limit}`;
            case 'minLength':
                return `'${prop}' must be at least ${err.params?.limit} characters`;
            case 'minItems':
                return `'${prop}' must have at least ${err.params?.limit} items`;
            case 'pattern':
                return `'${prop}' does not match required pattern`;
            default:
                return err.message ?? 'unknown validation error';
        }
    }

    private isObject(val: unknown): val is Record<string, unknown> {
        return val !== null && typeof val === 'object' && !Array.isArray(val);
    }


}

export default ErrorResolver