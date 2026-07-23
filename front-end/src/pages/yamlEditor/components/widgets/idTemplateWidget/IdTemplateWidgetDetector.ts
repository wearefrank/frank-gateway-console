import { getIdField } from '../../../../../config/categoryDefinitions';
import { parseTemplate, idValueFitsTemplate } from '../../../../../config/idTemplate';
import { buildCursorLocation, normalizeScalarValue } from '../../providers/CursorLocation';
import { findCommentStart } from '../../../yamlLineUtils';
import { getMergedOverrides, type DesignerSettings } from '../../../../../hooks/useDesignerSettings';
import type { IdFieldSettings } from '../../../../../components/SchemaFormRenderer/IdField/IdField';
import type { CursorWidgetTarget } from '../CursorContentWidget';

export interface ParsedIdLine {
    key: string;
    startColumn: number;
    endColumn: number;
}

export interface ResolvedIdField {
    category: string;
    idField: string;
    idSettings: IdFieldSettings;
    parsed: ParsedIdLine;
    rawValue: string;
}

export interface IdTemplateTarget extends CursorWidgetTarget {
    category: string;
    idField: string;
    idSettings: IdFieldSettings;
    rawValue: string;
}

// id-template detection/formatting logic, kept free of React/Monaco so it's unit-testable & reusable.
export class IdTemplateWidgetDetector {
    // Parses a "key: value" line, stopping before any trailing "# comment".
    static parseLine(lineText: string): ParsedIdLine | null {
        // Match a YAML key line, optionally starting with "- " (new entry), and capture the key name.
        const match = lineText.match(/^(\s*(?:-\s+)?)([A-Za-z_][\w-]*):[ \t]?/);
        if (!match) return null;
        const [prefix, , key] = match;
        const startColumn = prefix.length + 1;

        const valueText = lineText.slice(prefix.length);
        const commentIdx = findCommentStart(valueText);
        let valueLength: number;

        if (commentIdx === -1) {
            valueLength = valueText.length;
        } else {
            // Ignore any trailing comment.
            valueLength = valueText.slice(0, commentIdx).replace(/\s+$/, '').length;
        }

        return { key, startColumn, endColumn: startColumn + valueLength };
    }

    // True if the cursor is on a category's id field with a value the pill widget can edit losslessly.
    static detect(
        lineText: string,
        lineNumber: number,
        fullText: string,
        designerSettings: DesignerSettings | null | undefined,
    ): ResolvedIdField | null {
        const parsed = IdTemplateWidgetDetector.parseLine(lineText);
        const category = buildCursorLocation(fullText, lineNumber, undefined)?.category;
        if (!parsed || !category) return null;
        const idField = getIdField(category);
        if (parsed.key !== idField) return null;

        const idSettings = designerSettings
            ? (getMergedOverrides(designerSettings, category).id as IdFieldSettings | undefined)
            : undefined;
        if (!idSettings?.template) return null;

        const rawValue = normalizeScalarValue(lineText.slice(parsed.startColumn - 1, parsed.endColumn - 1));

        const parts = parseTemplate(idSettings.template);
        if (!idValueFitsTemplate(rawValue, parts, idSettings.placeHolderOptions)) return null;

        return { category, idField, idSettings, parsed, rawValue };
    }

    // Reshapes a detect() result into the CursorWidgetDef target shape.
    static detectTarget(
        lineText: string,
        lineNumber: number,
        fullText: string,
        designerSettings: DesignerSettings | null | undefined,
    ): IdTemplateTarget | null {
        const resolved = IdTemplateWidgetDetector.detect(lineText, lineNumber, fullText, designerSettings);
        if (!resolved) return null;
        return {
            category: resolved.category,
            idField: resolved.idField,
            idSettings: resolved.idSettings,
            rawValue: resolved.rawValue,
            lineNumber,
            startColumn: resolved.parsed.startColumn,
            endColumn: resolved.parsed.endColumn,
        };
    }

    static isSameTarget(a: IdTemplateTarget, b: IdTemplateTarget): boolean {
        return a.category === b.category && a.lineNumber === b.lineNumber;
    }

    static formatWriteValue(value: string): string {
        return `"${value.replace(/"/g, '\\"')}"`;
    }
}
