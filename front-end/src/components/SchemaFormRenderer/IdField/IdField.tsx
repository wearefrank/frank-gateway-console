import { useMemo, useState } from "react";
import type { FieldProps } from "../SchemaFormRenderer";
import styles from "./IdField.module.css";

export interface IdFieldSettings {
    prefix?: string;
    template?: string;
    placeHolderOptions?: Record<string, string[]>;
}

type TemplatePart =
    | { kind: "static"; text: string }
    | { kind: "placeholder"; name: string };

/**
 * split the template in placeholder par
 *
 * @param template - string that serves as the template
 */
function parseTemplate(template: string): TemplatePart[] {
    return template.split(/({[^}]+})/).filter(Boolean).map(part => {
        // if encapsulated with "{}" its a placeholder part
        if (part.startsWith('{') && part.endsWith('}')) {
            return { kind: "placeholder", name: part.slice(1, -1) };
        }
        return { kind: "static", text: part };
    });
}

function parseIdValue(existing: unknown, parts: TemplatePart[]): Record<string, string> {
    const empty = Object.fromEntries(
        parts
            .filter((p): p is Extract<TemplatePart, { kind: "placeholder" }> => p.kind === "placeholder")
            .map((p) => [p.name, ""])
    );
    if (!existing || typeof existing !== "string") return empty;

    const result = { ...empty };
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
    return reassembled === existing ? result : empty;
}

function assembleValue(parts: TemplatePart[], segments: Record<string, string>): string {
    return parts.map((p) => (p.kind === "static" ? p.text : segments[p.name] ?? "")).join("");
}

const MAX_SEGMENT_PX = 180;
const _sizer = document.createElement("canvas").getContext("2d")!;

function measureText(text: string, font = "500 13px 'JetBrains Mono', monospace"): number {
    _sizer.font = font;
    return _sizer.measureText(text).width;
}

function autoInputWidth(value: string, placeholder: string, padPx = 22): string {
    const measured = Math.max(measureText(value), measureText(placeholder));
    return Math.min(measured + padPx, MAX_SEGMENT_PX) + "px";
}

function autoSelectWidth(value: string, placeholder: string, padPx = 36): string {
    const measured = Math.max(measureText(value), measureText(placeholder));
    return Math.min(measured + padPx, MAX_SEGMENT_PX) + "px";
}

interface PillSegmentProps {
    part: Extract<TemplatePart, { kind: "placeholder" }>;
    value: string;
    options: string[];
    onChange: (val: string) => void;
}

function InputSegment({ part, value, options, onChange }: PillSegmentProps) {
    const filled = value.length > 0;

    if (options.length > 0) {
        return (
            <div className={styles.pillSelectWrapper} style={{ width: autoSelectWidth(value, part.name) }}>
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className={`${styles.pill} ${styles.pillSelect} ${filled ? styles.pillSelectFilled : ""}`}
                    style={{ width: "100%" }}
                >
                    <option value="">{part.name}</option>
                    {options.map((o) => (
                        <option key={o} value={o}>{o}</option>
                    ))}
                </select>
                <span className={`material-icons ${styles.pillArrow}`}>arrow_drop_down</span>
            </div>
        );
    }

    return (
        <input
            type="text"
            placeholder={part.name}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${styles.pill} ${styles.pillInput} 
                        ${filled ? styles.pillFilled : ""}`}
            style={{ width: autoInputWidth(value, part.name) }}
        />
    );
}

function TemplatedIdField({
    field,
    value,
    onChange,
    template,
    placeHolderOptions,
}: {
    field: FieldProps["field"];
    value: unknown;
    onChange?: FieldProps["onChange"];
    template: string;
    placeHolderOptions: Record<string, string[]>;
}) {
    const parts = useMemo(() => parseTemplate(template), [template]);
    const [segments, setSegments] = useState<Record<string, string>>(() => parseIdValue(value, parts));
    const [syncedValue, setSyncedValue] = useState<unknown>(value);

    if (value !== syncedValue) {
        setSyncedValue(value);
        setSegments(parseIdValue(value, parts));
    }

    console.log(segments)

    function handleSegmentChange(name: string, val: string) {
        const next = { ...segments, [name]: val };
        setSegments(next);
        const joined = assembleValue(parts, next);
        setSyncedValue(joined || undefined);
        onChange?.(field.name, joined || undefined);
    }

    const assembled = assembleValue(parts, segments);
    const allFilled = parts
        .filter((p): p is Extract<TemplatePart, { kind: "placeholder" }> => p.kind === "placeholder")
        .every((p) => segments[p.name]);

    return (
        <div className={styles.container}>
            <div className={styles.pillRow}>
                {parts.map((part, i) => {
                    if (part.kind === "static") {
                        return <span key={i} className={styles.staticPart}>{part.text}</span>;
                    }
                    return (
                        <InputSegment
                            key={i}
                            part={part}
                            value={segments[part.name] ?? ""}
                            options={placeHolderOptions[part.name] ?? []}
                            onChange={(val) => handleSegmentChange(part.name, val)}
                        />
                    );
                })}
            </div>
            <div className={styles.preview}>
                <span className={styles.previewLabel}>id:</span>
                <span className={`${styles.previewValue} ${allFilled ? styles.previewValueFilled : ""}`}>
                    {assembled || "—"}
                </span>
            </div>
        </div>
    );
}


export function IdField({ field, value, onChange, settings }: FieldProps) {
    const s = settings as IdFieldSettings | undefined;

    if (s?.template) {
        return (
            <TemplatedIdField
                field={field}
                value={value}
                onChange={onChange}
                template={s.template}
                placeHolderOptions={s.placeHolderOptions ?? {}}
            />
        );
    }

    const current = (value as string) ?? "";
    const hint = s?.prefix ? `prefix: ${s.prefix}` : "";

    return (
        <div className={styles.legacyWrapper}>
            <input
                id={field.name}
                name={field.name}
                type="text"
                placeholder={hint ? `id (${hint})` : "Enter id"}
                value={current}
                onChange={(e) => onChange?.(field.name, e.target.value || undefined)}
            />
        </div>
    );
}
