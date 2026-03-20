import type {ErrorObject} from "ajv";

export interface ResolvedError {
    message: string,
    path: string
    errorObject?: AjvErrorCollection
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

    public getErrors() {
        return this.errors;
    }

    public getResolvedErrors(): ResolvedError[] {
        return this.resolvedErrors;
    }

    private skippedKeywords = ['detectPlugins'];

    public handleErrors(): ResolvedError[] {
        this.resolvedErrors = [];

        for (const ajvErrors of this.errors) {
            // console.log(ajvErrors);

            const filteredErrors = ajvErrors.sourceErrors.filter(
                e => !this.skippedKeywords.includes(e.keyword)
            );

            if (filteredErrors.length == 0) continue;

            const resolvedErrors = this.classifyErrors(filteredErrors);
            const messages: ResolvedError[] = [];

            messages.push(...this.resolveDirectErrors(resolvedErrors.direct, ajvErrors))

            messages.push(...this.resolveBranchErrors(resolvedErrors.ifThenWrappers, resolvedErrors.ifThenLeaves, ajvErrors))

            // TODO: add oneOf / anyOf error handling

            this.resolvedErrors.push(...messages)
        }


        return this.resolvedErrors;
    }

    private classifyErrors(errors: ErrorObject[]): ClassifiedErrors {
        const result: ClassifiedErrors = {
            direct: [],
            ifThenWrappers: [],
            ifThenLeaves: [],
        };

        for (const error of errors) {
            if (error.keyword === 'if') {
                result.ifThenWrappers.push(error)
                continue;
            }

            if (this.isUnderIfThenPath(error)) {
                result.ifThenLeaves.push(error)
                continue;
            }

            result.direct.push(error);
        }

        return result;
    }

    private isUnderIfThenPath(errorObj: ErrorObject): boolean {
        return /\/(then|else)\//.test(errorObj.schemaPath);
    }

    private resolveBranchErrors(ifThenWrappers: ErrorObject[], ifThenLeaves: ErrorObject[], entry: AjvErrorCollection): ResolvedError[] {
        const resolvedErrors: ResolvedError[] = [];

        console.log(entry.type)

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
                        path: entry.type,
                        errorObject: entry,
                    });
                });
            } else if (matchResult === 'vacuous') {
                console.log('Vacuous match for if-then wrapper:', entry);
            }


        });

        return resolvedErrors;
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



    private resolveDirectErrors(
        errors: ErrorObject[],
        entry: AjvErrorCollection
    ): ResolvedError[] {
        return errors.map(err => ({
            message: `${entry.parent}: ${this.formatDirectError(err)}`,
            path: entry.type,
            errorObject: entry,
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
}

export default ErrorResolver