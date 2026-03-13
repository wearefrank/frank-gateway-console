import type {ErrorObject} from "ajv";

interface AjvError {
    parent: string,
    type: string,
    soruceErrors: ErrorObject[]
}

export class ErrorResolver {
    private errors: AjvError[] = [];
}