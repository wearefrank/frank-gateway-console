export type TemplatePart =
    | { kind: "static"; text: string }
    | { kind: "placeholder"; name: string };

// Splits a template string into static text and {placeholder} parts.
export function parseTemplate(template: string): TemplatePart[] {
    return template.split(/({[^}]+})/).filter(Boolean).map(part => {
        // Wrapped in "{}" means it's a placeholder part.
        if (part.startsWith('{') && part.endsWith('}')) {
            return { kind: "placeholder", name: part.slice(1, -1) };
        }
        return { kind: "static", text: part };
    });
}

// Reconstructs an existing id into per-placeholder segments, or null if it doesn't round-trip through the template.
export function tryParseTemplateValue(existing: string, parts: TemplatePart[]): Record<string, string> | null {
    const result: Record<string, string> = {};
    let rem = existing;
    parts.forEach((part, i) => {
        if (part.kind === "static") {
            if (rem.startsWith(part.text)) rem = rem.slice(part.text.length);
        } else {
            const nextStatic = parts
                .slice(i + 1)
                .find((p): p is Extract<TemplatePart, { kind: "static" }> => p.kind === "static");
            const endIdx = nextStatic ? rem.indexOf(nextStatic.text) : rem.length;
            if (endIdx !== -1) {
                result[part.name] = rem.slice(0, endIdx);
                rem = rem.slice(endIdx);
            }
        }
    });
    const reassembled = parts.map((p) => (p.kind === "static" ? p.text : result[p.name] ?? "")).join("");
    return reassembled === existing ? result : null;
}

// Whether a value is safe to hand to the pill editor without it being silently cleared or rewritten.
export function idValueFitsTemplate(
    existing: string,
    parts: TemplatePart[],
    placeHolderOptions: Record<string, string[]> = {},
): boolean {
    if (existing === "") return true;
    const matched = tryParseTemplateValue(existing, parts);
    if (!matched) return false;
    return Object.entries(matched).every(([name, value]) => {
        const options = placeHolderOptions[name] ?? [];
        return value === "" || options.length === 0 || options.includes(value);
    });
}
