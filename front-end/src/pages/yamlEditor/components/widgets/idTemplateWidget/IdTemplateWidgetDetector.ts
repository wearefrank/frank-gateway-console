import { getIdField } from '../../../../../config/categoryDefinitions';
import { parseTemplate, idValueFitsTemplate } from '../../../../../config/idTemplate';
import { categoryAtLine, findCommentStart, normalizeScalarValue } from '../../../yamlLineUtils';
import { getMergedOverrides, type DesignerSettings } from '../../../../../hooks/useDesignerSettings';
import type { IdFieldSettings } from '../../../../../components/SchemaFormRenderer/IdField/IdField';
import type { CursorWidgetTarget } from '../CursorContentWidget';

// id-template detection/formatting logic, kept free of React/Monaco so it's unit-testable & reusable.

export interface ParsedIdLine {
    key: string;
    startColumn: number;
    endColumn: number;
}

export interface IdTemplateTarget extends CursorWidgetTarget {
    category: string;
    idField: string;
    idSettings: IdFieldSettings;
    rawValue: string;
}

// Parses a "key: value" line; the columns span the value, stopping before any trailing "# comment".
export function parseIdLine(lineText: string): ParsedIdLine | null {
    // Match a YAML key line, optionally starting with "- " (new entry), and capture the key name.
    const match = lineText.match(/^(\s*(?:-\s+)?)([A-Za-z_][\w-]*):[ \t]?/);
    if (!match) return null;
    const [beforeValue, , key] = match;
    const startColumn = beforeValue.length + 1;

    const valueText = lineText.slice(beforeValue.length);
    const commentIdx = findCommentStart(valueText);
    const valueLength = commentIdx === -1
        ? valueText.length
        : valueText.slice(0, commentIdx).replace(/\s+$/, '').length;

    return { key, startColumn, endColumn: startColumn + valueLength };
}

// The widget target if the cursor is on a category's id field with a value the pill widget can edit losslessly.
export function detectIdTemplate(
    lineText: string,
    lineNumber: number,
    fullText: string,
    designerSettings: DesignerSettings | null | undefined,
): IdTemplateTarget | null {
    const parsed = parseIdLine(lineText);
    const category = categoryAtLine(fullText, lineNumber);
    if (!parsed || !category) return null;
    const idField = getIdField(category);
    if (parsed.key !== idField) return null;

    const idSettings = designerSettings
        ? (getMergedOverrides(designerSettings, category).id as IdFieldSettings | undefined)
        : undefined;
    if (!idSettings?.template) return null;

    const rawValue = normalizeScalarValue(lineText.slice(parsed.startColumn - 1, parsed.endColumn - 1));
    if (!idValueFitsTemplate(rawValue, parseTemplate(idSettings.template), idSettings.placeHolderOptions)) return null;

    return { category, idField, idSettings, rawValue, lineNumber, startColumn: parsed.startColumn, endColumn: parsed.endColumn };
}

export function isSameIdTarget(a: IdTemplateTarget, b: IdTemplateTarget): boolean {
    return a.category === b.category && a.lineNumber === b.lineNumber;
}

export function formatIdValue(value: string): string {
    return `"${value.replace(/"/g, '\\"')}"`;
}
