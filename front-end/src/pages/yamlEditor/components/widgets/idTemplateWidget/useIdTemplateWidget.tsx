import { useEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import { CATEGORY_DEFINITIONS } from '../../../../../config/categoryDefinitions';
import { IdTemplateWidgetDetector, type IdTemplateTarget } from './IdTemplateWidgetDetector';
import type { CursorWidgetDef } from '../CursorContentWidget';
import type { DesignerSettings } from '../../../../../hooks/useDesignerSettings';
import { TemplatedIdField } from '../../../../../components/SchemaFormRenderer/IdField/IdField';
import type { FieldProps } from '../../../../../components/SchemaFormRenderer/SchemaFormRenderer';
import styles from './IdTemplateWidget.module.css';

interface IdTemplateWidgetProps {
    categoryLabel: string;
    idFieldName: string;
    initialValue: string;
    template: string;
    placeHolderOptions: Record<string, string[]>;
    onChange: (value: string) => void;
}

// Floating Monaco content widget wrapping the Config Designer's pill-based template editor.
function IdTemplateWidget({
    categoryLabel,
    idFieldName,
    initialValue,
    template,
    placeHolderOptions,
    onChange,
}: IdTemplateWidgetProps) {
    // TemplatedIdField resets its segments unless its `value` prop is fed back after every change.
    const [value, setValue] = useState(initialValue);

    // Resync if initialValue changes from a direct edit in Monaco, not just a pill edit.
    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    const field: FieldProps['field'] = { name: idFieldName, required: true, type: 'text' };

    function handleChange(_name: string, next: unknown) {
        const str = (next as string | undefined) ?? '';
        setValue(str);
        onChange(str);
    }

    return (
        <div className={styles.card}>
            <p className={styles.header}>{categoryLabel} id template</p>
            <TemplatedIdField
                field={field}
                value={value}
                onChange={handleChange}
                template={template}
                placeHolderOptions={placeHolderOptions}
            />
        </div>
    );
}

// Builds the cursor-widget def that shows the id-template pill widget on a category's id field.
export function useIdTemplateWidget(
    designerSettingsRef: RefObject<DesignerSettings | null | undefined>,
): CursorWidgetDef<IdTemplateTarget> {
    return useMemo<CursorWidgetDef<IdTemplateTarget>>(() => ({
        id: 'id-template-widget',

        detect: (lineText, lineNumber, fullText) =>
            IdTemplateWidgetDetector.detectTarget(lineText, lineNumber, fullText, designerSettingsRef.current),

        isSameTarget: IdTemplateWidgetDetector.isSameTarget,

        render(data, write) {
            const categoryLabel = CATEGORY_DEFINITIONS[data.category]?.label ?? data.category;
            const handleChange = (value: string) => write(IdTemplateWidgetDetector.formatWriteValue(value));

            return (
                <IdTemplateWidget
                    categoryLabel={categoryLabel}
                    idFieldName={data.idField}
                    initialValue={data.rawValue}
                    template={data.idSettings.template ?? ''}
                    placeHolderOptions={data.idSettings.placeHolderOptions ?? {}}
                    onChange={handleChange}
                />
            );
        },
    }), [designerSettingsRef]);
}
